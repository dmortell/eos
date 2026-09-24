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
	import { storeyMap } from './storeyMap'
	import { dashArray } from '../ui/annotations'
	import type { Model, Obj, Dir, Clip } from './types'

	let { model, adapt, frozen = [], dir = 'plan', cx = 0, cy = 0, ground = 0, defaultWeight = 1, selIds = [], canvasZoom = 1, clip = null, yaw = DEFAULT_YAW, pitch = DEFAULT_PITCH, showStoreys = undefined, paperMm = 1, pxMm = 0 }:
		{ model: Model; /** B31: dark model space colour mapping (ui/modelSpace.ts `onDark`) */ adapt?: (c: string) => string; /** VP Freeze: layer ids hidden in this viewport only */ frozen?: string[]; dir?: Dir; cx?: number; cy?: number; ground?: number; defaultWeight?: number; selIds?: string[]; canvasZoom?: number; clip?: Clip | null; yaw?: number; pitch?: number
			/** A building elevation showing only these storeys (a riser drawing's floors); undefined = all. */ showStoreys?: string[]
			/** Model mm per paper mm (the viewport's `paperMm`) — labels are sized on PAPER so they stay readable. */ paperMm?: number
			/** Model mm per SCREEN px (model-space tabs; 0 on a sheet): labels never shrink below ~12 px when zoomed out. */ pxMm?: number } = $props()
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
	// XP32: an object draws with its layer's line type (plan / elevation outlines; iso faces stay solid).
	const dashOf = (o: Obj) => dashArray(layerOf(o)?.dash, canvasZoom)
	const visible = (o: Obj) => { const l = layerOf(o); return (!l || l.visible) && !(o.layer && frozen.includes(o.layer)) }

	// Iso projects the model AROUND the ground pivot with a yaw/pitch, so the projected content isn't
	// symmetric about (0,0) — centring the pivot leaves the room off to one side. Instead centre the
	// iso content's OWN bounding box on the viewBox centre (cx,cy).
	const isoBox = $derived.by(() => (dir !== 'iso' ? null : isoBounds(model.objects, yaw, pitch, cx, cy, visible)))
	// BUILDING STOREYS (a building model is the source of truth for levels — drawings-plan): in an elevation each
	// storey's floor datum is a dashed line across the model's horizontal extent (+ a margin), named at its left.
	const STOREY_COL = '#94a3b8'
	// A riser drawing shows only SOME floors: hidden storeys collapse to a break gap (storeyMap.ts). `sm` maps a
	// model z to the drawn one; `mv` applies it to a projected elevation height (v = vs·z).
	const sm = $derived(dir !== 'plan' && dir !== 'iso' && model.storeys?.length && showStoreys ? storeyMap(model.storeys, showStoreys) : null)
	const vsOf = $derived(dir !== 'plan' && dir !== 'iso' ? BASIS[dir].vs : 1)
	const mv = (pts: { u: number; v: number }[]) => (sm ? pts.map((p) => ({ u: p.u, v: vsOf * sm!.map(vsOf * p.v) })) : pts)
	const inHiddenFloors = (o: Obj) => { if (!sm) return false; const b = objBounds(o); return sm.hidden(b.z0, b.z1) }
	const uSpan = $derived.by(() => {
		if (dir === 'plan' || dir === 'iso') return null
		const b = BASIS[dir]
		let u0 = Infinity, u1 = -Infinity
		for (const o of model.objects) { const bb = objBounds(o); for (const c of b.h === 'x' ? [bb.x0, bb.x1] : [bb.y0, bb.y1]) { u0 = Math.min(u0, b.hs * c); u1 = Math.max(u1, b.hs * c) } }
		return isFinite(u0) ? { u0: u0 - 1500, u1: u1 + 500 } : { u0: -1500, u1: 10500 }
	})
	// labels are ANNOTATIVE: a fixed size on paper (model mm = paper mm × paperMm), so a skyscraper's floor names
	// stay legible zoomed out; a name that would overlap the one below is dropped (every Nth floor is named)
	const LABEL_PAPER_MM = 2.2
	const labelH = $derived(Math.max(LABEL_PAPER_MM * (paperMm || 1), 12 * (pxMm || 0)))
	const storeyLines = $derived.by(() => {
		if (!uSpan || !model.storeys?.length) return []
		const b = BASIS[dir as keyof typeof BASIS], shown = [...(sm ? sm.shown : model.storeys)].sort((a, c) => a.z - c.z)
		let lastNamed = -Infinity
		return shown.map((s) => {
			const z = sm ? sm.map(s.z) : s.z, named = z - lastNamed >= labelH * 1.3
			if (named) lastNamed = z
			return { id: s.id, name: named ? s.name : '', v: b.vs * z, ...uSpan }
		})
	})
	// object names (e.g. an imported riser room): inside a box's top-left; at the top of anything else
	const objLabels = $derived.by(() => {
		if (dir === 'iso') return []
		const out: { id: string; text: string; u: number; v: number }[] = []
		for (const o of model.objects) {
			if (!o.label || !visible(o) || inHiddenFloors(o)) continue
			const pts = project(o, dir, yaw, pitch, cx, cy).flatMap((s) => mv(s.pts))
			if (!pts.length) continue
			const u0 = Math.min(...pts.map((p) => p.u)), vTop = Math.max(...pts.map((p) => p.v))
			out.push({ id: o.id ?? '', text: o.label, u: u0 + labelH * 0.3, v: o.type === 'prism' ? vTop - labelH * 1.2 : vTop + labelH * 0.4 })
		}
		return out
	})
	// a zigzag across each collapsed run of floors (the Risers tool's compression break)
	const breakMarks = $derived.by(() => {
		if (!sm || !uSpan) return []
		return sm.gaps.map((g) => {
			const pts: string[] = [], mid = (g.z0 + g.z1) / 2, amp = (g.z1 - g.z0) / 4
			for (let u = uSpan.u0, i = 0; u <= uSpan.u1; u += 400, i++) pts.push(`${u},${vsOf * (mid + (i % 2 ? amp : -amp))}`)
			return pts.join(' ')
		})
	})
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
	{#each storeyLines as s (s.id)}
		{@const col = adapt ? adapt(STOREY_COL) : STOREY_COL}
		<line x1={s.u0} y1={s.v} x2={s.u1} y2={s.v} stroke={col} stroke-width={1 / (canvasZoom || 1)} stroke-dasharray={dashArray('dashed', canvasZoom)} vector-effect="non-scaling-stroke" />
		<!-- the group is y-flipped (v up): flip the name back upright, just above the line -->
		{#if s.name}<text transform="translate({s.u0} {s.v + labelH * 0.3}) scale(1 -1)" font-size={labelH} fill={col} class="storey-name">{s.name}</text>{/if}
	{/each}
	{#each objLabels as l (l.id)}
		<text transform="translate({l.u} {l.v}) scale(1 -1)" font-size={labelH} fill={adapt ? adapt('#475569') : '#475569'} class="storey-name">{l.text}</text>
	{/each}
	{#each breakMarks as pts, i (i)}
		<polyline points={pts} fill="none" stroke={adapt ? adapt(STOREY_COL) : STOREY_COL} stroke-width={1 / (canvasZoom || 1)} vector-effect="non-scaling-stroke" />
	{/each}
	<!-- Pass 1: everything except openings. Under a section clip each object is TRIMMED to the box (a
	     true cut — walls/conduits keep only the segments inside), not just AABB-culled. -->
	{#each model.objects as o (o.id)}
		{@const to = clip ? trimToClip(o, clip) : o}
		{#if to && visible(o) && !isOpening(o) && !inHiddenFloors(o)}
			{@const col = colorOf(o)}
			{@const lw = weightOf(o)}
			{#each project(to, dir, yaw, pitch, cx, cy) as s, i (i)}
				{#if s.closed}
					<polygon points={mv(s.pts).map((p) => `${p.u},${p.v}`).join(' ')} fill="none" stroke={col} stroke-width={lw} stroke-dasharray={dashOf(o)} vector-effect="non-scaling-stroke" />
				{:else}
					<polyline points={mv(s.pts).map((p) => `${p.u},${p.v}`).join(' ')} fill="none" stroke={col} stroke-width={lw} stroke-dasharray={dashOf(o)} vector-effect="non-scaling-stroke" />
				{/if}
			{/each}
		{/if}
	{/each}
	<!-- Pass 2: openings ON TOP — a paper-coloured fill masks the wall behind (a real hole), then a
	     solid frame outlines the door/window. Painted after pass 1 so it cuts through the wall lines. -->
	{#each model.objects as o (o.id)}
		{@const to = clip ? trimToClip(o, clip) : o}
		{#if to && visible(o) && isOpening(o) && !inHiddenFloors(o)}
			{@const col = colorOf(o)}
			{@const lw = weightOf(o)}
			{#each project(to, dir, yaw, pitch, cx, cy) as s, i (i)}
				<polygon points={mv(s.pts).map((p) => `${p.u},${p.v}`).join(' ')} class="hole" stroke={col} stroke-width={lw} vector-effect="non-scaling-stroke" />
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
	.storey-name { font-family: Consolas, monospace; pointer-events: none; }
	/* opening = a real hole: fill with the drawing (paper) colour — white — to erase the wall behind it,
	   then the frame stroke outlines the door/window. `--vp-paper` = white on a sheet, dark in model space (B31). */
	.m3d :global(polygon.hole) { fill: var(--vp-paper, #fff); }
	/* iso solid faces: opaque paper colour so a nearer face (painted later) hides what's behind it. */
	.m3d :global(polygon.face) { fill: var(--vp-paper, #fff); }
</style>
