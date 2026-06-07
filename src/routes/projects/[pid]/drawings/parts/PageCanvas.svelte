<script lang="ts">
	import type { Page, Viewport, TitleBlockConfig } from '$lib/types/pages'
	import { paperDimsMm } from '$lib/ui/print/types'
	import { Firestore } from '$lib'
	import ViewportFrame from './ViewportFrame.svelte'
	import TitleBlock, { type TitleBlockProjectDefaults } from './TitleBlock.svelte'
	import { triggerPrint } from '$lib/ui/print'

	let {
		page, selectedViewportId, activeViewportId = null, width, height, db, projectId,
		projectDefaults = {},
		revisionCode,
		onselect, onactivate, ondeactivate, onupdateviewport, onhistory, onfit, onupdatetitleblock, ondeselect, onopensource,
	}: {
		page: Page
		selectedViewportId: string | null
		/** Viewport that's been double-clicked into (content pan/zoom mode). */
		activeViewportId?: string | null
		width: number
		height: number
		db: Firestore
		/** Project id — forwarded to viewports for stale-source resolution. */
		projectId: string
		projectDefaults?: TitleBlockProjectDefaults
		revisionCode?: string
		onselect: (id: string) => void
		/** Enter a viewport (double-click) for content pan/zoom. */
		onactivate?: (id: string) => void
		/** Leave the active viewport (double-click empty canvas / Esc). */
		ondeactivate?: () => void
		onupdateviewport: (id: string, patch: Partial<Viewport>) => void
		/** Record an undo entry: viewport id + its geometry before a move/resize. */
		onhistory?: (id: string, before: Partial<Viewport>) => void
		/** A viewport reports the real 1:N that fits its frame (fit request → fixed scale). */
		onfit?: (id: string, scale: number) => void
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
		// Unified model: wheel always zooms at the cursor; panning is middle/right-drag.
		// (An active viewport's own wheel handler stops propagation before this runs.)
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

	/** Reset to 1:1 with the paper near the top-left (matches the initial view). */
	export function zoom100() {
		zoom = 1
		panX = 40
		panY = 40
	}

	/** Fit the whole paper within the canvas viewport, centred. */
	export function zoomFit() {
		const pad = 24
		const zx = (width - pad * 2) / paperMm.w
		const zy = (height - pad * 2) / paperMm.h
		const z = Math.max(0.1, Math.min(8, Math.min(zx, zy)))
		zoom = z
		panX = (width - paperMm.w * z) / 2
		panY = (height - paperMm.h * z) / 2
	}

	/**
	 * Double-clicking empty canvas exits any activated viewport. Viewport
	 * double-clicks stop propagation, so anything reaching here is "empty".
	 */
	function onCanvasDoubleClick() { ondeactivate?.() }

	/**
	 * Print the current page. Called from the editor's sidebar button — resets
	 * pan/zoom so the paper lands at the page's top-left at 1:1, invokes
	 * `triggerPrint` (which injects `@page size: Wmm Hmm` + a @media print block
	 * that forces `.print-canvas-container` to that exact footprint and hides
	 * anything marked `print:hidden` / `.sidebar-area`), then restores the
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
	ondblclick={onCanvasDoubleClick}
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
			<!-- Margin frame — a thin non-scaling hairline (shared `.dwg-line` with the
			     title block). Prints crisp + thin, like a real drawing border. -->
			{#if page.paper.margins > 0}
				<svg class="absolute inset-0 pointer-events-none" width={paperMm.w} height={paperMm.h}
					viewBox="0 0 {paperMm.w} {paperMm.h}" preserveAspectRatio="none" aria-hidden="true">
					<rect class="dwg-line"
						x={page.paper.margins} y={page.paper.margins}
						width={paperMm.w - 2 * page.paper.margins} height={paperMm.h - 2 * page.paper.margins}
						vector-effect="non-scaling-stroke" />
				</svg>
			{/if}

			<!-- Viewports -->
			{#each page.viewports as vp (vp.id)}
				<ViewportFrame
					viewport={vp}
					selected={selectedViewportId === vp.id}
					active={activeViewportId === vp.id}
					pxPerMm={zoom}
					{db}
					{projectId}
					onselect={() => onselect(vp.id)}
					onactivate={() => onactivate?.(vp.id)}
					onupdate={patch => onupdateviewport(vp.id, patch)}
					onhistory={before => onhistory?.(vp.id, before)}
					onfit={s => onfit?.(vp.id, s)}
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
	<div class="absolute bottom-2 left-2 text-[10px] text-zinc-500 dark:text-zinc-400 pointer-events-none print:hidden">
		{page.paper.paperSize} {page.paper.orientation} · 1:{page.paper.scale || 100} · {Math.round(zoom * 100)}%
	</div>
</div>
