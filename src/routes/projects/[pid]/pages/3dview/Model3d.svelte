<script lang="ts">
	// Renders a 3D MODEL into a Pages viewport using the ported model3d projection.
	// model3d's project() returns {u, v} with v = height/depth UP (origin bottom-left). Pages draws in
	// model mm with y DOWN, elevations measured DOWN from GROUND and horizontally re-centred (elevU).
	// We reconcile with ONE per-direction affine group transform (computed here) instead of touching
	// the pure engine:
	//   • plan: (u,v) = (x,y) already matches Pages' y-down plan → identity.
	//   • elevation: v-up → GROUND−v (scale(1,-1)+translate y=GROUND); horizontal shifted so it lands on
	//     Pages' elevU centring (front 0, rear 2·cx, right cx−cy, left cx+cy).
	//   • iso: deferred (P1c) — the viewport keeps the mock iso for now.
	// Line thickness is NON-SCALING (constant screen px, `vector-effect`) and LAYER-DEFINED (each layer's
	// `weight`), so lineweight is a paper property independent of the drawing scale/zoom.
	import { project, objBounds, faces3d, isoR, isoDepthR, trimToClip, doorGeom, isoBounds, viewMap, DEFAULT_YAW, DEFAULT_PITCH } from './projection'
	import { BASIS } from './types'
	import type { Model, Obj, Dir, Clip } from './types'

	let { model, adapt, frozen = [], dir = 'plan', cx = 0, cy = 0, ground = 0, defaultWeight = 1, selIds = [], canvasZoom = 1, clip = null, yaw = DEFAULT_YAW, pitch = DEFAULT_PITCH }:
		{ model: Model; /** B31: dark model space colour mapping (ui/modelSpace.ts `onDark`) */ adapt?: (c: string) => string; /** VP Freeze: layer ids hidden in this viewport only */ frozen?: string[]; dir?: Dir; cx?: number; cy?: number; ground?: number; defaultWeight?: number; selIds?: string[]; canvasZoom?: number; clip?: Clip | null; yaw?: number; pitch?: number } = $props()
	// Plan/elevation use a true section cut (`trimToClip`, applied per object in the render passes below):
	// walls/conduits keep only the segments inside the box, prisms pass through whole. This AABB-overlap
	// test is kept only for the iso pass (a quick cull; iso normally has no clip).
	const inClip = (o: Obj) => { if (!clip) return true; const b = objBounds(o); return b.x1 >= clip.x0 && b.x0 <= clip.x1 && b.y1 >= clip.y0 && b.y0 <= clip.y1 }

	const SEL = '#f59e0b'   // selection highlight (amber — distinct from the teal trunk layer)
	const layerOf = (o: Obj) => model.layers?.find((l) => l.id === o.layer)
	const isOpening = (o: Obj) => !!layerOf(o)?.opening   // objects on an "opening" layer cut the wall
	const isSel = (o: Obj) => !!o.id && selIds.includes(o.id)
	const colorOf = (o: Obj) => { const c = isSel(o) ? SEL : layerOf(o)?.color ?? '#475569'; return adapt ? adapt(c) : c }
	// screen px (non-scaling-stroke cancels SVG transforms; ÷ canvasZoom cancels the ancestor CSS canvas
	// zoom too, so the lineweight is a constant screen-px value — matching how entities render).
	const weightOf = (o: Obj) => ((isSel(o) ? (layerOf(o)?.weight ?? defaultWeight) + 1.2 : layerOf(o)?.weight ?? defaultWeight) / (canvasZoom || 1))
	const visible = (o: Obj) => { const l = layerOf(o); return (!l || l.visible) && !(o.layer && frozen.includes(o.layer)) }

	// Iso projects the model AROUND the ground pivot with a yaw/pitch, so the projected content isn't
	// symmetric about (0,0) — centring the pivot leaves the room off to one side. Instead centre the
	// iso content's OWN bounding box on the viewBox centre (cx,cy).
	const isoBox = $derived.by(() => (dir !== 'iso' ? null : isoBounds(model.objects, yaw, pitch, cx, cy, visible)))
	// Iso SOLID / hidden-line render: every visible object's 3D faces, projected and sorted back-to-front
	// (painter's algorithm) so nearer faces paint over farther ones — a filled white face occludes what's
	// behind it. Replaces the old wireframe iso. Openings are skipped (a true 3D boolean hole is future
	// work; in iso the wall reads solid). Selected objects keep their amber stroke.
	// Flat (two-sided Lambert) shade for a face, from its WORLD normal · a fixed up-front light. Top faces
	// read lightest, sides darker — so the solid iso has depth instead of a flat white silhouette. `abs`
	// keeps it independent of face winding (faces3d isn't guaranteed outward), with an ambient floor.
	const hexRgb = (h: string): [number, number, number] | null => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
	function faceShade(pts: { x: number; y: number; z: number }[], col: string): string {
		const a = pts[0], b = pts[1], c = pts[2]
		let nx = (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y)
		let ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z)
		let nz = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
		const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl
		const t = Math.abs(nx * 0.32 + ny * -0.32 + nz * 0.89)   // light from up / front — 0..1
		const sf = 0.72 + 0.28 * t                               // brightness: side 0.72 .. top 1.0
		const rgb = hexRgb(col)
		if (!rgb) { const L = Math.round(255 * (0.66 + 0.32 * t)); return `rgb(${L},${L},${L})` }
		const k = 0.2, mix = (v: number) => Math.round((v * k + 255 * (1 - k)) * sf)   // a light tint of the layer colour, then shaded
		return `rgb(${mix(rgb[0])},${mix(rgb[1])},${mix(rgb[2])})`
	}
	const isoFaces = $derived.by(() => {
		if (dir !== 'iso') return []
		const out: { pts: { u: number; v: number }[]; depth: number; col: string; lw: number; shade: string }[] = []
		for (const o of model.objects) {
			if (!visible(o) || !inClip(o) || isOpening(o)) continue
			const col = colorOf(o), lw = weightOf(o)
			for (const f of faces3d(o)) {
				if (f.pts.length < 3) continue
				let d = 0
				for (const p of f.pts) d += isoDepthR(p, yaw, pitch, cx, cy)
				out.push({ pts: f.pts.map((p) => isoR(p, yaw, pitch, cx, cy)), depth: d / f.pts.length, col, lw, shade: faceShade(f.pts, col) })
			}
		}
		out.sort((a, b) => b.depth - a.depth)   // farthest first; nearer faces paint on top
		return out
	})
	// Project a model point for the current dir: plan/elevation via the BASIS table, iso via the orbit
	// camera. Lets us draw custom opening geometry (door swing / window glazing) the engine's project()
	// doesn't emit, in the same drawing space as everything else.
	const projPt = (d: Dir, p: { x: number; y: number; z: number }) =>
		d === 'iso' ? isoR(p, yaw, pitch, cx, cy) : { u: BASIS[d].hs * p[BASIS[d].h], v: BASIS[d].vs * p[BASIS[d].v] }
	// A door's leaf + swing arc, or a window's glazing line, as projected polylines. Drawn in PLAN and
	// ISO (on the floor at the opening's base z); elevation shows only the masked gap. Hinge sits at one
	// jamb (flipped by `flip`), radius = the door width (the opening's long footprint dimension), swept
	// from the wall (closed) to `swing`° open. (Mirrors the Sheets door annotation, made parametric.)
	function openingExtras(o: Obj, d: Dir): { u: number; v: number }[][] {
		if (o.type !== 'prism' || (o.open !== 'door' && o.open !== 'window') || (d !== 'plan' && d !== 'iso')) return []
		const cxf = o.x + o.w / 2, cyf = o.y + o.d / 2, z = o.z, alongX = o.w >= o.d
		const rot = (p: { x: number; y: number; z: number }) => {
			if (!o.rot) return p
			const a = (o.rot * Math.PI) / 180, s = Math.sin(a), c = Math.cos(a), dx = p.x - cxf, dy = p.y - cyf
			return { x: cxf + dx * c - dy * s, y: cyf + dx * s + dy * c, z: p.z }
		}
		const P = (x: number, y: number) => projPt(d, rot({ x, y, z }))
		if (o.open === 'window') {
			return alongX ? [[P(o.x, cyf), P(o.x + o.w, cyf)]] : [[P(cxf, o.y), P(cxf, o.y + o.d)]]
		}
		// Door: hinge sits at ONE JAMB on the wall centreline (not a face corner), radius = the door width
		// (the opening's along-wall span). `flip` = hinge side; the leaf sweeps `swing`° from closed (along
		// the wall) to open (perpendicular). Keep this convention in sync with Viewport's swing grip.
		const g = doorGeom(o)
		const at = (a: number) => P(g.hx + g.L * (Math.cos(a) * g.ux + Math.sin(a) * g.vx), g.hy + g.L * (Math.cos(a) * g.uy + Math.sin(a) * g.vy))
		const swing = (o.swing ?? 90) * Math.PI / 180
		const leaf = [P(g.hx, g.hy), at(swing)]
		const arc: { u: number; v: number }[] = []
		for (let i = 0; i <= 12; i++) arc.push(at(swing * (1 - i / 12)))
		return [leaf, arc]
	}
	// R7: the engine → drawing mapping is `viewMap` (projection.ts) — the SAME one hit/grips/snap pick with.
	const xform = $derived(viewMap(dir, cx, cy, ground, yaw, pitch, isoBox).xform)
