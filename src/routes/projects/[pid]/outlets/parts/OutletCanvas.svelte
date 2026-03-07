<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte'
	import { Icon } from '$lib'
	import { PdfState } from '../../uploads/parts/PdfState.svelte.ts'
	import type { OutletConfig, PageCalibration, Point, ToolMode } from './types'
	import { OUTLET_RADIUS_MM, USAGE_COLORS } from './constants'

	let { file, page = 1, calibration, outlets, selectedIds, activeTool, toPx, toMm, onadd, onselect, onclear, onmove, ondelete }: {
		file: any
		page: number
		calibration: PageCalibration | null
		outlets: OutletConfig[]
		selectedIds: Set<string>
		activeTool: ToolMode
		toPx: (mm: Point) => Point
		toMm: (px: Point) => Point
		onadd: (pagePosPixels: Point) => void
		onselect: (id: string, multi: boolean) => void
		onclear: () => void
		onmove: (ids: Set<string>, dxMm: number, dyMm: number) => void
		ondelete: () => void
	} = $props()

	let containerEl: HTMLDivElement
	let canvasEl: HTMLCanvasElement
	let pdf: PdfState | null = null

	// Pan/zoom state
	let vx = $state(0)
	let vy = $state(0)
	let zoom = $state(1)
	let panning = $state(false)
	let grayscale = $state(true)

	// Page dimensions at RENDER_SCALE
	let pageW = $state(0)
	let pageH = $state(0)

	// Container dimensions
	let cw = $state(800)
	let ch = $state(600)

	const RENDER_SCALE = 2

	// Drag state
	let dragging = $state(false)
	let dragStart: { x: number; y: number; outletPositions: Map<string, Point> } | null = null

	// Drag-select
	let dragSelecting = $state(false)
	let dragSelectRect = $state<{ x1: number; y1: number; x2: number; y2: number } | null>(null)

	// Track current file URL to detect changes
	let currentUrl = ''

	onMount(() => {
		containerEl?.addEventListener('wheel', onWheel, { passive: false })
	})

	onDestroy(() => {
		containerEl?.removeEventListener('wheel', onWheel)
		pdf?.destroy()
	})

	// Load PDF when file changes
	$effect(() => {
		const url = file?.url
		if (!url || url === currentUrl) return
		currentUrl = url
		loadPdf(url)
	})

	// Re-render when page changes
	$effect(() => {
		const p = page
		if (pdf?.pdfDoc && p >= 1) renderPage(p)
	})

	async function loadPdf(url: string) {
		pdf?.destroy()
		pdf = new PdfState()
		try {
			await pdf.load(url)
			await renderPage(page)
		} catch (e) {
			console.error('Failed to load PDF:', e)
		}
	}

	async function renderPage(p: number) {
		if (!pdf?.pdfDoc || !canvasEl) return
		if (p < 1 || p > pdf.totalPages) return
		const dims = await pdf.getPageDimensions(p)
		pageW = dims.width
		pageH = dims.height
		fitToView()
		await tick()
		await pdf.render({ canvas: canvasEl, page: p, scale: RENDER_SCALE })
	}

	// ── Coordinate helpers ──

	function getPagePos(e: MouseEvent): Point {
		const rect = containerEl.getBoundingClientRect()
		return {
			x: (e.clientX - rect.left - vx) / zoom,
			y: (e.clientY - rect.top - vy) / zoom,
		}
	}

	function getWorldPos(e: MouseEvent): Point {
		return toMm(getPagePos(e))
	}

	/** Convert outlet mm position to PDF pixels for SVG rendering */
	function outletPx(outlet: OutletConfig): Point {
		return toPx(outlet.position)
	}

	/** Outlet radius in PDF pixels (fixed mm size) */
	let radiusPx = $derived(calibration ? OUTLET_RADIUS_MM / calibration.scaleFactor : 10)

	// ── View controls ──

	function fitToView() {
		if (!pageW || !pageH) return
		const pad = 40
		zoom = Math.min((cw - pad) / pageW, (ch - pad) / pageH, 4)
		vx = (cw - pageW * zoom) / 2
		vy = (ch - pageH * zoom) / 2
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault()
		if (e.ctrlKey || e.altKey || e.metaKey || e.buttons === 2) {
			doZoom(e)
		} else if (e.shiftKey || e.deltaX) {
			vx += (e.deltaY || e.deltaX) > 0 ? -80 : 80
		} else {
			vy += e.deltaY > 0 ? -80 : 80
		}
	}

	function doZoom(e: WheelEvent) {
		const rect = containerEl.getBoundingClientRect()
		const mx = e.clientX - rect.left
		const my = e.clientY - rect.top
		const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
		const newZoom = Math.min(8, Math.max(0.05, zoom * factor))
		const s = newZoom / zoom
		vx = mx - (mx - vx) * s
		vy = my - (my - vy) * s
		zoom = newZoom
	}

	function zoomIn() {
		const cx = cw / 2, cy = ch / 2
		const newZoom = Math.min(8, zoom * 1.3)
		const s = newZoom / zoom
		vx = cx - (cx - vx) * s
		vy = cy - (cy - vy) * s
		zoom = newZoom
	}

	function zoomOut() {
		const cx = cw / 2, cy = ch / 2
		const newZoom = Math.max(0.05, zoom / 1.3)
		const s = newZoom / zoom
		vx = cx - (cx - vx) * s
		vy = cy - (cy - vy) * s
		zoom = newZoom
	}

	// ── Mouse handling ──

	function onMouseDown(e: MouseEvent) {
		e.preventDefault()

		// Middle/right click = pan
		if (e.button === 1 || e.button === 2) {
			panning = true
			document.addEventListener('mousemove', onPanMove)
			document.addEventListener('mouseup', onPanUp)
			return
		}

		if (e.button !== 0) return

		const pos = getPagePos(e)

		// Outlet tool: place outlet
		if (activeTool === 'outlet' && calibration) {
			onadd(pos)
			return
		}

		// Select tool: check if clicking an outlet
		const hitId = hitTest(pos)
		if (hitId) {
			const alreadySelected = selectedIds.has(hitId)
			if (e.ctrlKey || e.metaKey) {
				onselect(hitId, true)
			} else if (!alreadySelected) {
				onselect(hitId, false)
			}
			// If already selected in a multi-selection, keep it for dragging

			// Start drag
			dragging = true
			dragStart = {
				x: pos.x, y: pos.y,
				outletPositions: new Map(
					outlets.filter(o => selectedIds.has(o.id) || o.id === hitId).map(o => [o.id, { ...o.position }])
				),
			}
			document.addEventListener('mousemove', onDragMove)
			document.addEventListener('mouseup', onDragUp)
			return
		}

		// Click on empty space: start drag-select or pan
		if (!(e.ctrlKey || e.metaKey)) onclear()

		dragSelecting = true
		dragSelectRect = { x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y }
		document.addEventListener('mousemove', onDragSelectMove)
		document.addEventListener('mouseup', onDragSelectUp)
	}

	function hitTest(pos: Point): string | null {
		// Test outlets in reverse order (topmost first)
		const r = radiusPx * 1.5 // generous hit area
		for (let i = outlets.length - 1; i >= 0; i--) {
			const o = outlets[i]
			const px = outletPx(o)
			const dx = pos.x - px.x
			const dy = pos.y - px.y
			if (dx * dx + dy * dy <= r * r) return o.id
		}
		return null
	}

	// Pan
	function onPanMove(e: MouseEvent) {
		vx += e.movementX
		vy += e.movementY
	}

	function onPanUp() {
		panning = false
		document.removeEventListener('mousemove', onPanMove)
		document.removeEventListener('mouseup', onPanUp)
	}

	// Outlet drag
	function onDragMove(e: MouseEvent) {
		if (!dragStart || !calibration) return
		const pos = getPagePos(e)
		const dxPx = pos.x - dragStart.x
		const dyPx = pos.y - dragStart.y
		const dxMm = dxPx * calibration.scaleFactor
		const dyMm = dyPx * calibration.scaleFactor

		// Update positions relative to drag start
		const ids = new Set(dragStart.outletPositions.keys())
		onmove(ids, dxMm, dyMm)

		// Update drag start to current for incremental moves
		dragStart.x = pos.x
		dragStart.y = pos.y
	}

	function onDragUp() {
		dragging = false
		dragStart = null
		document.removeEventListener('mousemove', onDragMove)
		document.removeEventListener('mouseup', onDragUp)
	}

	// Drag-select
	function onDragSelectMove(e: MouseEvent) {
		if (!dragSelectRect) return
		const pos = getPagePos(e)
		dragSelectRect = { ...dragSelectRect, x2: pos.x, y2: pos.y }
	}

	function onDragSelectUp() {
		if (dragSelectRect) {
			const x1 = Math.min(dragSelectRect.x1, dragSelectRect.x2)
			const x2 = Math.max(dragSelectRect.x1, dragSelectRect.x2)
			const y1 = Math.min(dragSelectRect.y1, dragSelectRect.y2)
			const y2 = Math.max(dragSelectRect.y1, dragSelectRect.y2)

			// Only select if dragged a meaningful distance
			if (x2 - x1 > 3 && y2 - y1 > 3) {
				const hits: string[] = []
				for (const o of outlets) {
					const px = outletPx(o)
					if (px.x >= x1 && px.x <= x2 && px.y >= y1 && px.y <= y2) {
						hits.push(o.id)
					}
				}
				if (hits.length > 0) {
					for (const id of hits) onselect(id, true)
				}
			}
		}
		dragSelecting = false
		dragSelectRect = null
		document.removeEventListener('mousemove', onDragSelectMove)
		document.removeEventListener('mouseup', onDragSelectUp)
	}

	// Touch support
	let pinchLastDist: number | null = null
	let lastPanMid: { x: number; y: number } | null = null

	function onTouchStart(e: TouchEvent) {
		if (e.touches.length === 2) {
			const [a, b] = e.touches
			pinchLastDist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
			lastPanMid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
		} else if (e.touches.length === 1) {
			panning = true
			lastPanMid = { x: e.touches[0].clientX, y: e.touches[0].clientY }
		}
	}

	function onTouchMove(e: TouchEvent) {
		if (e.touches.length === 2 && lastPanMid && pinchLastDist) {
			e.preventDefault()
			const [a, b] = e.touches
			const newMid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
			const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
			vx += newMid.x - lastPanMid.x
			vy += newMid.y - lastPanMid.y
			lastPanMid = newMid
			const scaleFactor = dist / pinchLastDist
			pinchLastDist = dist
			const newZoom = Math.min(8, Math.max(0.05, zoom * scaleFactor))
			const rect = containerEl.getBoundingClientRect()
			const mx = newMid.x - rect.left
			const my = newMid.y - rect.top
			const s = newZoom / zoom
			vx = mx - (mx - vx) * s
			vy = my - (my - vy) * s
			zoom = newZoom
		} else if (e.touches.length === 1 && panning && lastPanMid) {
			const t = e.touches[0]
			vx += t.clientX - lastPanMid.x
			vy += t.clientY - lastPanMid.y
			lastPanMid = { x: t.clientX, y: t.clientY }
		}
	}

	function onTouchEnd(e: TouchEvent) {
		if (e.touches.length < 2) pinchLastDist = null
		if (e.touches.length === 0) { panning = false; lastPanMid = null }
	}

	function onCanvasKeyDown(e: KeyboardEvent) {
		if (e.key === '+' || e.key === '=') zoomIn()
		else if (e.key === '-') zoomOut()
		else if (e.key === '0') fitToView()
	}
