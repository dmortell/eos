<svelte:options namespace="svg" />

<script lang="ts">
	// Unified transform box (plan view): one box for a single item (oriented to its angle → rotated
	// resize) or a multi-selection/group (axis-aligned AABB). 8 scale handles + a rotate handle,
	// driving the SelectionCoordinator with INCREMENTAL scale/rotate about a fixed anchor/centre.
	// namespace="svg" — lives inside the model3d render <svg>, see Model3dEditLayer.
	import type { SurfaceEditor } from '../../edit/surface.svelte'
	import type { SelectionCoordinator } from '../../edit/selection'

	let { editor, selection, zoom = 1 }: { editor: SurfaceEditor; selection: SelectionCoordinator; zoom?: number } = $props()

	type OBox = { cx: number; cy: number; hw: number; hh: number; angle: number }
	let drag = $state<{ box: OBox; rot: number } | null>(null) // rotate gesture: freeze box + show rotation

	const ss = $derived((zoom, editor.screenScale()) || 1)
	const HS = $derived(8 / ss)   // handle square ≈ 8px
	const GAP = $derived(22 / ss) // rotate-handle offset above the box
	const PAD = $derived(5 / ss)  // small gap between the items' extents and the box
	const SW = $derived(1.5 / zoom)
	const HL = '#2563eb'
	const RAD = Math.PI / 180
	// Directional resize cursors per handle (un-rotated direction), like the standard TransformBox.
	const CURS: Record<string, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' }

	const MINH = $derived(14 / ss) // min half-extent (≈14px screen) so handles stay usable on tiny shapes (text/callout)
	const live = $derived(selection.orientedBox())
	// Padded oriented box, never smaller than MINH so the handles don't collapse onto each other.
	// During a rotate gesture the box is frozen (already padded).
	const box = $derived<(OBox & { single: boolean }) | null>(
		drag ? { ...drag.box, single: true } : live ? { ...live, hw: Math.max(live.hw + PAD, MINH), hh: Math.max(live.hh + PAD, MINH) } : null,
	)
	const gAngle = $derived(box ? (drag ? drag.box.angle + drag.rot : box.angle) : 0)

	// Local handle layout (centre-relative). The `<g rotate>` orients them to the box angle.
	const handlesOf = (b: OBox) => [
		{ k: 'nw', x: -b.hw, y: -b.hh }, { k: 'n', x: 0, y: -b.hh }, { k: 'ne', x: b.hw, y: -b.hh },
		{ k: 'e', x: b.hw, y: 0 }, { k: 'se', x: b.hw, y: b.hh }, { k: 's', x: 0, y: b.hh },
		{ k: 'sw', x: -b.hw, y: b.hh }, { k: 'w', x: -b.hw, y: 0 },
	]

	// World position of a centre-relative local point, rotated by the box angle.
	const toWorld = (b: OBox, lx: number, ly: number) => {
		const r = b.angle * RAD, c = Math.cos(r), s = Math.sin(r)
		return { x: b.cx + lx * c - ly * s, y: b.cy + lx * s + ly * c }
	}
	// Pointer → centre-relative local coords (un-rotate by the box angle).
	const toLocal = (b: OBox, px: number, py: number) => {
		const r = -b.angle * RAD, c = Math.cos(r), s = Math.sin(r), dx = px - b.cx, dy = py - b.cy
		return { x: dx * c - dy * s, y: dx * s + dy * c }
	}

	function startScale(k: string, e: MouseEvent) {
		if (e.button !== 0 || !box) return
		e.stopPropagation(); e.preventDefault()
		const b0 = { cx: box.cx, cy: box.cy, hw: box.hw, hh: box.hh, angle: box.angle }
		selection.beforeMutate?.()
		const sx = k.includes('e') || k.includes('w'), sy = k.includes('n') || k.includes('s')
		const ex = k.includes('e') ? b0.hw : k.includes('w') ? -b0.hw : 0
		const ey = k.includes('s') ? b0.hh : k.includes('n') ? -b0.hh : 0
		const ax = sx ? -ex : 0, ay = sy ? -ey : 0 // anchor = opposite local corner/edge
		const anchor = toWorld(b0, ax, ay)
		let lsx = 1, lsy = 1
		editor.startDrag((ev) => {
			const w = editor.toWorld(ev); if (!w) return
			const lp = toLocal(b0, w.x, w.y)
			let csx = sx && ex !== ax ? (lp.x - ax) / (ex - ax) : 1
			let csy = sy && ey !== ay ? (lp.y - ay) / (ey - ay) : 1
			csx = Math.max(0.02, csx); csy = Math.max(0.02, csy)
			if (ev.shiftKey && sx && sy) { const u = Math.max(csx, csy); csx = u; csy = u } // uniform
			selection.scaleGroup(csx / lsx, csy / lsy, anchor.x, anchor.y, b0.angle)
			lsx = csx; lsy = csy
		}, () => editor.notify())
	}

	function startRotate(e: MouseEvent) {
		if (e.button !== 0 || !box) return
		e.stopPropagation(); e.preventDefault()
		const b0 = { cx: box.cx, cy: box.cy, hw: box.hw, hh: box.hh, angle: box.angle }
		const ang = (p: { x: number; y: number }) => (Math.atan2(p.y - b0.cy, p.x - b0.cx) * 180) / Math.PI
		const a0 = ang(editor.toWorld(e) ?? { x: b0.cx, y: b0.cy })
		let last = 0
		selection.beforeMutate?.()
		drag = { box: b0, rot: 0 }
		editor.startDrag((ev) => {
			const w = editor.toWorld(ev); if (!w) return
			const step = ev.shiftKey ? 15 : 5 // snap rotation to 5° (15° with Shift)
			let a = Math.round((ang(w) - a0) / step) * step
			selection.rotateGroup(a - last, b0.cx, b0.cy)
			last = a
			if (drag) drag.rot = a
		}, () => { drag = null; editor.notify() })
	}
</script>

{#if box}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<g transform={`rotate(${gAngle} ${box.cx} ${box.cy})`} class="print:hidden">
		<rect x={box.cx - box.hw} y={box.cy - box.hh} width={box.hw * 2} height={box.hh * 2} fill="none"
			stroke={HL} stroke-width={SW} vector-effect="non-scaling-stroke" stroke-dasharray="{4 / zoom} {3 / zoom}" style:pointer-events="none" />
		<line x1={box.cx} y1={box.cy - box.hh} x2={box.cx} y2={box.cy - box.hh - GAP} stroke={HL} stroke-width={SW} vector-effect="non-scaling-stroke" style:pointer-events="none" />
		<circle cx={box.cx} cy={box.cy - box.hh - GAP} r={HS / 1.4} fill="#22c55e" stroke="#fff" stroke-width={SW}
			vector-effect="non-scaling-stroke" style:cursor="crosshair" style:pointer-events="auto" onmousedown={startRotate} />
		{#if !box.noResize}
			{#each handlesOf(box) as h (h.k)}
				<rect x={box.cx + h.x - HS / 2} y={box.cy + h.y - HS / 2} width={HS} height={HS} fill="#fff" stroke={HL}
					stroke-width={SW} vector-effect="non-scaling-stroke" style:cursor={CURS[h.k] ?? 'move'} style:pointer-events="auto" onmousedown={(e) => startScale(h.k, e)} />
			{/each}
		{/if}
	</g>
{/if}
