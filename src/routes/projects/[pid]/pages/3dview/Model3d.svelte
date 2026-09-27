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
	import { project, objBounds, faces3d, openingCuts, prismPanels, cutsAWall, isoR, isoDepthR, trimToClip, trimToOClip, doorGeom, isoBounds, viewMap, DEFAULT_YAW, DEFAULT_PITCH, type Persp, type ProjDir } from './projection'
	import { BASIS } from './types'
	import { frameOf, frameAxis, dotT, dotN, type ElevDir, type ElevFrame } from '../ui/geometry'
	import { storeyMap } from './storeyMap'
	import { hiddenLines, lookNegOf } from './hiddenLines'
	import { fillLabel, fillTone, conduitFill } from './fill'
	import { dashArray } from '../ui/annotations'
	import { strokePx, resolveLw, SCREEN_PX_PER_MM } from '../ui/lineweight'
	import type { Model, Obj, Dir, Clip, OClip } from './types'

	let { model, adapt, frozen = [], dir = 'plan', cx = 0, cy = 0, ground = 0, defaultWeight = 1, selIds = [], canvasZoom = 1, clip = null, frame = null, oclip = null, yaw = DEFAULT_YAW, pitch = DEFAULT_PITCH, persp = null, wire = false, showStoreys = undefined, paperMm = 1, pxMm = 0, hideHidden = false, mono = false, zBand = null, lwt = undefined, lwPxPerMm = undefined }:
		{ model: Model; /** B31: dark model space colour mapping (ui/modelSpace.ts `onDark`) */ adapt?: (c: string) => string; /** VP Freeze: layer ids hidden in this viewport only */ frozen?: string[]; dir?: Dir; cx?: number; cy?: number; ground?: number; defaultWeight?: number; selIds?: string[]; canvasZoom?: number; clip?: Clip | null
			/** Phase 2 (elevation-section-plan.md): an elevation's explicit VIEW FRAME (an oblique section / elevation —
			 *  it replaces `dir`'s axis) and its ORIENTED clip (replaces `clip`). null = the four-dir view as before. */
			frame?: ElevFrame | null; oclip?: OClip | null
			yaw?: number; pitch?: number; /** the perspective camera (iso) — 3dview/projection perspCam; null = parallel */ persp?: Persp; /** iso: edges only (a wireframe), no solid faces */ wire?: boolean
			/** A building elevation showing only these storeys (a riser drawing's floors); undefined = all. */ showStoreys?: string[]
			/** Model mm per paper mm (the viewport's `paperMm`) — labels are sized on PAPER so they stay readable. */ paperMm?: number
			/** Model mm per SCREEN px (model-space tabs; 0 on a sheet): labels never shrink below ~12 px when zoomed out. */ pxMm?: number
			/** I2: plan / elevation hidden-line removal (nearer faces hide what's behind), and black-and-white. */ hideHidden?: boolean; mono?: boolean
			/** I1: a plan's CUT band — only objects reaching into z0..z1 show (e.g. one floor, slab to slab). */ zBand?: { z0: number; z1: number } | null
			/** Lineweights (ui/lineweight): the LWT toggle and the viewport's px per paper mm — given, lines draw at their
			 *  layer's mm weight like 2D shapes; undefined = the layer's px weight (the old look). */ lwt?: boolean; lwPxPerMm?: number } = $props()
	// Plan/elevation use a true section cut (`trimToClip`, applied per object in the render passes below):
	// walls/conduits keep only the segments inside the box, prisms pass through whole. This AABB-overlap
	// test is kept only for the iso pass (a quick cull; iso normally has no clip).
	const inClip = (o: Obj) => { if (!clip) return true; const b = objBounds(o); return b.x1 >= clip.x0 && b.x0 <= clip.x1 && b.y1 >= clip.y0 && b.y0 <= clip.y1 }
	// The section cut for plan / elevation passes: an explicit frame's ORIENTED clip, else the axis clip, else none.
	const trim = (o: Obj): Obj | null => (oclip ? trimToOClip(o, oclip) : clip ? trimToClip(o, clip) : o)
	// THE VIEW FRAME (elevation-section-plan.md phase 2): an elevation projects through `frame` when given (an oblique
	// view), else `dir`'s own axis-aligned frame — `pd` is what `project` / `viewMap` take (the dir itself when no frame,
	// so every existing view runs the unchanged path), `fr` the frame the local helpers dot with.
	const isElevDir = $derived(dir !== 'plan' && dir !== 'iso')
	const pd = $derived<ProjDir>(isElevDir && frame ? frame : dir)
	const fr = $derived(isElevDir ? (frame ?? frameOf(dir as ElevDir)) : null)
	// the rack FACE this view looks at (a one-face device shows only there): front / rear by the frame's t (+x / −x);
	// none for a side or oblique view (every device shows)
	const faceDir = $derived(!fr || frameAxis(fr) !== 0 ? null : fr.t[0] > 0 ? 'front' : 'rear')

	const SEL = '#f59e0b'   // selection highlight (amber — distinct from the teal trunk layer)
	const layerOf = (o: Obj) => model.layers?.find((l) => l.id === o.layer)
	const isOpening = (o: Obj) => !!layerOf(o)?.opening   // objects on an "opening" layer cut the wall
	const isSel = (o: Obj) => !!o.id && selIds.includes(o.id)
	const colorOf = (o: Obj) => { const c = isSel(o) ? SEL : mono ? '#000000' : o.color ?? layerOf(o)?.color ?? '#475569'; return adapt ? adapt(c) : c }
	// screen px (non-scaling-stroke cancels SVG transforms; ÷ canvasZoom cancels the ancestor CSS canvas
	// zoom too, so the lineweight is a constant screen-px value — matching how entities render).
	// the stroke of an object's lines: with `lwt` given (a Pages viewport), its LAYER's lineweight in paper mm through the
	// same rule as 2D shapes (ui/lineweight strokePx: true width with LWT on, a hairline with it off); else the layer's
	// px weight as before. A selected object draws a little heavier.
	const baseW = (o: Obj) => (lwt == null ? (layerOf(o)?.weight ?? defaultWeight) / (canvasZoom || 1) : strokePx(resolveLw({}, layerOf(o)), { lwt, pxPerMm: lwPxPerMm ?? SCREEN_PX_PER_MM, canvasZoom }))
	const weightOf = (o: Obj) => baseW(o) + (isSel(o) ? 1.2 / (canvasZoom || 1) : 0)
	// XP32: an object draws with its layer's line type (plan / elevation outlines; iso faces stay solid).
	const dashOf = (o: Obj) => dashArray(layerOf(o)?.dash, canvasZoom)
	// G4: a rack device mounted on ONE face only shows in that face's elevation (front / rear)
	const onFace = (o: Obj) => { const m = o.device?.mount; return !m || m === 'both' || !faceDir || m === faceDir }
	// I1: in plan, an object entirely above / below the cut band is not drawn
	const inBand = (o: Obj) => { if (!zBand || dir !== 'plan') return true; const b = objBounds(o); return b.z1 > zBand.z0 && b.z0 < zBand.z1 }
	const visible = (o: Obj) => { const l = layerOf(o); return (!l || l.visible) && !(o.layer && frozen.includes(o.layer)) && onFace(o) && inBand(o) }
	// G4: a rack's RU numbers down its left rail in the front / rear elevation (1 at the bottom, like the Racks tool)
	const RU = 45, RAIL = 40
	const ruMarks = $derived.by(() => {
		if (!faceDir || !fr) return []   // a front / rear-facing view only (not a side or oblique one)
		const f = fr, out: { id: string; u: number; v: number; n: number }[] = []
		for (const o of model.objects) {
			if (o.type !== 'prism' || !o.rack || !visible(o)) continue
			const uL = Math.min(dotT(f, o.x, o.y), dotT(f, o.x + o.w, o.y))   // the rack's face edges (unrotated)
			for (let n = 1; n <= o.rack.u; n++) out.push({ id: `${o.id}-${n}`, u: uL + 22, v: vsOf * (o.z + RAIL + (n - 1) * RU + 12), n })
		}
		return out
	})

	// Iso projects the model AROUND the ground pivot with a yaw/pitch, so the projected content isn't
	// symmetric about (0,0) — centring the pivot leaves the room off to one side. Instead centre the
	// iso content's OWN bounding box on the viewBox centre (cx,cy).
	const isoBox = $derived.by(() => (dir !== 'iso' ? null : isoBounds(model.objects, yaw, pitch, cx, cy, visible, persp)))
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
		if (!fr) return null
		const f = fr
		let u0 = Infinity, u1 = -Infinity
		for (const o of model.objects) { const bb = objBounds(o); for (const [x, y] of [[bb.x0, bb.y0], [bb.x1, bb.y1], [bb.x0, bb.y1], [bb.x1, bb.y0]]) { const u = dotT(f, x, y); u0 = Math.min(u0, u); u1 = Math.max(u1, u) } }
		return isFinite(u0) ? { u0: u0 - 1500, u1: u1 + 500 } : { u0: -1500, u1: 10500 }
	})
	// labels are ANNOTATIVE: a fixed size on paper (model mm = paper mm × paperMm); in model space never below
	// ~12 screen px so a skyscraper's floor names stay legible zoomed out
	const LABEL_PAPER_MM = 2.2
	const labelH = $derived(Math.max(LABEL_PAPER_MM * (paperMm || 1), 12 * (pxMm || 0)))
	const storeyLines = $derived.by(() => {
		if (!uSpan || !model.storeys?.length) return []
		const shown = sm ? sm.shown : model.storeys
		const lines = shown.map((s) => ({ id: s.id, name: s.name, v: vsOf * (sm ? sm.map(s.z) : s.z), ...uSpan }))
		// the ROOF: above the top floor's soffit by a slab (its own slab thickness)
		const top = [...model.storeys].sort((a, c) => c.z - a.z)[0]
		const zr = top.z + (top.ceilingSlab ?? 3600) + (top.slab ?? 200)
		lines.push({ id: 'roof', name: 'RF', v: vsOf * (sm ? sm.map(zr) : zr), ...uSpan })
		return lines
	})
	// F10: a conduit carrying cables is labelled in PLAN with its fill ("12 C6A · 37%") at its longest segment's
	// middle, coloured green / amber / red
	const fillLabels = $derived.by(() => {
		if (dir !== 'plan') return []
		const out: { id: string; text: string; x: number; y: number; col: string }[] = []
		for (const o of model.objects) {
			if (o.type !== 'conduit' || !visible(o) || !o.cables?.length) continue
			const text = fillLabel(o); if (!text) continue
			const at = new Map(o.nodes.map((n) => [n.id, n])); let best: [number, number] | null = null, bl = -1
			for (const s of o.segments) { const a = at.get(s.a), b = at.get(s.b); if (!a || !b) continue; const l = Math.hypot(b.x - a.x, b.y - a.y); if (l > bl) { bl = l; best = [(a.x + b.x) / 2, (a.y + b.y) / 2] } }
			if (best) out.push({ id: o.id ?? '', text, x: best[0], y: best[1] - labelH * 0.6, col: fillTone(conduitFill(o)) })
		}
		return out
	})
	// A LABELLED BOX (e.g. an imported riser room "IDF01-A") is its true-size rect with the name centred in it —
	// one object, so they move / hide / collapse together. Other labelled objects are named at their top.
	const objLabels = $derived.by(() => {
		if (dir === 'iso') return []
		const out: { id: string; text: string; u: number; v: number; mid?: boolean }[] = []
		for (const o of model.objects) {
			if (!o.label || !visible(o) || inHiddenFloors(o)) continue
			const pts = project(o, pd, yaw, pitch, cx, cy, persp).flatMap((s) => mv(s.pts))
			if (!pts.length) continue
			const us = pts.map((p) => p.u), vs = pts.map((p) => p.v)
			// an elevation's group is v-UP (the text is flipped back upright); the plan is y-down as is
			const up = dir !== 'plan', s = up ? -1 : 1
			// a box — and a rack in PLAN (Dave) — has its name centred in it; a rack's elevation keeps it above (its face holds the devices)
			if (o.type === 'prism' && (!o.rack || dir === 'plan')) out.push({ id: o.id ?? '', text: o.label, u: (Math.min(...us) + Math.max(...us)) / 2, v: (Math.min(...vs) + Math.max(...vs)) / 2 + s * labelH * 0.35, mid: true })
			else out.push({ id: o.id ?? '', text: o.label, u: Math.min(...us) + labelH * 0.3, v: up ? Math.max(...vs) + labelH * 0.4 : Math.min(...vs) - labelH * 0.4 })
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
	// every shown opening's hole (walls AND furniture it runs through), and which openings actually cut a wall (only those
	// are drawn as a masked hole in plan / elevation — a desk's leg space is not a hole in the drawing)
	const allCuts = $derived(openingCuts(model.objects, (o) => isOpening(o) && visible(o)))
	const wallHoles = $derived(new Set(model.objects.filter((o) => o.id && isOpening(o) && visible(o) && o.type === 'prism' && cutsAWall(openingCuts([o], () => true)[0], model.objects)).map((o) => o.id!)))
	const isoFaces = $derived.by(() => {
		if (dir !== 'iso' || wire) return []   // a wireframe draws edges instead (below)
		const out: { pts: { u: number; v: number }[]; depth: number; col: string; lw: number; shade: string }[] = []
		const cuts = openingCuts(model.objects, (o) => isOpening(o) && visible(o) && inClip(o))   // OpenCad-style: openings cut real holes in walls
		for (const o of model.objects) {
			if (!visible(o) || !inClip(o) || isOpening(o)) continue
			const col = colorOf(o), lw = weightOf(o)
			for (const f of faces3d(o, cuts)) {   // walls come with their openings as real holes
				if (f.pts.length < 3) continue
				let d = 0
				for (const p of f.pts) d += isoDepthR(p, yaw, pitch, cx, cy, persp)
				out.push({ pts: f.pts.map((p) => isoR(p, yaw, pitch, cx, cy, persp)), depth: d / f.pts.length, col, lw, shade: faceShade(f.pts, col) })
			}
		}
		out.sort((a, b) => b.depth - a.depth)   // farthest first; nearer faces paint on top
		return out
	})
	// Project a model point for the current dir: plan (x, y), an elevation via its view frame (x·t, z up — the
	// engine's project()), iso via the orbit camera. Lets us draw custom opening geometry (door swing / window
	// glazing) the engine's project() doesn't emit, in the same drawing space as everything else.
	const projPt = (d: Dir, p: { x: number; y: number; z: number }) =>
		d === 'iso' ? isoR(p, yaw, pitch, cx, cy, persp) : d === 'plan' ? { u: p.x, v: p.y } : { u: dotT(d === dir && fr ? fr : frameOf(d), p.x, p.y), v: p.z }
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
	// I2: plan / elevation HIDDEN-LINE removal — every face projected orthographically, painted farthest first in the
	// paper colour, so a nearer face hides the lines behind it (the iso solid render's painter's algorithm, flat).
	// `far` = distance away from the viewer: plan looks down (−z), front along +y, rear −y, right −x, left +x.
	// (an elevation's = the view frame's origin-free depth x·n — an oblique frame's too)
	const far = (p: { x: number; y: number; z: number }) => dir === 'plan' || !fr ? -p.z : dotN(fr, p.x, p.y)
	const hlFaces = $derived.by(() => {
		if (!hideHidden || dir !== 'plan') return []   // (an elevation: exact hidden lines, `hlLines` below)
		const out: { pts: { u: number; v: number }[]; depth: number; col: string; lw: number }[] = []
		for (const o of model.objects) {
			if (!visible(o) || isOpening(o) || inHiddenFloors(o)) continue
			const to = trim(o); if (!to) continue
			const col = colorOf(o), lw = weightOf(o)
			for (const f of faces3d(to)) {
				if (f.pts.length < 3) continue
				let d = 0; for (const p of f.pts) d += far(p)
				out.push({ pts: mv(f.pts.map((p) => projPt(dir, p))), depth: d / f.pts.length, col, lw })
			}
		}
		return out.sort((a, b) => b.depth - a.depth)
	})
	// Phase 6 (elevation-section-plan.md): an ELEVATION / SECTION's hidden lines are exact (3dview/hiddenLines.ts) — each
	// object's visible edges, clipped by every nearer face, walls built with their openings as real holes (so what is
	// behind a wall shows through its door / window). Any frame (the four dirs or an oblique one). Openings themselves
	// aren't masked or outlined here: the wall panels' edges draw the hole. Fills (paper colour, under all the lines)
	// keep an underlay from showing through the model, as the painted render did.
	const hlLines = $derived.by(() => {
		if (!hideHidden || !fr) return []
		const objs: Obj[] = [], src: Obj[] = []
		for (const o of model.objects) { if (!visible(o) || isOpening(o) || inHiddenFloors(o)) continue; const to = trim(o); if (to) { objs.push(to); src.push(o) } }
		return hiddenLines(objs, fr, allCuts, lookNegOf(oclip)).map((r, i) => ({ o: src[i], d: r.segs.map((s) => mv([{ u: s[0], v: s[1] }, { u: s[2], v: s[3] }])).map(([a, b]) => `M${a.u},${a.v}L${b.u},${b.v}`).join(''),
			fill: r.fills.map((pts) => `M${mv(pts).map((p) => `${p.u},${p.v}`).join('L')}Z`).join('') }))
	})
	// R7: the engine → drawing mapping is `viewMap` (projection.ts) — the SAME one hit/grips/snap pick with.
	const xform = $derived(viewMap(pd, cx, cy, ground, yaw, pitch, isoBox, persp).xform)
</script>

<g class="m3d" transform={xform}>
	{#if dir === 'iso'}
	<!-- Solid iso (hidden-line): depth-sorted white faces; nearer faces occlude farther ones. -->
	{#each isoFaces as f, i (i)}
		<polygon points={f.pts.map((p) => `${p.u},${p.v}`).join(' ')} class="face" style:fill={f.shade} stroke={f.col} stroke-width={f.lw} vector-effect="non-scaling-stroke" />
	{/each}
	<!-- WIRE: every edge of every object, no faces (see-through; the 3D popout's WIRE) -->
	{#if wire}
		{#each model.objects as o (o.id)}
			{#if visible(o) && inClip(o) && !isOpening(o) && !inHiddenFloors(o)}
				{#each project(o, 'iso', yaw, pitch, cx, cy, persp) as s, i (i)}
					<polyline points={s.pts.map((p) => `${p.u},${p.v}`).join(' ')} fill="none" stroke={colorOf(o)} stroke-width={weightOf(o)} vector-effect="non-scaling-stroke" />
				{/each}
			{/if}
		{/each}
	{/if}
	<!-- Openings in 3D: draw the frame outline (on top of the wall face) + a door's floor swing, so a
	     door/window reads on the model even without a true CSG hole. -->
	{#each model.objects as o (o.id)}
		{#if visible(o) && inClip(o) && isOpening(o)}
			{@const col = colorOf(o)}
			{@const lw = weightOf(o)}
			{#each project(o, 'iso', yaw, pitch, cx, cy, persp) as s, i (i)}
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
		{@const o = model.objects.find((x) => x.id === l.id)}
		<text transform="translate({l.u} {l.v}) scale(1 {dir === 'plan' ? 1 : -1})" font-size={labelH} text-anchor={l.mid ? 'middle' : 'start'}
			fill={l.mid && o ? colorOf(o) : adapt ? adapt('#475569') : '#475569'} class="storey-name">{l.text}</text>
	{/each}
	{#each ruMarks as r (r.id)}
		<text transform="translate({r.u} {r.v}) scale(1 -1)" font-size="22" text-anchor="middle" fill={adapt ? adapt('#94a3b8') : '#94a3b8'} class="storey-name">{r.n}</text>
	{/each}
	{#each fillLabels as l (l.id)}
		<text x={l.x} y={l.y} font-size={labelH} text-anchor="middle" fill={l.col} font-weight="600" class="storey-name">{l.text}</text>
	{/each}
	{#each breakMarks as pts, i (i)}
		<polyline points={pts} fill="none" stroke={adapt ? adapt(STOREY_COL) : STOREY_COL} stroke-width={1 / (canvasZoom || 1)} vector-effect="non-scaling-stroke" />
	{/each}
	<!-- Pass 1: everything except openings. Under a section clip each object is TRIMMED to the box (a
	     true cut — walls/conduits keep only the segments inside), not just AABB-culled. -->
	{#if hideHidden}
		{#each hlFaces as f, i (i)}
			<polygon points={f.pts.map((p) => `${p.u},${p.v}`).join(' ')} class="hl" style="fill: var(--vp-paper, #fff)" stroke={f.col} stroke-width={f.lw} vector-effect="non-scaling-stroke" />
		{/each}
		<!-- an elevation / section: exact hidden lines — every paper fill first, then the visible edges -->
		{#each hlLines as h, i (i)}
			{#if h.fill}<path d={h.fill} class="hl" style="fill: var(--vp-paper, #fff)" stroke="none" />{/if}
		{/each}
		{#each hlLines as h, i (i)}
			{#if h.d}<path d={h.d} fill="none" stroke={colorOf(h.o)} stroke-width={weightOf(h.o)} stroke-dasharray={dashOf(h.o)} stroke-linecap="round" vector-effect="non-scaling-stroke" />{/if}
		{/each}
	{/if}
	{#each hideHidden ? [] : model.objects as o (o.id)}
		{@const to = trim(o)}
		{#if to && visible(o) && !isOpening(o) && !inHiddenFloors(o)}
			{@const col = colorOf(o)}
			{@const lw = weightOf(o)}
			{#each (dir !== 'plan' ? prismPanels(to, allCuts) ?? [to] : [to]).flatMap((part) => project(part, pd, yaw, pitch, cx, cy, persp)) as s, i (i)}
				{#if s.closed}
					<polygon points={mv(s.pts).map((p) => `${p.u},${p.v}`).join(' ')} fill="none" stroke={col} stroke-width={lw} stroke-dasharray={dashOf(o)} vector-effect="non-scaling-stroke" />
				{:else}
					<polyline points={mv(s.pts).map((p) => `${p.u},${p.v}`).join(' ')} fill="none" stroke={col} stroke-width={lw} stroke-dasharray={dashOf(o)} vector-effect="non-scaling-stroke" />
				{/if}
			{/each}
		{/if}
	{/each}
	<!-- Pass 2: openings ON TOP — a paper-coloured fill masks the wall behind (a real hole), then a
	     solid frame outlines the door/window. Painted after pass 1 so it cuts through the wall lines. (Not with an
	     elevation's hidden lines: its walls already have the holes, and a mask would hide what is seen through them.) -->
	{#each hideHidden && fr ? [] : model.objects as o (o.id)}
		{@const to = trim(o)}
		{#if to && visible(o) && isOpening(o) && !inHiddenFloors(o)}
			{@const col = colorOf(o)}
			{@const lw = weightOf(o)}
			{#each project(to, pd, yaw, pitch, cx, cy, persp) as s, i (i)}
				{#if !o.id || wallHoles.has(o.id)}<polygon points={mv(s.pts).map((p) => `${p.u},${p.v}`).join(' ')} class="hole" stroke={col} stroke-width={lw} vector-effect="non-scaling-stroke" />
				{:else}<polygon points={mv(s.pts).map((p) => `${p.u},${p.v}`).join(' ')} fill="none" stroke={col} stroke-width={lw * 0.6} stroke-dasharray={dashArray('dashed', canvasZoom)} opacity="0.6" vector-effect="non-scaling-stroke" />{/if}   <!-- a hole through furniture: just its outline (the box itself is split, see prismPanels) -->
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
