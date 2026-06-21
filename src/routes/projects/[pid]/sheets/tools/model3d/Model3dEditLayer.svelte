<svelte:options namespace="svg" />

<script lang="ts">
	// Geometry edit handles for a model3d viewport, rendered via the render's
	// {@render children} slot (so it shares the real-mm viewBox). namespace="svg"
	// is required or these elements compile in the HTML namespace (inert).
	import type { Model3dEditor } from './model3d-editor.svelte'
	import { BASIS, type Conduit, type Dir, type Model, type Obj, type Wall } from './types'
	import { project, posAlong, sizeAlong, xyCenter, DEFAULT_YAW, DEFAULT_PITCH } from './projection'

	let { editor, model, direction, interactive = false, zoom = 1 }: {
		editor: Model3dEditor
		model: Model
		direction: Dir
		interactive?: boolean
		zoom?: number
	} = $props()

	const HL = '#2563eb'
	const editable = $derived(interactive && direction !== 'iso')
	const pe = $derived(editable ? 'auto' : 'none')
	const b = $derived(BASIS[direction])
	const pivot = $derived(xyCenter(model.objects))
	// Underlays in this view (each gets a draggable border; click to select+move).
	const underlays = $derived((model.underlays ?? []).filter((u) => u.dir === direction && u.rect))

	// Handle/hit sizes in world-mm, counter-scaled to a steady on-screen size.
	const ss = $derived((zoom, editor.screenScale()) || 1) // depend on zoom; re-read CTM
	const HS = $derived(8 / ss) // handle square ≈ 8px
	const HR = $derived(5 / ss) // round handle radius (≈ 10px diameter)
	const HIT = $derived(12 / ss) // line hit width
	const GAP = $derived(16 / ss) // extend-handle offset beyond the end vertex
	// Stroke widths: with non-scaling-stroke the value is in SVG-element px, scaled by
	// the canvas zoom — so divide by zoom for a constant on-screen width at any zoom.
	const selW = $derived(2.75 / zoom) // thin selection highlight (constant on-screen)
	const segW = $derived(1.75 / zoom) // selected-segment highlight (a touch bolder)

	// Points string; closed shapes are closed back to the first point so the
	// final edge is drawn (and stays selectable).
	const shapePts = (s: { pts: { u: number; v: number }[]; closed: boolean }) =>
		(s.closed ? [...s.pts, s.pts[0]] : s.pts).map((p) => `${p.u},${-p.v}`).join(' ')
	const shapesOf = (o: Obj) => project(o, direction, DEFAULT_YAW, DEFAULT_PITCH, pivot.cx, pivot.cy)
	// World position (x = u, y = -v) of a 3D model point.
	const W3 = (p: { x: number; y: number; z: number }) => ({ x: b.hs * p[b.h], y: -(b.vs * p[b.v]) })
	// World position from model-axis coords (coordH along b.h, coordV along b.v).
	const Whv = (ch: number, cv: number) => ({ x: b.hs * ch, y: -(b.vs * cv) })
	const mid = (a: any, c: any) => ({ x: (a.x + c.x) / 2, y: (a.y + c.y) / 2, z: (a.z + c.z) / 2 })

	type H = { round: boolean; x: number; y: number; cur: string; act: (e: MouseEvent) => void; sel?: boolean }
	function handles(o: Obj, i: number): H[] {
		if (o.type === 'prism') {
			const out: H[] = []
			const rot = o.rot ?? 0
			// Corner resize handles — only when axis-aligned (or in an elevation, where
			// rotation about z doesn't affect this view's box). When rotated in plan,
			// resize via the W/D fields and use the rotate handle to spin.
			if (Math.abs(rot) < 0.5 || direction !== 'plan') {
				const posH = posAlong(o, b.h), dimH = sizeAlong(o, b.h)
				const posV = posAlong(o, b.v), dimV = sizeAlong(o, b.v)
				for (const h1 of [false, true]) for (const v1 of [false, true]) {
					const p = Whv(posH + (h1 ? dimH : 0), posV + (v1 ? dimV : 0))
					const right = b.hs > 0 ? h1 : !h1
					out.push({ round: false, x: p.x, y: p.y, cur: v1 === right ? 'nesw-resize' : 'nwse-resize', act: (e) => editor.startResize(e, i, `box:${h1 ? 'h1' : 'h0'}:${v1 ? 'v1' : 'v0'}`) })
				}
			}
			// Rotate handle (plan only): just beyond the footprint top, along +d rotated.
			if (direction === 'plan') {
				const cxm = o.x + o.w / 2, cym = o.y + o.d / 2, r = (rot * Math.PI) / 180
				const top = W3({ x: cxm - Math.sin(r) * (o.d / 2), y: cym + Math.cos(r) * (o.d / 2), z: o.z })
				const cen = W3({ x: cxm, y: cym, z: o.z })
				const dx = top.x - cen.x, dy = top.y - cen.y, len = Math.hypot(dx, dy) || 1
				out.push({ round: true, x: top.x + (dx / len) * GAP, y: top.y + (dy / len) * GAP, cur: 'grab', act: (e) => editor.startRotatePrism(e, i) })
			}
			return out
		}
		// wall in an elevation view: only the height edge is editable here
		if (o.type === 'wall' && direction !== 'plan') {
			const f = o.nodes[0]; const p = Whv(b.h === 'x' ? f.x : f.y, f.z + o.h)
			return [{ round: false, x: p.x, y: p.y, cur: 'ns-resize', act: (e) => editor.startResize(e, i, 'p0') }]
		}
		// conduit, or wall in plan — graph handles: a vertex per node, an insert
		// midpoint per segment, an extend handle per endpoint (degree-1 node).
		const sw = o as Conduit | Wall
		const nm = new Map(sw.nodes.map((n) => [n.id, n]))
		const deg = (id: string) => sw.segments.filter((s) => s.a === id || s.b === id).length
		const out: H[] = sw.nodes.map((nd): H => { const p = W3(nd); return { round: false, x: p.x, y: p.y, cur: 'move', sel: editor.isVertex(i, nd.id), act: (e) => editor.startVertex(e, i, nd.id) } })
		for (const s of sw.segments) {
			const a = nm.get(s.a), c = nm.get(s.b); if (!a || !c) continue
			const p = W3(mid(a, c)); out.push({ round: true, x: p.x, y: p.y, cur: 'copy', act: (e) => editor.startInsert(e, i, s.id) })
		}
		// Extend handle sits just *beyond* each endpoint (along its only segment) so
		// it doesn't overlap the vertex handle and block dragging it.
		for (const nd of sw.nodes) {
			if (deg(nd.id) !== 1) continue
			const s = sw.segments.find((x) => x.a === nd.id || x.b === nd.id)!
			const other = nm.get(s.a === nd.id ? s.b : s.a)!
			const a = W3(nd), bb = W3(other)
			const dx = a.x - bb.x, dy = a.y - bb.y, len = Math.hypot(dx, dy) || 1
			out.push({ round: true, x: a.x + (dx / len) * GAP, y: a.y + (dy / len) * GAP, cur: 'crosshair', act: (e) => editor.startExtend(e, i, nd.id) })
		}
		// On the selected node: a branch handle (drag → new segment) and, for a
		// junction (degree ≥ 2), a disconnect handle (tap → split into separate ends).
		// Both touch-friendly — no modifier key.
		if (editor.vsel?.index === i) {
			const sel = sw.nodes.find((n) => n.id === editor.vsel!.nodeId)
			if (sel) {
				const p = W3(sel)
				out.push({ round: true, x: p.x + GAP, y: p.y - GAP, cur: 'cell', act: (e) => editor.startExtend(e, i, sel.id) })
				if (deg(sel.id) >= 2) {
					out.push({ round: true, x: p.x - GAP, y: p.y - GAP, cur: 'no-drop', act: (e) => { if (e.button !== 0) return; e.stopPropagation(); editor.disconnectNode(i, sel.id) } })
				}
			}
		}
		return out
	}
