<script lang="ts">
	import { isMacLikePlatform, normalizeWheelToPixels, wheelZoomFactorFromEvent } from '$lib/ui/panzoom-controller'
	import type { ViewState } from './types'

	let { view = $bindable(), width, height, children, singleTouchPan = false, canPanAt, onBackgroundTap }: {
		view: ViewState
		width: number
		height: number
		children?: any
		/** Enable single-finger touch panning (iPad). A 1-finger drag on empty background pans; a
		 *  1-finger tap there fires onBackgroundTap. Touches on objects (e.g. draggable devices,
		 *  which stopPropagation) never reach here, so device dragging is unaffected. */
		singleTouchPan?: boolean
		/** True if a touch at this target is empty, pannable background (not a draggable object). */
		canPanAt?: (t: EventTarget | null) => boolean
		/** Called on a single-finger tap (no drag) on empty background — e.g. to clear selection. */
		onBackgroundTap?: () => void
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

	// Attach wheel + touch listeners non-passively so preventDefault() works (declarative on:touch
	// handlers are registered passive by Svelte, which silently ignored preventDefault — letting the
	// browser pan/pinch the page instead of the canvas).
	$effect(() => {
		const el = canvas
		if (!el) return
		el.addEventListener('wheel', onwheel, { passive: false })
		el.addEventListener('touchstart', ontouchstart, { passive: false })
		el.addEventListener('touchmove', ontouchmove, { passive: false })
		el.addEventListener('touchend', ontouchend)
		return () => {
			el.removeEventListener('wheel', onwheel)
			el.removeEventListener('touchstart', ontouchstart)
			el.removeEventListener('touchmove', ontouchmove)
			el.removeEventListener('touchend', ontouchend)
		}
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
	const TAP_SLOP = 8 // px of movement before a 1-finger touch becomes a pan (else it's a tap)
	let t1: { x: number; y: number; sx: number; sy: number; panning: boolean } | null = null

	function ontouchstart(e: TouchEvent) {
		if (e.touches.length === 2) {
			t1 = null
			const [a, b] = e.touches
			pinchLastDist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
			lastPanMid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
			return
		}
		if (e.touches.length === 1 && singleTouchPan) {
			if (canPanAt && !canPanAt(e.target)) { t1 = null; return } // on a device → its own drag handles it
			e.preventDefault() // own this touch: suppress synthesized mouse (no stray click); drive pan/tap
			const t = e.touches[0]
			t1 = { x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, panning: false }
		}
	}

	function ontouchmove(e: TouchEvent) {
		if (e.touches.length === 2 && lastPanMid && pinchLastDist) {
			e.preventDefault()
			const [a, b] = e.touches
			const newMid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
			const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
			// Two-finger pan: move the content WITH the fingers (raw px, same as the mouse drag).
			pan(newMid.x - lastPanMid.x, newMid.y - lastPanMid.y)
			lastPanMid = newMid
			const scaleFactor = dist / pinchLastDist
			pinchLastDist = dist
			zoomTarget = Math.min(5, Math.max(0.1, zoomTarget * scaleFactor))
			// Zoom about the finger midpoint (centre in canvas-local px, like mouseOffset). Apply
			// INSTANTLY — the eased rAF animation, re-triggered every touchmove, makes pinch jump.
			const rect = canvas!.getBoundingClientRect()
			if (zoomAnimation) { cancelAnimationFrame(zoomAnimation); zoomAnimation = null }
			applyZoom(zoomTarget, { x: newMid.x - rect.left, y: newMid.y - rect.top })
			view.zoom = zoomTarget
			return
		}
		if (e.touches.length === 1 && t1) {
			const t = e.touches[0]
			if (!t1.panning && Math.hypot(t.clientX - t1.sx, t.clientY - t1.sy) >= TAP_SLOP) {
				t1.panning = true; t1.x = t.clientX; t1.y = t.clientY
			}
			if (t1.panning) { e.preventDefault(); pan(t.clientX - t1.x, t.clientY - t1.y); t1.x = t.clientX; t1.y = t.clientY }
		}
	}

	function ontouchend(e: TouchEvent) {
		if (e.touches.length < 2) { pinchLastDist = null; lastPanMid = null }
		if (e.touches.length === 0 && t1) {
			if (!t1.panning) onBackgroundTap?.() // a tap (no drag) on empty background → e.g. deselect
			t1 = null
		}
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
<div {onmousedown} {oncontextmenu}
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
		/* Drive pan/pinch from JS — stop the browser intercepting the gesture (page zoom/scroll). */
		touch-action: none;
		background-image: linear-gradient(to right, #eee 1px, transparent 1px), linear-gradient(to bottom, #eee 1px, transparent 1px);
	}
	@media print {
		.panzoom {
			background-image: none !important;
			overflow: visible;
		}
	}
</style>
