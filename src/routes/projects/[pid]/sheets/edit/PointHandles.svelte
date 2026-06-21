<svelte:options namespace="svg" />

<script lang="ts">
	// Reusable draggable point handles for line-based objects (line/arrow/callout/leader/dimension
	// endpoints). Generic over any SurfaceEditor; the parent supplies the points and applies moves
	// via onmove(index, x, y). `namespace="svg"` — see OutletsEditLayer.
	import type { SurfaceEditor } from './surface.svelte'

	let { editor, points, anchor = null, zoom = 1, onmove }: {
		editor: SurfaceEditor
		points: { x: number; y: number }[]
		/** Reference point for the Shift angle-snap when there's only ONE handle (e.g. a
		 *  callout's pointer tip — anchor = the box). 2-point lines use the other endpoint. */
		anchor?: { x: number; y: number } | null
		zoom?: number
		onmove: (index: number, x: number, y: number) => void
	} = $props()

	const HL = '#2563eb' // blue, matching object selection
	// world-mm sizes counter-scaled to a steady on-screen size (dep on zoom → re-read CTM)
	const ss = $derived((zoom, editor.screenScale()) || 1)
	const R = $derived(4.5 / ss) // point handle radius ≈ 4.5px
	const SW = $derived(1.75 / ss)  // stroke (thicker, matching object select)
	function startDragPt(i: number, e: MouseEvent) {
		if (e.button !== 0) return
		e.stopPropagation(); e.preventDefault()
		// Shift snaps the dragged endpoint to a 15° angle about its anchor (the other endpoint, or
		// the supplied anchor for a lone handle), keeping its distance.
		const ref = points.length === 2 ? { ...points[1 - i] } : anchor
		editor.startDrag(ev => {
			const w = editor.toWorld(ev); if (!w) return
			let { x, y } = w
			if (ev.shiftKey && ref) {
				const dx = x - ref.x, dy = y - ref.y, len = Math.hypot(dx, dy), step = Math.PI / 12
				const a = Math.round(Math.atan2(dy, dx) / step) * step
				x = ref.x + len * Math.cos(a); y = ref.y + len * Math.sin(a)
			}
			onmove(i, x, y)
		}, () => editor.notify())
	}
</script>

{#each points as p, i (i)}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<circle cx={p.x} cy={p.y} r={R} fill="white" stroke={HL} stroke-width={SW} style:cursor="crosshair" style:pointer-events="auto" onmousedown={(e: MouseEvent) => startDragPt(i, e)} />
{/each}
