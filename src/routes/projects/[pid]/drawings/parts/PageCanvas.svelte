<script lang="ts">
	import type { Page, Viewport, TitleBlockConfig, Annotation } from '$lib/types/pages'
	import { paperDimsMm } from '$lib/ui/print/types'
	import { Firestore } from '$lib'
	import { isMacLikePlatform, wheelZoomFactorFromEvent } from '$lib/ui/panzoom-controller'
	import ViewportFrame from './ViewportFrame.svelte'
	import AnnotationLayer from './AnnotationLayer.svelte'
	import TitleBlock, { type TitleBlockProjectDefaults } from './TitleBlock.svelte'

	let {
		page, selectedViewportId, activeViewportId = null, width, height, db, projectId,
		projectDefaults = {},
		revisionCode,
		selectedAnnotationId = null, annotationMode = null,
		onselect, onactivate, ondeactivate, onupdateviewport, onhistory, onfit, onupdatetitleblock, ondeselect, onopensource,
		onselectannotation, onupdateannotation, onplaceannotation,
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
		/** Currently-selected annotation id (separate from viewport selection). */
		selectedAnnotationId?: string | null
		/** When set, a left-click on the paper places an annotation of this kind. */
		annotationMode?: Annotation['kind'] | null
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
		onselectannotation?: (id: string) => void
		onupdateannotation?: (id: string, patch: Partial<Annotation>) => void
		/** Place a new annotation (text: point; arrow: start→end), in page-space mm. */
		onplaceannotation?: (a: { kind: Annotation['kind']; x: number; y: number; x2?: number; y2?: number }) => void
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
	let lastPanClient: { x: number; y: number } | null = null
	const WHEEL_ZOOM_SPEED = isMacLikePlatform() ? 0.0038 : 0.0025

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
		const factor = wheelZoomFactorFromEvent(e, WHEEL_ZOOM_SPEED)
		const nextZoom = Math.min(8, Math.max(0.1, zoom * factor))
		// Zoom around cursor: keep the mm point under cursor fixed.
		panX = cx - (cx - panX) * (nextZoom / zoom)
		panY = cy - (cy - panY) * (nextZoom / zoom)
		zoom = nextZoom
	}

	function onCanvasMouseDown(e: MouseEvent) {
		// Left-click on empty canvas area deselects. Right/middle pans.
		// (Annotation placement is captured by the paper overlay below.)
		if (e.button === 0) {
			ondeselect()
			return
		}
		if (e.button === 1 || e.button === 2) {
			e.preventDefault()
			panning = true
			lastPanClient = { x: e.clientX, y: e.clientY }
			window.addEventListener('mousemove', onPanMove)
			window.addEventListener('mouseup', onPanUp)
		}
	}

	function onPanMove(e: MouseEvent) {
		if (!panning) return
		if (!lastPanClient) {
			lastPanClient = { x: e.clientX, y: e.clientY }
			return
		}
		const dx = e.clientX - lastPanClient.x
		const dy = e.clientY - lastPanClient.y
		lastPanClient = { x: e.clientX, y: e.clientY }
		panX += dx
		panY += dy
	}

	function onPanUp() {
		panning = false
		lastPanClient = null
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

	// ── Annotation placement ──
	// Text places instantly at the click; arrow drags start→end with a live
	// preview. `offsetX/Y` (text) and the overlay rect (arrow) are page-mm.
	let overlayEl = $state<HTMLDivElement | null>(null)
	let placeDraw = $state<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
	function onPlaceDown(e: MouseEvent) {
		const mode = annotationMode
		if (e.button !== 0 || !mode) return
		e.stopPropagation()
		if (mode === 'text' || mode === 'symbol') { onplaceannotation?.({ kind: mode, x: e.offsetX, y: e.offsetY }); return }
		// arrow / dimension / cloud — drag from start to end
		const kind = mode
		const rect = overlayEl!.getBoundingClientRect()
		const toMm = (cx: number, cy: number) => ({ x: (cx - rect.left) / zoom, y: (cy - rect.top) / zoom })
		const s = toMm(e.clientX, e.clientY)
		placeDraw = { x1: s.x, y1: s.y, x2: s.x, y2: s.y }
		const move = (ev: MouseEvent) => { const p = toMm(ev.clientX, ev.clientY); if (placeDraw) placeDraw = { ...placeDraw, x2: p.x, y2: p.y } }
		const up = () => {
			window.removeEventListener('mousemove', move)
			window.removeEventListener('mouseup', up)
			const p = placeDraw
			placeDraw = null
			if (p) onplaceannotation?.({ kind, x: p.x1, y: p.y1, x2: p.x2, y2: p.y2 })
		}
		window.addEventListener('mousemove', move)
		window.addEventListener('mouseup', up)
	}

	/**
	 * Print the current page. Rather than print the whole pan/zoom canvas as-is,
	 * we make the canvas the print root sized to the paper and scale its content
	 * so 1 world-unit (= 1 mm at zoom 1) maps to a real millimetre — so the paper
	 * sheet alone fills the printed page exactly (pattern from `src-sample`'s
	 * `Canvas.svelte`). Injected CSS uses `!important`, overriding the live
	 * pan/zoom transform, so no save/restore of view state is needed. Chrome
	 * (menubar / sidebar / status bar) is hidden by its own `print:hidden`.
	 */
	const PRINT_STYLE_ID = 'page-canvas-print-style'
	const PRINT_ROOT_CLASS = 'canvas-print-root'
	const PX_PER_MM = 96 / 25.4 // CSS px per mm (1in = 96px = 25.4mm)

	function applyPrintStyles() {
		const { w, h } = paperMm
		canvas?.classList.add(PRINT_ROOT_CLASS)
		let style = document.getElementById(PRINT_STYLE_ID) as HTMLStyleElement | null
		if (!style) { style = document.createElement('style'); style.id = PRINT_STYLE_ID; document.head.appendChild(style) }
		style.textContent = `@page { size: ${w}mm ${h}mm; margin: 0; }
@media print {
	html, body { margin: 0 !important; padding: 0 !important; }
	.${PRINT_ROOT_CLASS} { position: fixed !important; inset: 0 !important; width: ${w}mm !important; height: ${h}mm !important; overflow: visible !important; background: white !important; }
	.${PRINT_ROOT_CLASS} > .panzoom-content { transform: scale(${PX_PER_MM}) !important; transform-origin: 0 0 !important; }
}`
	}
	function removePrintStyles() {
		canvas?.classList.remove(PRINT_ROOT_CLASS)
		document.getElementById(PRINT_STYLE_ID)?.remove()
	}

	export function doPrint() {
		applyPrintStyles()
		const cleanup = () => {
			removePrintStyles()
			window.removeEventListener('afterprint', cleanup)
		}
		window.addEventListener('afterprint', cleanup)
		requestAnimationFrame(() => window.print())
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={canvas}
	class="panzoom relative overflow-hidden bg-zinc-100 dark:bg-zinc-900 select-none"
	style:width="{width}px"
	style:height="{height}px"
	style:cursor={annotationMode ? 'copy' : null}
	onmousedown={onCanvasMouseDown}
	ondblclick={onCanvasDoubleClick}
	oncontextmenu={onContextMenu}
>
	<div
		class="panzoom-content absolute top-0 left-0 origin-top-left"
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

			<!-- Annotations — page-space overlay, on top of viewports + title block. -->
			<AnnotationLayer
				annotations={page.annotations ?? []}
				selectedId={selectedAnnotationId}
				pxPerMm={zoom}
				paperW={paperMm.w}
				paperH={paperMm.h}
				onselect={id => onselectannotation?.(id)}
				onupdate={(id, patch) => onupdateannotation?.(id, patch)} />

			<!-- Placement capture: while in annotation mode, this overlay sits above the
			     whole paper so a click/drag anywhere (incl. over a viewport) places,
			     instead of being eaten by the viewport. -->
			{#if annotationMode}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div bind:this={overlayEl} class="absolute inset-0 print:hidden" style:cursor="copy"
					onmousedown={onPlaceDown}></div>
				{#if placeDraw}
					<svg class="absolute top-0 left-0 pointer-events-none" width="{paperMm.w}px" height="{paperMm.h}px"
						viewBox="0 0 {paperMm.w} {paperMm.h}" preserveAspectRatio="none" style="overflow:visible">
						{#if annotationMode === 'cloud'}
							<rect x={Math.min(placeDraw.x1, placeDraw.x2)} y={Math.min(placeDraw.y1, placeDraw.y2)}
								width={Math.abs(placeDraw.x2 - placeDraw.x1)} height={Math.abs(placeDraw.y2 - placeDraw.y1)}
								fill="none" stroke="#3b82f6" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-dasharray="4 3" />
						{:else}
							<line x1={placeDraw.x1} y1={placeDraw.y1} x2={placeDraw.x2} y2={placeDraw.y2}
								stroke="#3b82f6" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-dasharray="4 3" />
						{/if}
					</svg>
				{/if}
			{/if}
		</div>
	</div>

	<!-- Paper-size label (fixed, not zoomed). Hidden during print. -->
	<div class="absolute bottom-2 left-2 text-[10px] text-zinc-500 dark:text-zinc-400 pointer-events-none print:hidden">
		{page.paper.paperSize} {page.paper.orientation} · 1:{page.paper.scale || 100} · {Math.round(zoom * 100)}%
	</div>
</div>