</script>

<g class="print:hidden">
	{#if editable}
		<!-- empty-space drag draws a marquee (and a plain click clears selection) -->
		<rect x="-1000000" y="-1000000" width="2000000" height="2000000" fill="transparent"
			style:pointer-events="auto" onmousedown={(e: MouseEvent) => { if (e.button === 0) editor.beginMarquee(e) }} />
	{/if}

	{#each model.objects as o, i (i)}
		{@const selected = editor.isObj(i) || editor.inMulti(i)}
		{#each shapesOf(o) as s, si (si)}
			<!-- hit area for select/move: a fat transparent OUTLINE stroke (the shape's edge),
			     so you select by clicking the border, not the body — avoids grabbing/dragging
			     a wall by mistake when its interior overlaps the work area (esp. elevations). -->
			<polyline points={shapePts(s)} fill="none" stroke="transparent" stroke-width={HIT}
				style:pointer-events={pe} style:cursor="move" onmousedown={(e: MouseEvent) => editor.startObjMove(e, i)} />
			<!-- outline highlight for prisms/walls (a conduit's silhouette would mask its vertex handles) -->
			{#if selected && o.type !== 'conduit'}
				<polyline points={shapePts(s)} fill="none" stroke={HL} stroke-width={selW} vector-effect="non-scaling-stroke" style:pointer-events="none" />
			{/if}
		{/each}
		<!-- conduit: highlight the thin centerline (per segment), not the tube silhouette -->
		{#if selected && o.type === 'conduit'}
			{#each o.segments as s (s.id)}
				{@const a = o.nodes.find((n) => n.id === s.a)}
				{@const c = o.nodes.find((n) => n.id === s.b)}
				{#if a && c}
					<line x1={b.hs * a[b.h]} y1={-(b.vs * a[b.v])} x2={b.hs * c[b.h]} y2={-(b.vs * c[b.v])}
						stroke={HL} stroke-width={selW} vector-effect="non-scaling-stroke" style:pointer-events="none" />
				{/if}
			{/each}
		{/if}
	{/each}

	<!-- selected segment highlight (orange) -->
	{#if editable && editor.ssel}
		{@const so = model.objects[editor.ssel.index]}
		{#if so && (so.type === 'wall' || so.type === 'conduit')}
			{@const seg = so.segments.find((x) => x.id === editor.ssel?.segId)}
			{@const a = so.nodes.find((n) => n.id === seg?.a)}
			{@const c = so.nodes.find((n) => n.id === seg?.b)}
			{#if a && c}
				<line x1={b.hs * a[b.h]} y1={-(b.vs * a[b.v])} x2={b.hs * c[b.h]} y2={-(b.vs * c[b.v])}
					stroke="#f97316" stroke-width={segW} vector-effect="non-scaling-stroke" style:pointer-events="none" />
			{/if}
		{/if}
	{/if}

	{#if editable && editor.selIndex !== null && model.objects[editor.selIndex]}
		{#each handles(model.objects[editor.selIndex], editor.selIndex) as h, hi (hi)}
			{#if h.round}
				<!-- insert (copy)=green · extend (crosshair)=hollow green · branch (cell)=violet · disconnect (no-drop)=red · rotate (grab)=cyan -->
				<circle cx={h.x} cy={h.y} r={h.cur === 'cell' || h.cur === 'no-drop' || h.cur === 'grab' ? HR * 1.2 : HR}
					fill={h.cur === 'crosshair' ? '#fff' : h.cur === 'cell' ? '#7c3aed' : h.cur === 'no-drop' ? '#dc2626' : h.cur === 'grab' ? '#06b6d4' : '#16a34a'} stroke={h.cur === 'crosshair' ? '#16a34a' : '#fff'}
					stroke-width={selW} vector-effect="non-scaling-stroke" style:pointer-events="auto" style:cursor={h.cur} onmousedown={h.act} />
			{:else}
				<rect x={h.x - HS / 2} y={h.y - HS / 2} width={HS} height={HS} fill={h.sel ? HL : '#fff'} stroke={HL} stroke-width={selW} vector-effect="non-scaling-stroke"
					style:pointer-events="auto" style:cursor={h.cur} onmousedown={h.act} />
			{/if}
		{/each}
	{/if}

	<!-- underlays: drag a border to select + move; corners (when selected) resize.
	     Hidden when the Background layer is hidden or locked. -->
	{#if editable && !editor.bgHidden && !editor.bgLocked}
		{#each underlays as u (u.id)}
			{#if u.rect}
				{@const r = u.rect}
				{@const sel = editor.isUnderlay(u.id)}
				<rect x={r.x} y={r.y} width={r.w} height={r.h} fill="transparent" stroke="#9333ea" stroke-opacity={sel ? 1 : 0.4}
					stroke-width={selW} vector-effect="non-scaling-stroke" stroke-dasharray="4 3"
					style:pointer-events="stroke" style:cursor="move" onmousedown={(e: MouseEvent) => editor.startUnderlayMove(e, u.id)} />
				{#if sel}
					{#each [['nw', r.x, r.y], ['ne', r.x + r.w, r.y], ['sw', r.x, r.y + r.h], ['se', r.x + r.w, r.y + r.h]] as const as [c, hx, hy] (c)}
						<rect x={hx - HS / 2} y={hy - HS / 2} width={HS} height={HS} fill="#fff" stroke="#9333ea" stroke-width={selW} vector-effect="non-scaling-stroke"
							style:pointer-events="auto" style:cursor={c === 'nw' || c === 'se' ? 'nwse-resize' : 'nesw-resize'}
							onmousedown={(e: MouseEvent) => editor.startUnderlayResize(e, u.id, c)} />
					{/each}
				{/if}
			{/if}
		{/each}
	{/if}

	<!-- marquee selection box: thin, zoom-constant stroke + dash -->
	{#if editable && editor.marquee}
		{@const m = editor.marquee}
		<rect x={m.x} y={m.y} width={m.w} height={m.h} fill="#3b82f6" fill-opacity="0.08"
			stroke="#3b82f6" stroke-width={1 / zoom} vector-effect="non-scaling-stroke" stroke-dasharray="{4 / zoom} {3 / zoom}" style:pointer-events="none" />
	{/if}

	<!-- object placement: capture clicks/moves + draw the rubber-band preview -->
	{#if editable && editor.placing}
		{@const pl = editor.placing}
		<rect x="-1000000" y="-1000000" width="2000000" height="2000000" fill="transparent"
			style:pointer-events="auto" style:cursor="crosshair"
			onmousedown={editor.placeClick} onmousemove={editor.placeMove} ondblclick={editor.finishPlacing} />
		{#if pl.kind === 'prism' && pl.cursor}
			{@const a = W3(pl.pts[0] ?? pl.cursor)}{@const c = W3(pl.cursor)}
			<rect x={Math.min(a.x, c.x)} y={Math.min(a.y, c.y)} width={Math.abs(c.x - a.x) || 1} height={Math.abs(c.y - a.y) || 1}
				fill="#3b82f6" fill-opacity="0.15" stroke="#3b82f6" stroke-width={1 / zoom} vector-effect="non-scaling-stroke" style:pointer-events="none" />
		{:else if pl.pts.length}
			<polyline points={[...pl.pts, ...(pl.cursor ? [pl.cursor] : [])].map((p) => { const w = W3(p); return `${w.x},${w.y}` }).join(' ')}
				fill="none" stroke="#3b82f6" stroke-width={1 / zoom} vector-effect="non-scaling-stroke" stroke-dasharray="5 3" style:pointer-events="none" />
			{#each pl.pts as p, pi (pi)}
				{@const w = W3(p)}
				<circle cx={w.x} cy={w.y} r={HR} fill="#3b82f6" stroke="#fff" stroke-width={selW} vector-effect="non-scaling-stroke" style:pointer-events="none" />
			{/each}
		{/if}
	{/if}

	<!-- editable section markers: each clipped elevation's box, on the plan.
	     Drag the border to move, corners to resize, ✕ to delete the elevation. -->
	{#if editable && direction === 'plan' && !editor.sectionMode}
		{#each editor.sections as s (s.id)}
			{@const x0 = Math.min(s.clip.x0, s.clip.x1)}{@const x1 = Math.max(s.clip.x0, s.clip.x1)}
			{@const y0 = -Math.max(s.clip.y0, s.clip.y1)}{@const y1 = -Math.min(s.clip.y0, s.clip.y1)}
			<rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="#2563eb" fill-opacity="0.06"
				stroke="#2563eb" stroke-width={1 / zoom} vector-effect="non-scaling-stroke" stroke-dasharray="{5 / zoom} {3 / zoom}"
				style:pointer-events="stroke" style:cursor="move" onmousedown={(e: MouseEvent) => editor.startSectionMove(e, s.id)} />
			{#if s.label}
				<text x={x0} y={y0} dy={-4 / zoom} font-size={11 / zoom} fill="#2563eb" style:pointer-events="none">{s.label}</text>
			{/if}
			{#each [['x0', 'y0'], ['x1', 'y0'], ['x0', 'y1'], ['x1', 'y1']] as const as [xk, yk] (xk + yk)}
				<rect x={s.clip[xk] - HS / 2} y={-s.clip[yk] - HS / 2} width={HS} height={HS} fill="#fff" stroke="#2563eb" stroke-width={selW} vector-effect="non-scaling-stroke"
					style:pointer-events="auto" style:cursor="nwse-resize" onmousedown={(e: MouseEvent) => editor.startSectionResize(e, s.id, xk, yk)} />
			{/each}
			<!-- delete (✕) at the top-right corner -->
			<g transform="translate({x1 + GAP},{y0 - GAP})" style:cursor="pointer" style:pointer-events="auto" onmousedown={(e: MouseEvent) => { if (e.button !== 0) return; e.stopPropagation(); editor.deleteSectionMarker(s.id) }}>
				<circle r={HR * 1.7} fill="#dc2626" stroke="#fff" stroke-width={selW} vector-effect="non-scaling-stroke" />
					<path d="M{-HR * 0.85},{-HR * 0.85} L{HR * 0.85},{HR * 0.85} M{HR * 0.85},{-HR * 0.85} L{-HR * 0.85},{HR * 0.85}" stroke="#fff" stroke-width={selW} stroke-linecap="round" vector-effect="non-scaling-stroke" style:pointer-events="none" />
			</g>
		{/each}
	{/if}

	<!-- section tool: a top capture rect (so it works over objects too) + box preview -->
	{#if editable && editor.sectionMode}
		<rect x="-1000000" y="-1000000" width="2000000" height="2000000" fill="transparent"
			style:pointer-events="auto" style:cursor="crosshair" onmousedown={editor.startSectionDraw} />
		{#if editor.sectionBox}
			{@const s = editor.sectionBox}
			<rect x={Math.min(s.x0, s.x1)} y={-Math.max(s.y0, s.y1)} width={Math.abs(s.x1 - s.x0)} height={Math.abs(s.y1 - s.y0)}
				fill="#2563eb" fill-opacity="0.1" stroke="#2563eb" stroke-width={1 / zoom} vector-effect="non-scaling-stroke"
				stroke-dasharray="{4 / zoom} {3 / zoom}" style:pointer-events="none" />
		{/if}
	{/if}
</g>