</script>

<svelte:window bind:innerWidth={cw} bind:innerHeight={ch} onkeydown={onCanvasKeyDown} />

{#if !file?.url}
	<div class="h-full flex items-center justify-center bg-gray-50">
		<div class="text-center text-gray-400">
			<Icon name="fileText" class="h-10 w-10 mx-auto mb-2 text-gray-300" />
			<p class="text-sm">Select a floorplan from the sidebar</p>
		</div>
	</div>
{:else}
	<!-- Toolbar -->
	<div class="h-8 px-3 flex items-center gap-2 border-b border-gray-200 bg-white shrink-0 text-xs">
		<!-- Tool buttons -->
		<button
			class="flex items-center gap-1 px-2 py-1 rounded transition-colors
				{activeTool === 'select' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}"
			onclick={() => activeTool = 'select'}
			title="Select (Esc)">
			<Icon name="select" size={13} />
		</button>
		<button
			class="flex items-center gap-1 px-2 py-1 rounded transition-colors
				{activeTool === 'outlet' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}"
			onclick={() => activeTool = 'outlet'}
			title="Place outlet (O)">
			<Icon name="ellipse" size={13} />
			Outlet
		</button>

		{#if !calibration}
			<span class="text-amber-600 text-[10px] ml-2">Page not calibrated — set origin and scale in uploads</span>
		{/if}

		<div class="flex-1"></div>

		<!-- Zoom -->
		<button class="text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded hover:bg-gray-100 text-sm font-bold leading-none" onclick={zoomOut} title="Zoom out (-)">&#x2212;</button>
		<span class="text-[10px] text-gray-400 tabular-nums min-w-10 text-center">{Math.round(zoom * 100)}%</span>
		<button class="text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded hover:bg-gray-100 text-sm font-bold leading-none" onclick={zoomIn} title="Zoom in (+)">+</button>
		<button class="text-[10px] text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100" onclick={fitToView} title="Fit to view (0)">Fit</button>

		<div class="w-px h-4 bg-gray-200"></div>
		<button
			class="flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors {grayscale ? 'bg-gray-200 text-gray-700' : 'text-gray-400 hover:bg-gray-100'}"
			onclick={() => grayscale = !grayscale}>
			{grayscale ? 'Color' : 'B/W'}
		</button>

		{#if selectedIds.size > 0}
			<div class="w-px h-4 bg-gray-200"></div>
			<button class="flex items-center gap-1 text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 text-[11px] whitespace-nowrap"
				onclick={() => ondelete()} title="Delete selected (Del)">
				<Icon name="trash" size={12} />
				{selectedIds.size}
			</button>
		{/if}
	</div>

	<!-- Canvas area -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div bind:this={containerEl}
		class="flex-1 overflow-hidden bg-gray-100
			{activeTool === 'outlet' && calibration ? 'cursor-crosshair' : panning ? 'cursor-grabbing' : 'cursor-default'}"
		onmousedown={onMouseDown}
		oncontextmenu={e => e.preventDefault()}
		ontouchstart={onTouchStart}
		ontouchmove={onTouchMove}
		ontouchend={onTouchEnd}>

		<div style:transform="translate({vx}px, {vy}px) scale({zoom})" style:transform-origin="0 0" class="relative">
			<!-- PDF canvas -->
			<canvas bind:this={canvasEl} class="shadow-lg will-change-transform" style:filter={grayscale ? 'grayscale(0.8)' : 'none'}></canvas>

			<!-- SVG overlay -->
			<svg class="absolute top-0 left-0 pointer-events-none" width={pageW} height={pageH} style:overflow="visible">
				<!-- Outlets -->
				{#each outlets as outlet (outlet.id)}
					{@const px = outletPx(outlet)}
					{@const colors = USAGE_COLORS[outlet.usage]}
					{@const selected = selectedIds.has(outlet.id)}
					<g class="pointer-events-auto" style:cursor={activeTool === 'select' ? 'pointer' : undefined}>
						<!-- Hit area (larger) -->
						<circle cx={px.x} cy={px.y} r={radiusPx * 1.5}
							fill="transparent"
							onmousedown={e => { if (e.button === 0 && activeTool === 'select') { e.stopPropagation(); onMouseDown(e) }}} />

						<!-- Selection highlight -->
						{#if selected}
							<circle cx={px.x} cy={px.y} r={radiusPx + 4 / zoom}
								fill="none" stroke="#06b6d4" stroke-width={2 / zoom} />
						{/if}

						<!-- Outlet circle -->
						{#if outlet.level === 'low'}
							<circle cx={px.x} cy={px.y} r={radiusPx}
								fill={colors.fill} stroke={colors.stroke} stroke-width={1.5 / zoom} opacity="0.85" />
						{:else}
							<circle cx={px.x} cy={px.y} r={radiusPx}
								fill="none" stroke={colors.stroke} stroke-width={2.5 / zoom} opacity="0.85" />
						{/if}

						<!-- Port count -->
						<text x={px.x} y={px.y + radiusPx * 0.35}
							text-anchor="middle" font-size={radiusPx * 0.9}
							fill={outlet.level === 'low' ? 'white' : colors.stroke} font-weight="bold"
							class="select-none pointer-events-none">{outlet.portCount}</text>

						<!-- Label -->
						{#if outlet.label}
							<text x={px.x} y={px.y - radiusPx - 4 / zoom}
								text-anchor="middle" font-size={Math.max(8 / zoom, radiusPx * 0.6)}
								fill="#374151" class="select-none pointer-events-none">{outlet.label}</text>
						{/if}
					</g>
				{/each}

				<!-- Origin crosshair (if calibrated) -->
				{#if calibration}
					{@const ox = calibration.origin.x}
					{@const oy = calibration.origin.y}
					<circle cx={ox} cy={oy} r={12 / zoom} fill="none" stroke="#3b82f6" stroke-width={1 / zoom} opacity="0.5" />
					<line x1={ox - 18 / zoom} y1={oy} x2={ox + 18 / zoom} y2={oy} stroke="#3b82f6" stroke-width={0.5 / zoom} opacity="0.5" />
					<line x1={ox} y1={oy - 18 / zoom} x2={ox} y2={oy + 18 / zoom} stroke="#3b82f6" stroke-width={0.5 / zoom} opacity="0.5" />
				{/if}

				<!-- Drag-select rectangle -->
				{#if dragSelectRect}
					{@const x = Math.min(dragSelectRect.x1, dragSelectRect.x2)}
					{@const y = Math.min(dragSelectRect.y1, dragSelectRect.y2)}
					{@const w = Math.abs(dragSelectRect.x2 - dragSelectRect.x1)}
					{@const h = Math.abs(dragSelectRect.y2 - dragSelectRect.y1)}
					<rect {x} {y} width={w} height={h}
						fill="rgba(6, 182, 212, 0.1)" stroke="#06b6d4" stroke-width={1 / zoom}
						stroke-dasharray="{4 / zoom} {3 / zoom}" />
				{/if}
			</svg>
		</div>
	</div>
{/if}
