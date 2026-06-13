<script lang="ts">
	import { isMacLikePlatform, normalizeWheelToPixels, wheelZoomFactorFromEvent } from '$lib/ui/panzoom-controller'
	import type { ViewState } from './types'

	let { view = $bindable(), width, height, children }: {
		view: ViewState
		width: number
		height: number
		children?: any
	} = $props()

	// `$state()` so bind:this triggers the $effect that attaches the wheel
	// listener — plain `let` raced mount timing in some embed paths.
	let canvas: HTMLDivElement | null = $state(null)
	let gw = $derived(view.grid * view.zoom)
	let gx = $derived(view.x % gw)
	let gy = $derived(view.y % gw)

	let zoomTarget = view.zoom
	let zoomAnimation: number | null = null
	let lastPanClient: { x: number; y: number } | null = null
	const IS_MAC = isMacLikePlatform()
	const WHEEL_PAN_SPEED = IS_MAC ? 0.4 : 0.9
	const WHEEL_ZOOM_SPEED = IS_MAC ? 0.0038 : 0.0025

	$effect(() => {
		canvas?.addEventListener('wheel', onwheel, { passive: false })
		return () => { canvas?.removeEventListener('wheel', onwheel) }
	})

	function onwheel(e: WheelEvent) {
		e.preventDefault()
		if (e.ctrlKey || e.altKey || e.metaKey || e.buttons == 2) {
			doZoom(e)
			return
		}
		const delta = normalizeWheelToPixels(e)
		if (e.shiftKey) {
			const xDelta = Math.abs(delta.x) > 0.01 ? delta.x : delta.y
			pan(-xDelta * WHEEL_PAN_SPEED, 0)
			return
		}
		pan(-delta.x * WHEEL_PAN_SPEED, -delta.y * WHEEL_PAN_SPEED)
	}

	function mouseOffset(e: MouseEvent) {
		const { left, top } = canvas!.getBoundingClientRect()
		return { x: e.clientX - left, y: e.clientY - top }
	}

	function pan(dx: number, dy: number) { view.x += dx; view.y += dy }

	function onmousedown(e: MouseEvent) {
		e.preventDefault()
		view.button |= 1 << e.button
		view.panning = e.button === 1 || e.button === 2
		lastPanClient = { x: e.clientX, y: e.clientY }
		document.addEventListener('mousemove', onmousemove)
		document.addEventListener('mouseup', onmouseup)
	}

	function onmousemove(e: MouseEvent) {
		if (!lastPanClient) {
			lastPanClient = { x: e.clientX, y: e.clientY }
			return
		}
		const dx = e.clientX - lastPanClient.x
		const dy = e.clientY - lastPanClient.y
		lastPanClient = { x: e.clientX, y: e.clientY }
		if (dx === 0 && dy === 0) return
		view.dragging = true
		if (view.panning) pan(dx, dy)
	}

	function onmouseup(e: MouseEvent) {
		view.panning = false
		view.dragging = false
		lastPanClient = null
		view.button &= ~(1 << e.button)
		document.removeEventListener('mousemove', onmousemove)
		document.removeEventListener('mouseup', onmouseup)
	}

	function oncontextmenu(e: MouseEvent) { e.preventDefault() }

	// Touch support
	let pinchLastDist: number | null = null
	let lastPanMid: { x: number; y: number } | null = null

	function ontouchstart(e: TouchEvent) {
		if (e.touches.length === 2) {
			const [a, b] = e.touches
			pinchLastDist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
			lastPanMid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
		}
	}

	function ontouchmove(e: TouchEvent) {
		if (e.touches.length === 2 && lastPanMid && pinchLastDist) {
			e.preventDefault()
			const [a, b] = e.touches
			const newMid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
			const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
			view.x -= (newMid.x - lastPanMid.x) / view.zoom
			view.y -= (newMid.y - lastPanMid.y) / view.zoom
			lastPanMid = newMid
			const scaleFactor = dist / pinchLastDist
			pinchLastDist = dist
			zoomTarget = Math.min(5, Math.max(0.1, zoomTarget * scaleFactor))
			const rect = (e.target as HTMLElement).getBoundingClientRect()
			startZoomAnimation({ x: (newMid.x - rect.left) / view.zoom + view.x, y: (newMid.y - rect.top) / view.zoom + view.y })
		}
	}

	function ontouchend(e: TouchEvent) {
		if (e.touches.length < 2) { pinchLastDist = null; lastPanMid = null }
	}

	function doZoom(e: WheelEvent) {
		const pt = mouseOffset(e)
		const factor = wheelZoomFactorFromEvent(e, WHEEL_ZOOM_SPEED)
		zoomTarget = Math.min(5, Math.max(0.1, zoomTarget * factor))
		startZoomAnimation(pt)
	}

	function startZoomAnimation(center: { x: number; y: number }) {
		const animate = () => {
			const next = view.zoom + (zoomTarget - view.zoom) * 0.2
			if (Math.abs(next - zoomTarget) < 0.00001) {
				applyZoom(zoomTarget, center)
				view.zoom = zoomTarget
				zoomAnimation = null
				return
			}
			applyZoom(next, center)
			view.zoom = next
			zoomAnimation = requestAnimationFrame(animate)
		}
		if (zoomAnimation) cancelAnimationFrame(zoomAnimation)
		zoomAnimation = requestAnimationFrame(animate)
	}

	function applyZoom(newScale: number, center: { x: number; y: number }) {
		const zoom = newScale / view.zoom
		view.x = center.x - (center.x - view.x) * zoom
		view.y = center.y - (center.y - view.y) * zoom
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div {onmousedown} {oncontextmenu} {ontouchstart} {ontouchmove} {ontouchend}
	bind:this={canvas} class="panzoom"
	style="width:{width}px; height:{height}px; background-size:{gw}px {gw}px; background-position:left {gx}px top {gy}px">
	<div style:transform="translate({view.x}px, {view.y}px) scale({view.zoom})" style:transform-origin="0 0">
		{@render children?.()}
	</div>
</div>

<style>
	.panzoom {
		overflow: hidden;
		position: relative;
		background-image: linear-gradient(to right, #eee 1px, transparent 1px), linear-gradient(to bottom, #eee 1px, transparent 1px);
	}
	@media print {
		.panzoom {
			background-image: none !important;
			overflow: visible;
		}
	}
</style>
