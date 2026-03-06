<script lang="ts">
	import { tick } from 'svelte'
	import { onMount, onDestroy } from 'svelte'
	import { Icon } from '$lib'
	import { PdfState } from './pdf-viewer-sample/assets/PdfState.svelte'

	let { url, name, onclose }: {
		url: string
		name: string
		onclose: () => void
	} = $props()

	let containerEl: HTMLDivElement
	let canvasEl: HTMLCanvasElement
	let pdf: PdfState | null = null
	let mounted = true

	let loading = $state(true)
	let error = $state('')
	let pageNum = $state(1)
	let totalPages = $state(0)

	// Pan/zoom state
	let vx = $state(0)
	let vy = $state(0)
	let zoom = $state(1)
	let panning = $state(false)

	// Page dimensions at scale=1 (PDF points)
	let pageW = $state(0)
	let pageH = $state(0)

	// Container dimensions
	let cw = $state(800)
	let ch = $state(600)

	// Fixed render scale — renders once at high quality, CSS zoom handles the rest
	const RENDER_SCALE = 2

	onMount(async () => {
		try {
			pdf = new PdfState()
			await pdf.load(url)
			totalPages = pdf.totalPages
			const dims = await pdf.getPageDimensions(1)
			pageW = dims.width
			pageH = dims.height
			fitToView()
			loading = false
			await tick()
			containerEl?.addEventListener('wheel', onWheel, { passive: false })
			await pdf.render({ canvas: canvasEl, page: 1, scale: RENDER_SCALE })
		} catch (e: any) {
			error = e.message ?? 'Failed to load PDF'
			loading = false
		}
	})

	onDestroy(() => {
		mounted = false
		containerEl?.removeEventListener('wheel', onWheel)
		pdf?.destroy()
	})

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
		fitToView()
		await pdf.render({ canvas: canvasEl, page: n, scale: RENDER_SCALE })
	}

	// ── Pan/Zoom handlers ──

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

	function onMouseDown(e: MouseEvent) {
		if (e.button === 0 || e.button === 1 || e.button === 2) {
			e.preventDefault()
			panning = true
			document.addEventListener('mousemove', onMouseMove)
			document.addEventListener('mouseup', onMouseUp)
		}
	}

	function onMouseMove(e: MouseEvent) {
		if (!panning) return
		vx += e.movementX
		vy += e.movementY
	}

	function onMouseUp() {
		panning = false
		document.removeEventListener('mousemove', onMouseMove)
		document.removeEventListener('mouseup', onMouseUp)
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
		if (e.touches.length < 2) { pinchLastDist = null }
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
		if (e.key === 'Escape') onclose()
		else if (e.key === 'ArrowLeft' || e.key === 'PageUp') goToPage(pageNum - 1)
		else if (e.key === 'ArrowRight' || e.key === 'PageDown') goToPage(pageNum + 1)
		else if (e.key === 'Home') goToPage(1)
		else if (e.key === 'End') goToPage(totalPages)
		else if (e.key === '+' || e.key === '=') zoomIn()
		else if (e.key === '-') zoomOut()
		else if (e.key === '0') fitToView()
	}
</script>

<svelte:window bind:innerWidth={cw} bind:innerHeight={ch} onkeydown={onKeyDown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="h-screen bg-gray-900 flex flex-col" oncontextmenu={e => e.preventDefault()}>
	<!-- Toolbar -->
	<div class="flex items-center gap-2 px-3 py-1.5 bg-gray-800 border-b border-gray-700 shrink-0">
		<button class="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-700" onclick={onclose} title="Back (Esc)">
			<Icon name="chevronLeft" size={16} />
		</button>

		<span class="text-xs text-gray-300 truncate max-w-80" title={name}>{name}</span>

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
		<button class="text-gray-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-gray-700 text-sm font-bold leading-none" onclick={zoomOut} title="Zoom out (-)">−</button>
		<span class="text-xs text-gray-400 tabular-nums min-w-10 text-center">{Math.round(zoom * 100)}%</span>
		<button class="text-gray-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-gray-700 text-sm font-bold leading-none" onclick={zoomIn} title="Zoom in (+)">+</button>
		<button class="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700" onclick={fitToView} title="Fit to view (0)">
			Fit
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
			class="flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
			onmousedown={onMouseDown}
			ontouchstart={onTouchStart}
			ontouchmove={onTouchMove}
			ontouchend={onTouchEnd}>
			<div style:transform="translate({vx}px, {vy}px) scale({zoom})" style:transform-origin="0 0">
				<canvas bind:this={canvasEl} class="shadow-2xl"></canvas>
			</div>
		</div>
	{/if}
</div>
