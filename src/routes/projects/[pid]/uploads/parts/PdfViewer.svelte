<script lang="ts">
	import { tick } from 'svelte'
	import { onMount, onDestroy } from 'svelte'
	import { Icon, Firestore, Titlebar, MetalButton } from '$lib'
	import { PdfState } from './PdfState.svelte.ts'
	import DimensionLine from './DimensionLine.svelte'
	import { dragDimension, isHorizontal } from './DimensionLine.ts'

	let { url, name, fileDoc = $bindable(), initialTool = null, onclose }: {
		url: string
		name: string
		fileDoc: any
		initialTool?: string | null
		onclose: () => void
	} = $props()

	let db = new Firestore()

	let containerEl: HTMLDivElement
	let canvasEl: HTMLCanvasElement
	let pdf: PdfState | null = null

	let loading = $state(true)
	let error = $state('')
	let pageNum = $state(1)
	let totalPages = $state(0)

	// Pan/zoom state
	let vx = $state(0)
	let vy = $state(0)
	let zoom = $state(1)
	let panning = $state(false)

	// Page dimensions at RENDER_SCALE (for SVG overlay sizing)
	let pageW = $state(0)
	let pageH = $state(0)

	// Container dimensions
	let cw = $state(800)
	let ch = $state(600)

	const RENDER_SCALE = 2

	// ── Tool state ──
	type Tool = null | 'origin' | 'scale' | 'crop'
	let activeTool = $state<Tool>(null)

	// Origin
	let origin = $state({ x: 50, y: 50 })

	// Scale / dimension line
	let dimLine = $state<any>({ x1: 100, y1: 100, x2: 300, y2: 100, offset: 30, units: 'mm', distance: 1000, scale: 1 })
	let dimHandle = 0

	// Crop
	let cropRect = $state({ x: 0, y: 0, width: 0, height: 0 })
	let cropHandle = 0
	let cropStart = { x: 0, y: 0, width: 0, height: 0, mx: 0, my: 0 }

	// Crop resize handles: mask values for edges (1=R, 2=B, 4=L, 8=T) and corners
	const cropHandles = [
		{ mask: 1,  cursor: 'ew-resize' },   // right edge
		{ mask: 2,  cursor: 'ns-resize' },   // bottom edge
		{ mask: 4,  cursor: 'ew-resize' },   // left edge
		{ mask: 8,  cursor: 'ns-resize' },   // top edge
		{ mask: 3,  cursor: 'nwse-resize' }, // bottom-right
		{ mask: 6,  cursor: 'nesw-resize' }, // bottom-left
		{ mask: 9,  cursor: 'nesw-resize' }, // top-right
		{ mask: 12, cursor: 'nwse-resize' }, // top-left
	]

	// Track if tool data has been modified since last save
	let dirty = $state(false)
	let grayscale = $state(true)

	onMount(async () => {
		try {
			pdf = new PdfState()
			await pdf.load(url)
			totalPages = pdf.totalPages
			if (fileDoc?.id && fileDoc.pageCount !== totalPages) {
				fileDoc.pageCount = totalPages
				db.save('files', { id: fileDoc.id, pageCount: totalPages })
			}
			const dims = await pdf.getPageDimensions(1)
			pageW = dims.width
			pageH = dims.height
			loadPageData(1)
			fitToView()
			loading = false
			await tick()
			containerEl?.addEventListener('wheel', onWheel, { passive: false })
			await pdf.render({ canvas: canvasEl, page: 1, scale: RENDER_SCALE })
			if (initialTool === 'origin' || initialTool === 'scale' || initialTool === 'crop') {
				await tick()
				activeTool = initialTool as Tool
			}
		} catch (e: any) {
			error = e.message ?? 'Failed to load PDF'
			loading = false
		}
	})

	onDestroy(() => {
		containerEl?.removeEventListener('wheel', onWheel)
		pdf?.destroy()
	})

	// ── Page data (origin, scale, crop) stored in fileDoc.pages[pageNum] ──

	function loadPageData(page: number) {
		const pages = fileDoc?.pages ?? {}
		const p = pages[page] ?? {}
		if (p.origin) origin = { ...p.origin }
		if (p.scale) dimLine = { ...dimLine, ...p.scale }
		if (p.crop) cropRect = { ...p.crop }
		else cropRect = { x: 0, y: 0, width: 0, height: 0 }
		dirty = false
	}

	function savePageProp(prop: string, value: any) {
		if (!fileDoc?.id) return
		const pages = fileDoc.pages ?? {}
		pages[pageNum] = pages[pageNum] ?? {}
		pages[pageNum][prop] = value
		fileDoc.pages = pages
		db.save('files', { id: fileDoc.id, pages })
		dirty = false
	}

	function saveOrigin() {
		savePageProp('origin', { x: Math.round(origin.x), y: Math.round(origin.y) })
	}

	function saveScale() {
		if (!dimLine.distance) return
		const abs = Math.abs
		const pixelDist = isHorizontal(dimLine)
			? abs(dimLine.x2 - dimLine.x1)
			: abs(dimLine.y2 - dimLine.y1)
		if (pixelDist < 1) return
		dimLine.scale = Math.round(dimLine.distance / pixelDist * 1000) / 1000
		savePageProp('scale', { ...dimLine })
	}

	function saveCrop() {
		savePageProp('crop', {
			x: Math.round(cropRect.x),
			y: Math.round(cropRect.y),
			width: Math.round(cropRect.width),
			height: Math.round(cropRect.height),
		})
	}

	function setTool(tool: Tool) {
		activeTool = activeTool === tool ? null : tool
		dirty = false
	}

	// ── Fit / navigate ──

	function fitToView() {
		if (!pageW || !pageH) return
		const pad = 40
		const viewH = ch - 38
		const scaleX = (cw - pad) / pageW
		const scaleY = (viewH - pad) / pageH
		zoom = Math.min(scaleX, scaleY, 4)
		vx = (cw - pageW * zoom) / 2
		vy = (viewH - pageH * zoom) / 2
	}

	async function goToPage(n: number) {
		if (n < 1 || n > totalPages || n === pageNum || !pdf?.pdfDoc) return
		pageNum = n
		const dims = await pdf.getPageDimensions(n)
		pageW = dims.width
		pageH = dims.height
		loadPageData(n)
		fitToView()
		await pdf.render({ canvas: canvasEl, page: n, scale: RENDER_SCALE })
	}

	// ── Get mouse position in PDF-page coordinates (accounting for pan/zoom) ──

	function getPagePos(e: MouseEvent) {
		const rect = containerEl.getBoundingClientRect()
		return {
			x: (e.clientX - rect.left - vx) / zoom,
			y: (e.clientY - rect.top - vy) / zoom,
		}
	}

	// ── Wheel ──

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

	// ── Mouse handling ──

	function onMouseDown(e: MouseEvent) {
		e.preventDefault()

		const isPan = e.button === 1 || e.button === 2
		if (isPan) {
			panning = true
			document.addEventListener('mousemove', onPanMove)
			document.addEventListener('mouseup', onPanUp)
			return
		}

		// Left click with a tool active
		if (activeTool && e.button === 0) {
			const pos = getPagePos(e)

			if (activeTool === 'origin') {
				origin = { x: pos.x, y: pos.y }
				dirty = true
				document.addEventListener('mousemove', onOriginMove)
				document.addEventListener('mouseup', onOriginUp)
				return
			}

			if (activeTool === 'scale') {
				dimHandle = +((e.target as HTMLElement)?.dataset?.id ?? 0)
				dimLine.sx = pos.x  // set start pos for handle 8 (move whole line)
				dimLine.sy = pos.y
				document.addEventListener('mousemove', onScaleMove)
				document.addEventListener('mouseup', onScaleUp)
				if (!dimHandle) {
					// Start new line from click point
					dimLine.x1 = pos.x
					dimLine.y1 = pos.y
					dimLine.x2 = pos.x
					dimLine.y2 = pos.y
					dimHandle = 2 // drag end-point
				}
				dirty = true
				return
			}

			if (activeTool === 'crop') {
				cropHandle = +((e.target as HTMLElement)?.dataset?.id ?? 0)
				const p = getPagePos(e)
				if (cropHandle) {
					// Dragging a handle or the interior (15)
					cropStart = { ...cropRect, mx: p.x, my: p.y }
				} else {
					// Click on empty space — start new crop
					cropRect = { x: p.x, y: p.y, width: 0, height: 0 }
					cropHandle = 3 // drag bottom-right
					cropStart = { x: p.x, y: p.y, width: 0, height: 0, mx: p.x, my: p.y }
				}
				document.addEventListener('mousemove', onCropMove)
				document.addEventListener('mouseup', onCropUp)
				dirty = true
				return
			}
		}

		// Default: pan
		panning = true
		document.addEventListener('mousemove', onPanMove)
		document.addEventListener('mouseup', onPanUp)
	}

	function onPanMove(e: MouseEvent) {
		vx += e.movementX
		vy += e.movementY
	}

	function onPanUp() {
		panning = false
		document.removeEventListener('mousemove', onPanMove)
		document.removeEventListener('mouseup', onPanUp)
	}

	// Origin drag
	function onOriginMove(e: MouseEvent) {
		const pos = getPagePos(e)
		origin = { x: pos.x, y: pos.y }
	}

	function onOriginUp() {
		document.removeEventListener('mousemove', onOriginMove)
		document.removeEventListener('mouseup', onOriginUp)
	}

	// Scale drag
	function onScaleMove(e: MouseEvent) {
		const pos = getPagePos(e)
		dragDimension(dimLine, dimHandle, pos)
		dimLine.sx = pos.x  // update for next move (handle 8 uses delta from sx/sy)
		dimLine.sy = pos.y
		dimLine = dimLine // trigger reactivity
	}

	function onScaleUp() {
		dimHandle = 0
		document.removeEventListener('mousemove', onScaleMove)
		document.removeEventListener('mouseup', onScaleUp)
	}

	// Crop drag
	function onCropMove(e: MouseEvent) {
		const pos = getPagePos(e)
		const dx = pos.x - cropStart.mx
		const dy = pos.y - cropStart.my
		let { x, y, width: w, height: h } = cropStart

		if (cropHandle === 15) {
			// Move whole rect
			x += dx; y += dy
			if (x < 0) x = 0
			if (y < 0) y = 0
			if (x + w > pageW) x = pageW - w
			if (y + h > pageH) y = pageH - h
		} else {
			if (cropHandle & 1) w += dx  // right
			if (cropHandle & 2) h += dy  // bottom
			if (cropHandle & 4) { x += dx; w -= dx }  // left
			if (cropHandle & 8) { y += dy; h -= dy }  // top

			// Normalize negative dimensions
			if (w < 0) { x += w; w = -w }
			if (h < 0) { y += h; h = -h }

			// Clamp to page bounds
			if (x < 0) { w += x; x = 0 }
			if (y < 0) { h += y; y = 0 }
			if (x + w > pageW) w = pageW - x
			if (y + h > pageH) h = pageH - y
		}

		cropRect = { x, y, width: w, height: h }
	}

	function onCropUp() {
		cropHandle = 0
		document.removeEventListener('mousemove', onCropMove)
		document.removeEventListener('mouseup', onCropUp)
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

	function zoomIn() {
		const cx = cw / 2, cy = (ch - 38) / 2
		const newZoom = Math.min(8, zoom * 1.3)
		const s = newZoom / zoom
		vx = cx - (cx - vx) * s
		vy = cy - (cy - vy) * s
		zoom = newZoom
	}

	function zoomOut() {
		const cx = cw / 2, cy = (ch - 38) / 2
		const newZoom = Math.max(0.05, zoom / 1.3)
		const s = newZoom / zoom
		vx = cx - (cx - vx) * s
		vy = cy - (cy - vy) * s
		zoom = newZoom
	}

	function onKeyDown(e: KeyboardEvent) {
		const tag = (e.target as HTMLElement).tagName
		if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
		if (e.key === 'Escape') {
			if (activeTool) { activeTool = null; dirty = false }
			else onclose()
		}
		else if (e.key === 'ArrowLeft' || e.key === 'PageUp') goToPage(pageNum - 1)
		else if (e.key === 'ArrowRight' || e.key === 'PageDown') goToPage(pageNum + 1)
		else if (e.key === 'Home') fitToView()
		else if (e.key === 'End') goToPage(totalPages)
		else if (e.key === '+' || e.key === '=') zoomIn()
		else if (e.key === '-') zoomOut()
	}

	// ── Status helpers ──

	function hasOrigin(): boolean {
		const p = (fileDoc?.pages ?? {})[pageNum]
		return !!p?.origin
	}

	function hasScale(): boolean {
		const p = (fileDoc?.pages ?? {})[pageNum]
		return !!(p?.scale?.scale)
	}

	function hasCrop(): boolean {
		const p = (fileDoc?.pages ?? {})[pageNum]
		return !!p?.crop
	}
</script>

<svelte:window bind:innerWidth={cw} bind:innerHeight={ch} onkeydown={onKeyDown} />

<!-- <Titlebar title={projectName ? `${projectName} — Uploads` : 'Uploads'} /> -->
<Titlebar title='PDF Viewer' />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="h-screen bg-gray-900 flex flex-col" oncontextmenu={e => e.preventDefault()}>
	<!-- Toolbar -->
	<div class="flex items-center gap-2 px-3 py-1.5 bg-gray-800 border-b border-gray-700 shrink-0">
		<button class="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-700" onclick={onclose} title="Back (Esc)">
			<Icon name="chevronLeft" size={16} />
		</button>

		<button class="text-xs text-gray-300 hover:text-white truncate max-w-60" title={name} onclick={onclose}>{name}</button>

		<div class="w-px h-4 bg-gray-700 mx-1"></div>

		<!-- Tool buttons -->
		<button
			class="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors {activeTool === 'origin' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}"
			onclick={() => setTool('origin')}
			title="Set origin point">
			<Icon name="crosshair" size={13} />
			Origin
			{#if hasOrigin() && activeTool !== 'origin'}<span class="w-1.5 h-1.5 rounded-full bg-green-400"></span>{/if}
		</button>

		<button
			class="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors {activeTool === 'scale' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}"
			onclick={() => setTool('scale')}
			title="Set scale with dimension line">
			<Icon name="ruler" size={13} />
			Scale
			{#if hasScale() && activeTool !== 'scale'}<span class="w-1.5 h-1.5 rounded-full bg-green-400"></span>{/if}
		</button>

		<button
			class="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors {activeTool === 'crop' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}"
			onclick={() => setTool('crop')}
			title="Crop drawing area">
			<Icon name="crop" size={13} />
			Crop
			{#if hasCrop() && activeTool !== 'crop'}<span class="w-1.5 h-1.5 rounded-full bg-green-400"></span>{/if}
		</button>

		<!-- Tool-specific controls -->
		{#if activeTool === 'origin'}
			<div class="w-px h-4 bg-gray-700 mx-1"></div>
			<span class="text-xs text-gray-400">Click to place origin</span>
			<span class="text-xs text-gray-500 tabular-nums">{Math.round(origin.x)}, {Math.round(origin.y)}</span>
			<button class="px-2 py-0.5 text-xs rounded border border-gray-400 text-gray-400 hover:bg-gray-600" onclick={() => { dirty = true }}>Reset</button>
			<button class="px-2 py-0.5 text-xs rounded {dirty ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}"
				onclick={saveOrigin}>Save</button>
		{:else if activeTool === 'scale'}
			<div class="w-px h-4 bg-gray-700 mx-1"></div>
			<span class="text-xs text-gray-400">Drag endpoints on drawing</span>
			<span class="text-xs text-gray-500">Distance:</span>
			<input type="number" bind:value={dimLine.distance}
				class="w-20 h-6 px-2 text-xs text-right text-white bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-blue-400"
				oninput={() => dirty = true} />
			<span class="text-xs text-gray-500">mm</span>
			<button class="px-2 py-0.5 text-xs rounded border border-gray-400 text-gray-400 hover:bg-gray-600" onclick={() => { dirty = true }}>Reset</button>
			<button class="px-2 py-0.5 text-xs rounded {dirty ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}"
				onclick={saveScale}>Save</button>
		{:else if activeTool === 'crop'}
			<div class="w-px h-4 bg-gray-700 mx-1"></div>
			<span class="text-xs text-gray-400">Drag to crop</span>
			<span class="text-xs text-gray-500 tabular-nums">{Math.round(cropRect.width)} x {Math.round(cropRect.height)}</span>
			<button class="px-2 py-0.5 text-xs rounded bg-gray-700 text-gray-400 hover:bg-gray-600"
				onclick={() => { cropRect = { x: 0, y: 0, width: 0, height: 0 }; dirty = true }}>Clear</button>
			<button class="px-2 py-0.5 text-xs rounded {dirty ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}"
				onclick={saveCrop}>Save</button>
		{/if}

		<MetalButton variant="green">SAVE</MetalButton>

		<div class="flex-1"></div>

		<!-- Page nav -->
		{#if totalPages > 1}
			<button class="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-700 disabled:opacity-30"
				onclick={() => goToPage(pageNum - 1)} disabled={pageNum <= 1} title="Previous page">
				<Icon name="chevronLeft" size={14} />
			</button>
			<span class="text-xs text-gray-300 tabular-nums min-w-12 text-center">{pageNum} / {totalPages}</span>
			<button class="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-700 disabled:opacity-30"
				onclick={() => goToPage(pageNum + 1)} disabled={pageNum >= totalPages} title="Next page">
				<Icon name="chevronRight" size={14} />
			</button>
			<div class="w-px h-4 bg-gray-700 mx-1"></div>
		{/if}

		<!-- Zoom controls -->
		<button class="text-gray-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-gray-700 text-sm font-bold leading-none" onclick={zoomOut} title="Zoom out (-)">&#x2212;</button>
		<span class="text-xs text-gray-400 tabular-nums min-w-10 text-center">{Math.round(zoom * 100)}%</span>
		<button class="text-gray-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-gray-700 text-sm font-bold leading-none" onclick={zoomIn} title="Zoom in (+)">+</button>
		<button class="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700" onclick={fitToView} title="Fit to view (Home)">
			Fit
		</button>

		<div class="w-px h-4 bg-gray-700 mx-1"></div>
		<button
			class="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors {grayscale ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}"
			onclick={() => grayscale = !grayscale}
			title="Toggle grayscale">
			{grayscale ? 'Color' : 'B/W'}
		</button>
	</div>

	<!-- Canvas -->
	{#if loading}
		<div class="flex-1 flex items-center justify-center">
			<div class="text-gray-400 text-sm flex items-center gap-2">
				<Icon name="spinner" size={16} class="animate-spin" /> Loading PDF...
			</div>
		</div>
	{:else if error}
		<div class="flex-1 flex items-center justify-center">
			<div class="text-red-400 text-sm">{error}</div>
		</div>
	{:else}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div bind:this={containerEl}
			class="flex-1 overflow-hidden {activeTool ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}"
			onmousedown={onMouseDown}
			ontouchstart={onTouchStart}
			ontouchmove={onTouchMove}
			ontouchend={onTouchEnd}>
			<div style:transform="translate({vx}px, {vy}px) scale({zoom})" style:transform-origin="0 0" class="relative">
				<canvas bind:this={canvasEl} class="shadow-2xl" style:filter={grayscale ? 'grayscale(0.8)' : 'none'}></canvas>

				<!-- SVG overlay for tools (same size as PDF page at scale=1) -->
				<svg class="absolute top-0 left-0 pointer-events-none" width={pageW} height={pageH}>

					<!-- Origin crosshair (always visible when origin has been set, or tool is active) -->
					{#if activeTool === 'origin' || hasOrigin()}
						<g class="origin" style:--o-color={activeTool === 'origin' ? '#ef4444' : '#3b82f6'}>
							<circle cx={origin.x} cy={origin.y} r={20 / zoom} fill="none" stroke={activeTool === 'origin' ? '#ef4444' : '#3b82f6'} stroke-width={2 / zoom} />
							<line x1={origin.x - 30 / zoom} y1={origin.y} x2={origin.x + 30 / zoom} y2={origin.y}
								stroke={activeTool === 'origin' ? '#ef4444' : '#3b82f6'} stroke-width={1 / zoom} />
							<line x1={origin.x} y1={origin.y - 30 / zoom} x2={origin.x} y2={origin.y + 30 / zoom}
								stroke={activeTool === 'origin' ? '#ef4444' : '#3b82f6'} stroke-width={1 / zoom} />
						</g>
					{/if}

					<!-- Dimension line (visible when scale tool active or scale saved) -->
					{#if activeTool === 'scale' || hasScale()}
						<g class="pointer-events-auto">
							<DimensionLine size={dimLine} selected={activeTool === 'scale'} stroke={activeTool === 'scale' ? '#ef4444' : '#3b82f6'} />
						</g>
					{/if}

					<!-- Crop rectangle -->
					{#if activeTool === 'crop'}
						<g class="pointer-events-auto">
							{#if cropRect.width > 0 && cropRect.height > 0}
								<!-- Dimmed area outside crop -->
								<path d="M0,0 H{pageW} V{pageH} H0 Z M{cropRect.x},{cropRect.y} V{cropRect.y + cropRect.height} H{cropRect.x + cropRect.width} V{cropRect.y} Z"
									fill="rgba(0,0,0,0.4)" fill-rule="evenodd" pointer-events="none" />

								<!-- Crop interior (draggable) -->
								<rect data-id="15" x={cropRect.x} y={cropRect.y} width={cropRect.width} height={cropRect.height}
									fill="transparent" cursor="move" />

								<!-- Crop border -->
								<rect x={cropRect.x} y={cropRect.y} width={cropRect.width} height={cropRect.height}
									fill="none" stroke="#ef4444" stroke-width={2 / zoom} stroke-dasharray="{6 / zoom} {4 / zoom}" pointer-events="none" />

								<!-- Resize handles: edges (invisible wide hit areas) -->
								<rect data-id="1" x={cropRect.x + cropRect.width - 4 / zoom} y={cropRect.y} width={8 / zoom} height={cropRect.height}
									fill="transparent" cursor="ew-resize" />
								<rect data-id="2" x={cropRect.x} y={cropRect.y + cropRect.height - 4 / zoom} width={cropRect.width} height={8 / zoom}
									fill="transparent" cursor="ns-resize" />
								<rect data-id="4" x={cropRect.x - 4 / zoom} y={cropRect.y} width={8 / zoom} height={cropRect.height}
									fill="transparent" cursor="ew-resize" />
								<rect data-id="8" x={cropRect.x} y={cropRect.y - 4 / zoom} width={cropRect.width} height={8 / zoom}
									fill="transparent" cursor="ns-resize" />

								<!-- Corner handles (visible squares) -->
								<rect data-id="12" x={cropRect.x - 6 / zoom} y={cropRect.y - 6 / zoom} width={12 / zoom} height={12 / zoom}
									fill="white" stroke="#ef4444" stroke-width={1 / zoom} cursor="nwse-resize" />
								<rect data-id="9" x={cropRect.x + cropRect.width - 6 / zoom} y={cropRect.y - 6 / zoom} width={12 / zoom} height={12 / zoom}
									fill="white" stroke="#ef4444" stroke-width={1 / zoom} cursor="nesw-resize" />
								<rect data-id="6" x={cropRect.x - 6 / zoom} y={cropRect.y + cropRect.height - 6 / zoom} width={12 / zoom} height={12 / zoom}
									fill="white" stroke="#ef4444" stroke-width={1 / zoom} cursor="nesw-resize" />
								<rect data-id="3" x={cropRect.x + cropRect.width - 6 / zoom} y={cropRect.y + cropRect.height - 6 / zoom} width={12 / zoom} height={12 / zoom}
									fill="white" stroke="#ef4444" stroke-width={1 / zoom} cursor="nwse-resize" />
							{/if}
						</g>
					{:else if hasCrop()}
						<!-- Show saved crop outline faintly when not in crop tool -->
						{@const c = (fileDoc?.pages ?? {})[pageNum]?.crop}
						{#if c}
							<rect x={c.x} y={c.y} width={c.width} height={c.height}
								fill="none" stroke="#3b82f6" stroke-width={1 / zoom} stroke-dasharray="{4 / zoom} {3 / zoom}" opacity="0.5" />
						{/if}
					{/if}
				</svg>
			</div>
		</div>
	{/if}
</div>
