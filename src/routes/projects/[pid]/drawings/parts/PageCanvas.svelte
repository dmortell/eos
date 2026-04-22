<script lang="ts">
	import type { Page, Viewport } from '$lib/types/pages'
	import { paperDimsMm } from '$lib/ui/print/types'
	import ViewportFrame from './ViewportFrame.svelte'

	let { page, selectedViewportId, width, height, onselect, onupdateviewport, ondeselect }: {
		page: Page
		selectedViewportId: string | null
		width: number
		height: number
		onselect: (id: string) => void
		onupdateviewport: (id: string, patch: Partial<Viewport>) => void
		ondeselect: () => void
	} = $props()

	let paperMm = $derived(paperDimsMm(page.paper))

	// Pan/zoom state — units: `x`/`y` are layout offset (px), `zoom` is pxPerMm.
	// At zoom=1, 1 mm = 1 px in layout, so an A3 landscape paper (420×297 mm) is 420×297 px.
	let panX = $state(40)
	let panY = $state(40)
	let zoom = $state(1.4)

	let canvas = $state<HTMLDivElement | null>(null)
	let panning = $state(false)

	$effect(() => {
		canvas?.addEventListener('wheel', onWheel, { passive: false })
		return () => { canvas?.removeEventListener('wheel', onWheel) }
	})

	function onWheel(e: WheelEvent) {
		if (e.ctrlKey || e.altKey || e.metaKey || e.buttons === 2) {
			e.preventDefault()
			const rect = canvas!.getBoundingClientRect()
			const cx = e.clientX - rect.left
			const cy = e.clientY - rect.top
			const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2
			const nextZoom = Math.min(8, Math.max(0.1, zoom * factor))
			// Zoom around cursor: keep the mm point under cursor fixed.
			panX = cx - (cx - panX) * (nextZoom / zoom)
			panY = cy - (cy - panY) * (nextZoom / zoom)
			zoom = nextZoom
		} else if (e.shiftKey) {
			panX -= e.deltaY
		} else {
			panY -= e.deltaY
			panX -= e.deltaX
		}
	}

	function onCanvasMouseDown(e: MouseEvent) {
		// Left-click on empty canvas area deselects. Right/middle pans.
		if (e.button === 0) {
			ondeselect()
			return
		}
		if (e.button === 1 || e.button === 2) {
			e.preventDefault()
			panning = true
			window.addEventListener('mousemove', onPanMove)
			window.addEventListener('mouseup', onPanUp)
		}
	}

	function onPanMove(e: MouseEvent) {
		if (!panning) return
		panX += e.movementX
		panY += e.movementY
	}

	function onPanUp() {
		panning = false
		window.removeEventListener('mousemove', onPanMove)
		window.removeEventListener('mouseup', onPanUp)
	}

	function onContextMenu(e: MouseEvent) { e.preventDefault() }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={canvas}
	class="panzoom relative overflow-hidden bg-zinc-100 dark:bg-zinc-900 select-none"
	style:width="{width}px"
	style:height="{height}px"
	onmousedown={onCanvasMouseDown}
	oncontextmenu={onContextMenu}
>
	<div
		class="absolute top-0 left-0 origin-top-left"
		style:transform="translate({panX}px, {panY}px) scale({zoom})"
	>
		<!-- Paper -->
		<div
			class="absolute bg-white shadow-md"
			style:left="0px"
			style:top="0px"
			style:width="{paperMm.w}px"
			style:height="{paperMm.h}px"
		>
			<!-- Margin guide -->
			{#if page.paper.margins > 0}
				<div
					class="absolute border border-dashed border-zinc-300 pointer-events-none"
					style:left="{page.paper.margins}px"
					style:top="{page.paper.margins}px"
					style:width="{paperMm.w - 2 * page.paper.margins}px"
					style:height="{paperMm.h - 2 * page.paper.margins}px"
				></div>
			{/if}

			<!-- Viewports -->
			{#each page.viewports as vp (vp.id)}
				<ViewportFrame
					viewport={vp}
					selected={selectedViewportId === vp.id}
					pxPerMm={zoom}
					onselect={() => onselect(vp.id)}
					onupdate={patch => onupdateviewport(vp.id, patch)}
				/>
			{/each}
		</div>
	</div>

	<!-- Paper-size label (fixed, not zoomed) -->
	<div class="absolute bottom-2 left-2 text-[10px] text-zinc-500 dark:text-zinc-400 pointer-events-none">
		{page.paper.paperSize} {page.paper.orientation} · 1:{page.paper.scale || 100} · {Math.round(zoom * 100)}%
	</div>
</div>
