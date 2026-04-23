<script lang="ts">
	import type { Page, Viewport, TitleBlockConfig } from '$lib/types/pages'
	import { paperDimsMm } from '$lib/ui/print/types'
	import { Firestore } from '$lib'
	import ViewportFrame from './ViewportFrame.svelte'
	import TitleBlock, { type TitleBlockProjectDefaults } from './TitleBlock.svelte'
	import { triggerPrint } from '$lib/ui/print'

	let {
		page, selectedViewportId, width, height, db, projectId,
		projectDefaults = {},
		revisionCode,
		onselect, onupdateviewport, onupdatetitleblock, ondeselect, onopensource,
	}: {
		page: Page
		selectedViewportId: string | null
		width: number
		height: number
		db: Firestore
		/** Project id — forwarded to viewports for stale-source resolution. */
		projectId: string
		projectDefaults?: TitleBlockProjectDefaults
		revisionCode?: string
		onselect: (id: string) => void
		onupdateviewport: (id: string, patch: Partial<Viewport>) => void
		onupdatetitleblock?: (patch: Partial<TitleBlockConfig>) => void
		ondeselect: () => void
		/** Caller navigates to the underlying source drawing for a given viewport. */
		onopensource?: (viewport: Viewport) => void
	} = $props()

	let paperMm = $derived(paperDimsMm(page.paper))

	/**
	 * Effective title-block config. If the page has no `titleBlock` stored yet,
	 * we default to the standard layout pinned to the paper's bottom-right
	 * (inside the margin guide). Saving a move/template change materialises it.
	 */
	let titleBlockCfg = $derived.by<TitleBlockConfig | null>(() => {
		if (page.titleBlock === null) return null // explicitly hidden
		const cfg = page.titleBlock ?? { template: 'standard' as const }
		const margin = page.paper.margins
		let defaultW: number
		let defaultH: number
		let defaultX: number
		let defaultY: number
		if (cfg.template === 'vertical') {
			defaultW = 40
			defaultH = paperMm.h - margin * 2
			defaultX = paperMm.w - defaultW - margin
			defaultY = margin
		} else if (cfg.template === 'compact') {
			defaultW = 120
			defaultH = 20
			defaultX = paperMm.w - defaultW - margin
			defaultY = paperMm.h - defaultH - margin
		} else {
			defaultW = 180
			defaultH = 60
			defaultX = paperMm.w - defaultW - margin
			defaultY = paperMm.h - defaultH - margin
		}
		const w = cfg.widthMm ?? defaultW
		const h = cfg.heightMm ?? defaultH
		return {
			...cfg,
			positionMm: cfg.positionMm ?? { x: defaultX, y: defaultY },
			widthMm: w,
			heightMm: h,
		}
	})

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

	/**
	 * Print the current page. Called from the editor's sidebar button — resets
	 * pan/zoom so the paper lands at the page's top-left at 1:1, invokes
	 * `triggerPrint` (which injects `@page size: Wmm Hmm` + a @media print block
	 * that forces `.print-canvas-container` to that exact footprint and hides
	 * anything marked `.print-hidden` / `.sidebar-area`), then restores the
	 * user's pan/zoom state after `afterprint` fires.
	 */
	export function doPrint() {
		const saved = { panX, panY, zoom }
		panX = 0
		panY = 0
		zoom = 1
		const cleanup = () => {
			panX = saved.panX
			panY = saved.panY
			zoom = saved.zoom
			window.removeEventListener('afterprint', cleanup)
		}
		window.addEventListener('afterprint', cleanup)
		requestAnimationFrame(() => triggerPrint(page.paper, '.print-canvas-container'))
	}
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
		<!-- Paper — `.print-canvas-container` is targeted by triggerPrint's injected CSS -->
		<div
			class="absolute bg-white shadow-md print-canvas-container"
			style:left="0px"
			style:top="0px"
			style:width="{paperMm.w}px"
			style:height="{paperMm.h}px"
		>
			<!-- Margin guide — editorial only, hidden on print. -->
			{#if page.paper.margins > 0}
				<div
					class="absolute border border-dashed border-zinc-300 pointer-events-none print-hidden"
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
					{db}
					{projectId}
					onselect={() => onselect(vp.id)}
					onupdate={patch => onupdateviewport(vp.id, patch)}
					onopensource={onopensource ? () => onopensource(vp) : undefined}
				/>
			{/each}

			<!-- Title block — pinned to the paper like a special viewport -->
			{#if titleBlockCfg}
				<TitleBlock
					config={titleBlockCfg}
					project={projectDefaults}
					drawingTitle={page.title}
					drawingNumber={page.drawingNumber}
					{revisionCode}
					paperSize={page.paper.paperSize}
					scaleDenominator={page.paper.scale || 100}
					pxPerMm={zoom}
					onupdate={onupdatetitleblock} />
			{/if}
		</div>
	</div>

	<!-- Paper-size label (fixed, not zoomed). Hidden during print. -->
	<div class="absolute bottom-2 left-2 text-[10px] text-zinc-500 dark:text-zinc-400 pointer-events-none print-hidden">
		{page.paper.paperSize} {page.paper.orientation} · 1:{page.paper.scale || 100} · {Math.round(zoom * 100)}%
	</div>
</div>
