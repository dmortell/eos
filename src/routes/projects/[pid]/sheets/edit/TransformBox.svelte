<svelte:options namespace="svg" />

<script lang="ts">
	// Reusable resize + rotate handles for a box, rendered inside a render <svg> (real-mm). Generic
	// over any SurfaceEditor (annotations, racks, …): the parent supplies the current box/rotation
	// and applies changes via onresize/onrotate. `namespace="svg"` — see OutletsEditLayer.
	import { boxHandles, resizeBox, angleDeg, type Box } from './transform'
	import type { SurfaceEditor } from './surface.svelte'

	let { editor, box, rotation = 0, zoom = 1, onresize, onrotate }: {
		editor: SurfaceEditor
		box: Box
		rotation?: number
		zoom?: number
		onresize: (handle: number, b: Box) => void
		onrotate: (deg: number) => void
	} = $props()

	const HL = '#06b6d4'
	let cx = $derived(box.x + box.w / 2), cy = $derived(box.y + box.h / 2)
	let handles = $derived(boxHandles(box))
	// world-mm sizes counter-scaled to a steady on-screen size (dep on zoom → re-read CTM)
	const ss = $derived((zoom, editor.screenScale()) || 1)
	const HSZ = $derived(8 / ss)  // resize handle square ≈ 8px
	const RR = $derived(5 / ss)   // rotate handle radius
	const ARM = $derived(26 / ss) // rotate arm length
	const SW = $derived(1 / ss)   // stroke ≈ 1px

	function startResize(handle: number, e: MouseEvent) {
		if (e.button !== 0) return
		e.stopPropagation(); e.preventDefault()
		const w0 = editor.toWorld(e); if (!w0) return
		const b0 = { ...box }, r = (-rotation * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
		editor.startDrag(ev => {
			const w = editor.toWorld(ev); if (!w) return
			let dx = w.x - w0.x, dy = w.y - w0.y
			if (rotation) { const lx = dx * c - dy * s, ly = dx * s + dy * c; dx = lx; dy = ly } // into box-local frame
			onresize(handle, resizeBox(b0, handle, dx, dy))
		}, () => editor.notify())
	}
	function startRotate(e: MouseEvent) {
		if (e.button !== 0) return
		e.stopPropagation(); e.preventDefault()
		const w0 = editor.toWorld(e); if (!w0) return
		const off = angleDeg(cx, cy, w0.x, w0.y) - rotation
		editor.startDrag(ev => {
			const w = editor.toWorld(ev); if (!w) return
			const deg = angleDeg(cx, cy, w.x, w.y) - off
			onrotate(ev.shiftKey ? Math.round(deg) : Math.round(deg / 15) * 15) // snap 15° (Shift = free)
		}, () => editor.notify())
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<g transform={rotation ? `rotate(${rotation} ${cx} ${cy})` : undefined}>
	<rect x={box.x} y={box.y} width={box.w} height={box.h} fill="none" stroke={HL} stroke-width={SW} stroke-dasharray="{4 / ss} {3 / ss}" style:pointer-events="none" />
	<line x1={cx} y1={box.y} x2={cx} y2={box.y - ARM} stroke={HL} stroke-width={SW} style:pointer-events="none" />
	<circle cx={cx} cy={box.y - ARM} r={RR} fill="white" stroke={HL} stroke-width={SW} style:cursor="grab" style:pointer-events="auto" onmousedown={startRotate} />
	{#each handles as h (h.handle)}
		<rect x={h.x - HSZ / 2} y={h.y - HSZ / 2} width={HSZ} height={HSZ} fill="white" stroke={HL} stroke-width={SW} style:cursor={h.cursor} style:pointer-events="auto" onmousedown={(e: MouseEvent) => startResize(h.handle, e)} />
	{/each}
</g>
