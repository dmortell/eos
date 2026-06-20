<svelte:options namespace="svg" />

<script lang="ts">
	// Reusable draggable point handles for line-based objects (line/arrow/callout/leader/dimension
	// endpoints). Generic over any SurfaceEditor; the parent supplies the points and applies moves
	// via onmove(index, x, y). `namespace="svg"` — see OutletsEditLayer.
	import type { SurfaceEditor } from './surface.svelte'

	let { editor, points, zoom = 1, onmove }: {
		editor: SurfaceEditor
		points: { x: number; y: number }[]
		zoom?: number
		onmove: (index: number, x: number, y: number) => void
	} = $props()

	const HL = '#06b6d4'
	// world-mm sizes counter-scaled to a steady on-screen size (dep on zoom → re-read CTM)
	const ss = $derived((zoom, editor.screenScale()) || 1)
	const R = $derived(4.5 / ss) // point handle radius ≈ 4.5px
	const SW = $derived(1 / ss)  // stroke ≈ 1px
	function startDragPt(i: number, e: MouseEvent) {
		if (e.button !== 0) return
		e.stopPropagation(); e.preventDefault()
		editor.startDrag(ev => { const w = editor.toWorld(ev); if (w) onmove(i, w.x, w.y) }, () => editor.notify())
	}
</script>

{#each points as p, i (i)}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<circle cx={p.x} cy={p.y} r={R} fill="white" stroke={HL} stroke-width={SW} style:cursor="crosshair" style:pointer-events="auto" onmousedown={(e: MouseEvent) => startDragPt(i, e)} />
{/each}