</script>

<g class="m3d" transform={xform}>
	{#if dir === 'iso'}
	<!-- Solid iso (hidden-line): depth-sorted white faces; nearer faces occlude farther ones. -->
	{#each isoFaces as f, i (i)}
		<polygon points={f.pts.map((p) => `${p.u},${p.v}`).join(' ')} class="face" style:fill={f.shade} stroke={f.col} stroke-width={f.lw} vector-effect="non-scaling-stroke" />
	{/each}
	<!-- Openings in 3D: draw the frame outline (on top of the wall face) + a door's floor swing, so a
	     door/window reads on the model even without a true CSG hole. -->
	{#each model.objects as o (o.id)}
		{#if visible(o) && inClip(o) && isOpening(o)}
			{@const col = colorOf(o)}
			{@const lw = weightOf(o)}
			{#each project(o, 'iso', yaw, pitch, cx, cy) as s, i (i)}
				<polyline points={s.pts.map((p) => `${p.u},${p.v}`).join(' ')} fill="none" stroke={col} stroke-width={lw} vector-effect="non-scaling-stroke" />
			{/each}
			{#each openingExtras(o, 'iso') as pl, i (`x${i}`)}
				<polyline points={pl.map((p) => `${p.u},${p.v}`).join(' ')} fill="none" stroke={col} stroke-width={lw} vector-effect="non-scaling-stroke" />
			{/each}
		{/if}
	{/each}
	{:else}
	<!-- Pass 1: everything except openings. Under a section clip each object is TRIMMED to the box (a
	     true cut — walls/conduits keep only the segments inside), not just AABB-culled. -->
	{#each model.objects as o (o.id)}
		{@const to = clip ? trimToClip(o, clip) : o}
		{#if to && visible(o) && !isOpening(o)}
			{@const col = colorOf(o)}
			{@const lw = weightOf(o)}
			{#each project(to, dir, yaw, pitch, cx, cy) as s, i (i)}
				{#if s.closed}
					<polygon points={s.pts.map((p) => `${p.u},${p.v}`).join(' ')} fill="none" stroke={col} stroke-width={lw} vector-effect="non-scaling-stroke" />
				{:else}
					<polyline points={s.pts.map((p) => `${p.u},${p.v}`).join(' ')} fill="none" stroke={col} stroke-width={lw} vector-effect="non-scaling-stroke" />
				{/if}
			{/each}
		{/if}
	{/each}
	<!-- Pass 2: openings ON TOP — a paper-coloured fill masks the wall behind (a real hole), then a
	     solid frame outlines the door/window. Painted after pass 1 so it cuts through the wall lines. -->
	{#each model.objects as o (o.id)}
		{@const to = clip ? trimToClip(o, clip) : o}
		{#if to && visible(o) && isOpening(o)}
			{@const col = colorOf(o)}
			{@const lw = weightOf(o)}
			{#each project(to, dir, yaw, pitch, cx, cy) as s, i (i)}
				<polygon points={s.pts.map((p) => `${p.u},${p.v}`).join(' ')} class="hole" stroke={col} stroke-width={lw} vector-effect="non-scaling-stroke" />
			{/each}
			<!-- Pass 3: door swing / window glazing on top of the gap (plan only; elevation shows the gap). -->
			{#each openingExtras(to, dir) as pl, i (`x${i}`)}
				<polyline points={pl.map((p) => `${p.u},${p.v}`).join(' ')} fill="none" stroke={col} stroke-width={lw} vector-effect="non-scaling-stroke" />
			{/each}
		{/if}
	{/each}
	{/if}
</g>

<style>
	.m3d :global(polygon), .m3d :global(polyline) { stroke-linejoin: round; }
	/* opening = a real hole: fill with the drawing (paper) colour — white — to erase the wall behind it,
	   then the frame stroke outlines the door/window. `--vp-paper` = white on a sheet, dark in model space (B31). */
	.m3d :global(polygon.hole) { fill: var(--vp-paper, #fff); }
	/* iso solid faces: opaque paper colour so a nearer face (painted later) hides what's behind it. */
	.m3d :global(polygon.face) { fill: var(--vp-paper, #fff); }
</style>
