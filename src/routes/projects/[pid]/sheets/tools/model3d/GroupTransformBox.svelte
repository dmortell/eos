<svelte:options namespace="svg" />

<script lang="ts">
	// Group/multi-selection transform box (plan view): an AABB around the whole selection with
	// 8 scale handles + a rotate handle. Drives the SelectionCoordinator with INCREMENTAL scale/
	// rotate so the transform composes about a fixed anchor/centre (no snapshot needed). namespace
	// ="svg" — these elements live inside the model3d render <svg>, see Model3dEditLayer.
	import type { SurfaceEditor } from '../../edit/surface.svelte'
	import type { SelectionCoordinator } from '../../edit/selection'

	let { editor, selection, zoom = 1 }: { editor: SurfaceEditor; selection: SelectionCoordinator; zoom?: number } = $props()

	type BB = { x0: number; y0: number; x1: number; y1: number }
	let drag = $state<{ bb: BB; rot: number } | null>(null) // active rotate gesture: freeze box + show rotation
	const live = $derived(selection.groupBounds())
	const bb = $derived<BB | null>(drag?.bb ?? live)

	const ss = $derived((zoom, editor.screenScale()) || 1)
	const HS = $derived(8 / ss)   // handle square ≈ 8px
	const GAP = $derived(22 / ss) // rotate-handle offset above the box
	const SW = $derived(1.5 / zoom)
	const HL = '#2563eb'

	const handlesOf = (b: BB) => {
		const mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2
		return [
			{ k: 'nw', x: b.x0, y: b.y0 }, { k: 'n', x: mx, y: b.y0 }, { k: 'ne', x: b.x1, y: b.y0 },
			{ k: 'e', x: b.x1, y: my }, { k: 'se', x: b.x1, y: b.y1 }, { k: 's', x: mx, y: b.y1 },
			{ k: 'sw', x: b.x0, y: b.y1 }, { k: 'w', x: b.x0, y: my },
		]
	}

	function startScale(k: string, e: MouseEvent) {
		if (e.button !== 0 || !bb) return
		e.stopPropagation(); e.preventDefault()
		const b0 = { ...bb }
		selection.beforeMutate?.() // checkpoint for undo
		const ax = k.includes('e') ? b0.x0 : k.includes('w') ? b0.x1 : b0.x0
		const ay = k.includes('s') ? b0.y0 : k.includes('n') ? b0.y1 : b0.y0
		const ex = k.includes('e') ? b0.x1 : k.includes('w') ? b0.x0 : null
		const ey = k.includes('s') ? b0.y1 : k.includes('n') ? b0.y0 : null
		let lsx = 1, lsy = 1
		editor.startDrag((ev) => {
			const w = editor.toWorld(ev); if (!w) return
			let csx = ex != null && ex !== ax ? (w.x - ax) / (ex - ax) : 1
			let csy = ey != null && ey !== ay ? (w.y - ay) / (ey - ay) : 1
			csx = Math.max(0.02, csx); csy = Math.max(0.02, csy)
			if (ev.shiftKey && ex != null && ey != null) { const u = Math.max(csx, csy); csx = u; csy = u } // uniform
			selection.scaleGroup(csx / lsx, csy / lsy, ax, ay)
			lsx = csx; lsy = csy
		}, () => editor.notify())
	}

	function startRotate(e: MouseEvent) {
		if (e.button !== 0 || !bb) return
		e.stopPropagation(); e.preventDefault()
		const b0 = { ...bb }
		const cx = (b0.x0 + b0.x1) / 2, cy = (b0.y0 + b0.y1) / 2
		const ang = (p: { x: number; y: number }) => (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI
		const a0 = ang(editor.toWorld(e) ?? { x: cx, y: cy })
		let last = 0
		selection.beforeMutate?.()
		drag = { bb: b0, rot: 0 }
		editor.startDrag((ev) => {
			const w = editor.toWorld(ev); if (!w) return
			let a = ang(w) - a0
			if (ev.shiftKey) a = Math.round(a / 15) * 15 // Shift snaps to 15°
			selection.rotateGroup(a - last, cx, cy)
			last = a
			if (drag) drag.rot = a
		}, () => { drag = null; editor.notify() })
	}
</script>

{#if bb}
	{@const cx = (bb.x0 + bb.x1) / 2}{@const cy = (bb.y0 + bb.y1) / 2}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<g transform={drag ? `rotate(${drag.rot} ${cx} ${cy})` : ''} class="print:hidden">
		<rect x={bb.x0} y={bb.y0} width={bb.x1 - bb.x0} height={bb.y1 - bb.y0} fill="none" stroke={HL}
			stroke-width={SW} vector-effect="non-scaling-stroke" stroke-dasharray="{4 / zoom} {3 / zoom}" style:pointer-events="none" />
		<line x1={cx} y1={bb.y0} x2={cx} y2={bb.y0 - GAP} stroke={HL} stroke-width={SW} vector-effect="non-scaling-stroke" style:pointer-events="none" />
		<circle cx={cx} cy={bb.y0 - GAP} r={HS / 1.4} fill="#22c55e" stroke="#fff" stroke-width={SW}
			vector-effect="non-scaling-stroke" style:cursor="crosshair" style:pointer-events="auto" onmousedown={startRotate} />
		{#each handlesOf(bb) as h (h.k)}
			<rect x={h.x - HS / 2} y={h.y - HS / 2} width={HS} height={HS} fill="#fff" stroke={HL}
				stroke-width={SW} vector-effect="non-scaling-stroke" style:cursor="pointer" style:pointer-events="auto" onmousedown={(e) => startScale(h.k, e)} />
		{/each}
	</g>
{/if}
