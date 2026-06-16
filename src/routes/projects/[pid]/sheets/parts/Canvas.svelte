<script lang="ts">
    import { DEFAULT_PRINT_SETTINGS, paperDimsMm, type PrintSettings } from '$lib/ui/print/types'
	import { isMacLikePlatform, normalizeWheelToPixels, wheelZoomFactorFromEvent } from '$lib/ui/panzoom-controller'

	let {
		children,
		paper = DEFAULT_PRINT_SETTINGS as PrintSettings,
		interactive = true,
		viewKey = 'sheets-view-1',
		managesPrint = true,
		background = 'bg-zinc-100',
		showZoom = false,
		zoom = $bindable(1),
		panX = $bindable(0),
		panY = $bindable(0),
		cursor = '',
		singleTouchPan = false,
		canPanAt,
		onBackgroundTap,
	}: {
		children?: any
		/** Print/paper settings — drives @page size and how content fills the printed page. */
		paper?: PrintSettings
		/** localStorage key for persisted pan/zoom. Must be unique per canvas instance. */
		viewKey?: string
		/**
		 * When false the canvas is a passive display surface: no pan/zoom input, no
		 * localStorage persistence, no print-style management. Use for a Canvas nested
		 * inside another (e.g. a floorplan inside a viewport) so its gestures don't fight
		 * the outer canvas — it simply moves with its container.
		 */
		interactive?: boolean
		/**
		 * Whether this canvas injects the page print stylesheet. Only the top-level sheet
		 * should; a nested canvas (e.g. a floorplan in a viewport) must pass false so it
		 * isn't re-scaled on print — it inherits the sheet's print scale via its container.
		 */
		managesPrint?: boolean
		/** Background class for the canvas surface (e.g. workspace gray). Pass '' for none. */
		background?: string
		/** Show a small current-zoom indicator at the bottom (only while `interactive`). */
		showZoom?: boolean
		/** Bindable: the canvas's current zoom factor (read-only mirror of the view zoom). */
		zoom?: number
		/** Bindable: the canvas's current pan offset (read-only mirror of the view x/y, px). */
		panX?: number
		panY?: number
		/** CSS cursor for the canvas surface (e.g. 'crosshair' while placing). Empty = default. */
		cursor?: string
		/**
		 * Enable single-finger touch panning (iPad). A 1-finger drag that starts on empty background
		 * (per `canPanAt`) pans the canvas; a 1-finger tap there fires `onBackgroundTap`. Touches that
		 * start on an object are left to the browser's synthesized mouse events (so drag/select still
		 * work). Two-finger pan/pinch is unaffected. Off by default (other canvases keep mouse-only).
		 */
		singleTouchPan?: boolean
		/** True if a touch at this target is on empty, pannable background (not an object/menu). */
		canPanAt?: (t: EventTarget | null) => boolean
		/** Called when a single-finger tap (no drag) lands on empty background — e.g. to deselect. */
		onBackgroundTap?: () => void
	} = $props()

	// Zoom limits (shared by wheel + pinch). Lower MIN_ZOOM to zoom further out.
	const MIN_ZOOM = 0.05
	const MAX_ZOOM = 20
	const GRID = 50 // grid spacing in world units

	// View state — restore pan/zoom from localStorage (keyed by the `viewKey` prop)
	function loadView(): { x: number; y: number; zoom: number } {
		try {
			const saved = localStorage.getItem(viewKey)
			if (saved) return JSON.parse(saved)
		} catch {}
		return { x: 10, y: 10, zoom: 2 }
	}
	// Always restore the saved view (each canvas has its own `viewKey`), even a passive one
	// like a floorplan that isn't `interactive` until its viewport is activated.
	const savedView = loadView()

	let view = $state({ x: savedView.x, y: savedView.y, zoom: savedView.zoom, panning: false })

	// Expose the current view to the parent (zoom for handle sizing; pan/zoom for the status readout).
	$effect(() => { zoom = view.zoom; panX = view.x; panY = view.y })

	// `$state()` so bind:this triggers the $effect that attaches the wheel
	// listener — plain `let` raced mount timing in some embed paths.
	let canvas: HTMLDivElement | null = $state(null)
	let gw = $derived(GRID * view.zoom)
	let gx = $derived(view.x % gw)
	let gy = $derived(view.y % gw)

	let zoomTarget = view.zoom
	let zoomAnimation: number | null = null
	let panScale = 1 // cumulative ancestor scale captured at drag start
	let lastPanClient: { x: number; y: number } | null = null
	const IS_MAC = isMacLikePlatform()
	const WHEEL_PAN_SPEED = IS_MAC ? 0.4 : 0.9
	const WHEEL_ZOOM_SPEED = IS_MAC ? 0.0035 : 0.0025

	// Scale applied to this canvas by ancestor transforms (e.g. an outer canvas's zoom
	// when nested in a viewport). on-screen width ÷ layout width. 1 for a top-level canvas.
	// Used to convert screen-pixel deltas/offsets into this canvas's local coordinates.
	function ancestorScale(): number {
		const ow = canvas?.offsetWidth ?? 0
		return canvas && ow ? canvas.getBoundingClientRect().width / ow : 1
	}

	// Attach wheel + touch listeners manually so they're NON-passive — Svelte registers
	// declarative on:wheel/on:touchmove as passive, which silently ignores preventDefault()
	// and lets the browser pinch-zoom/pan the page instead of the canvas.
	$effect(() => {
		const el = canvas
		if (!el || !interactive) return
		const opts = { passive: false }
		el.addEventListener('wheel', onwheel, opts)
		el.addEventListener('touchstart', ontouchstart, opts)
		el.addEventListener('touchmove', ontouchmove, opts)
		el.addEventListener('touchend', ontouchend, opts)
		return () => {
			el.removeEventListener('wheel', onwheel)
			el.removeEventListener('touchstart', ontouchstart)
			el.removeEventListener('touchmove', ontouchmove)
			el.removeEventListener('touchend', ontouchend)
		}
	})

	function onwheel(e: WheelEvent) {
		e.stopPropagation() // an active nested canvas handles its own zoom; don't also zoom the parent
		e.preventDefault()
		if (e.ctrlKey || e.altKey || e.metaKey || e.buttons == 2) {
			doZoom(e)
			return
		}
		const delta = normalizeWheelToPixels(e)
		const scale = ancestorScale()
		if (e.shiftKey) {
			const xDelta = Math.abs(delta.x) > 0.01 ? delta.x : delta.y
			pan((-xDelta * WHEEL_PAN_SPEED) / scale, 0)
			return
		}
		pan((-delta.x * WHEEL_PAN_SPEED) / scale, (-delta.y * WHEEL_PAN_SPEED) / scale)
	}

	function mouseOffset(e: MouseEvent) {
		const rect = canvas!.getBoundingClientRect()
		const s = rect.width / (canvas!.offsetWidth || rect.width) // undo ancestor scale
		return { x: (e.clientX - rect.left) / s, y: (e.clientY - rect.top) / s }
	}

	function pan(dx: number, dy: number) { view.x += dx; view.y += dy }

	/** Fit the paper sheet to the canvas and centre it (menubar "Fit" / view reset). */
	export function fitToPaper() {
		if (!canvas) return
		const { w, h } = paperDimsMm(paper) // mm = world units; paper sits at world (0,0)
		const cw = canvas.offsetWidth, ch = canvas.offsetHeight
		if (!w || !h || !cw || !ch) return
		const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(cw / w, ch / h) * 0.92))
		view.zoom = z
		view.x = (cw - w * z) / 2
		view.y = (ch - h * z) / 2
		zoomTarget = z
	}

	function onmousedown(e: MouseEvent) {
		if (!interactive) return // let the press bubble to the parent canvas
		e.preventDefault()
		e.stopPropagation() // an active nested canvas pans itself; don't also pan the parent
		panScale = ancestorScale()
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
		if (view.panning) pan(dx / panScale, dy / panScale)
	}

	function onmouseup() {
		view.panning = false
		lastPanClient = null
		document.removeEventListener('mousemove', onmousemove)
		document.removeEventListener('mouseup', onmouseup)
	}

	function oncontextmenu(e: MouseEvent) { if (interactive) e.preventDefault() }

	// Touch support
	let pinchLastDist: number | null = null
	let lastPanMid: { x: number; y: number } | null = null
	// Single-finger pan (iPad): tracked only when the touch starts on empty background.
	const TAP_SLOP = 8 // px of movement before a 1-finger touch becomes a pan (else it's a tap)
	let t1: { x: number; y: number; sx: number; sy: number; panning: boolean } | null = null

	function ontouchstart(e: TouchEvent) {
		if (e.touches.length === 2) {
			e.stopPropagation()
			t1 = null // a second finger supersedes a pending 1-finger pan
			const [a, b] = e.touches
			pinchLastDist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
			lastPanMid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
			return
		}
		if (e.touches.length === 1 && singleTouchPan) {
			if (canPanAt && !canPanAt(e.target)) { t1 = null; return } // on an object → let synthesized mouse drag/select
			// preventDefault suppresses the synthesized mouse events (so no marquee); we own pan + tap.
			e.preventDefault()
			const t = e.touches[0]
			t1 = { x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, panning: false }
		}
	}

	function ontouchmove(e: TouchEvent) {
		if (e.touches.length === 2 && lastPanMid && pinchLastDist) {
			e.preventDefault()
			e.stopPropagation()
			const [a, b] = e.touches
			const newMid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
			const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
			const rect = canvas!.getBoundingClientRect()
			const s = rect.width / (canvas!.offsetWidth || rect.width) // undo ancestor scale → local px
			// Two-finger pan: move the content WITH the fingers (same sense + units as a mouse drag).
			pan((newMid.x - lastPanMid.x) / s, (newMid.y - lastPanMid.y) / s)
			lastPanMid = newMid
			// Pinch zoom about the finger midpoint (centre in canvas-local px, like mouseOffset).
			const scaleFactor = dist / pinchLastDist
			pinchLastDist = dist
			zoomTarget = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomTarget * scaleFactor))
			startZoomAnimation({ x: (newMid.x - rect.left) / s, y: (newMid.y - rect.top) / s })
			return
		}
		if (e.touches.length === 1 && t1) {
			const t = e.touches[0]
			if (!t1.panning && Math.hypot(t.clientX - t1.sx, t.clientY - t1.sy) >= TAP_SLOP) {
				t1.panning = true; t1.x = t.clientX; t1.y = t.clientY // begin panning here (drop the slop)
			}
			if (t1.panning) {
				e.preventDefault()
				const s = ancestorScale()
				pan((t.clientX - t1.x) / s, (t.clientY - t1.y) / s)
				t1.x = t.clientX; t1.y = t.clientY
			}
		}
	}

	function ontouchend(e: TouchEvent) {
		if (e.touches.length < 2) { pinchLastDist = null; lastPanMid = null }
		if (e.touches.length === 0 && t1) {
			if (!t1.panning) onBackgroundTap?.() // a tap (no drag) on empty background → deselect
			t1 = null
		}
	}

	function doZoom(e: WheelEvent) {
		const pt = mouseOffset(e)
		const factor = wheelZoomFactorFromEvent(e, WHEEL_ZOOM_SPEED)
		zoomTarget = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomTarget * factor))
		startZoomAnimation(pt)
	}

	// Instant zoom (no rAF easing). The smooth interpolation made SVG <text> re-rasterise at
	// each intermediate scale, so labels appeared to "roll" between zoom steps. Applying the
	// target zoom in one step avoids the interpolation period entirely.
	function startZoomAnimation(center: { x: number; y: number }) {
		applyZoom(zoomTarget, center)
		view.zoom = zoomTarget
	}

	function applyZoom(newScale: number, center: { x: number; y: number }) {
		const f = newScale / view.zoom
		view.x = center.x - (center.x - view.x) * f
		view.y = center.y - (center.y - view.y) * f
	}

	// ── Persist pan/zoom (debounced) ──
	// Pan (mousemove) and zoom (rAF animation) mutate `view` many times per second, and
	// localStorage.setItem is synchronous, so writing on every change would cause jank.
	// Debounce: the cleanup clears the pending write on each change, so we only persist
	// ~300ms after interaction settles.
	$effect(() => {
		if (!interactive) return
		const snapshot = JSON.stringify({ x: view.x, y: view.y, zoom: view.zoom })
		const t = setTimeout(() => {
			try { localStorage.setItem(viewKey, snapshot) } catch {}
		}, 300)
		return () => clearTimeout(t)
	})

	// ── Print ──
	// On print, swap in a stylesheet sized to the paper and scale the canvas content so
	// 1 world-unit (= 1mm) maps to a real millimetre — making the paper-sheet child fill
	// the printed page exactly. Driven by injected CSS (not view-state) so it applies
	// synchronously regardless of framework timing, and needs no save/restore of pan/zoom.
	const PRINT_STYLE_ID = 'canvas-print-style'
	const PRINT_ROOT_CLASS = 'canvas-print-root'
	const PX_PER_MM = 96 / 25.4 // CSS px per mm (1in = 96px = 25.4mm)

	function applyPrintStyles() {
		const { w, h } = paperDimsMm(paper)
		// Mark THIS canvas as the print root and scope the rules to it + its direct content,
		// so nested canvases (a floorplan in a viewport) keep their own transform and just
		// inherit this scale via their container — instead of being re-scaled to mm again.
		canvas?.classList.add(PRINT_ROOT_CLASS)
		let style = document.getElementById(PRINT_STYLE_ID) as HTMLStyleElement | null
		if (!style) { style = document.createElement('style'); style.id = PRINT_STYLE_ID; document.head.appendChild(style) }
		style.textContent = `@page { size: ${w}mm ${h}mm; margin: 0; }
@media print {
	html, body { margin: 0 !important; padding: 0 !important; }
	.${PRINT_ROOT_CLASS} { position: fixed !important; inset: 0 !important; width: ${w}mm !important; height: ${h}mm !important; overflow: visible !important; background: white !important; }
	.${PRINT_ROOT_CLASS} > .panzoom-content { transform: scale(${PX_PER_MM}) !important; transform-origin: 0 0 !important; --screen-scale: ${PX_PER_MM} !important; }
}`
	}

	function removePrintStyles() {
		canvas?.classList.remove(PRINT_ROOT_CLASS)
		document.getElementById(PRINT_STYLE_ID)?.remove()
	}

	$effect(() => {
		if (!managesPrint) return
		window.addEventListener('beforeprint', applyPrintStyles)
		window.addEventListener('afterprint', removePrintStyles)
		return () => {
			window.removeEventListener('beforeprint', applyPrintStyles)
			window.removeEventListener('afterprint', removePrintStyles)
			removePrintStyles()
		}
	})
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- touch/wheel handlers are attached non-passively in the $effect above, not here -->
<div {onmousedown} {oncontextmenu}
	bind:this={canvas} class={['panzoom', background]} style:cursor={cursor || null}
	style="background-size:{gw}px {gw}px; background-position:left {gx}px top {gy}px">
	<div class="panzoom-content technical-drawing-text" style:transform="translate({view.x}px, {view.y}px) scale({view.zoom})" style:transform-origin="0 0" style:--screen-scale={view.zoom}>
		{@render children?.()}
	</div>
	{#if showZoom && interactive}
		<!-- Current-zoom readout — outside .panzoom-content so it isn't pan/zoomed.
		     Zoom stops at MIN_ZOOM / MAX_ZOOM (see constants). -->
		<div class="absolute bottom-0.5 left-1/2 -translate-x-1/2 rounded bg-black/60 px-1 py-px text-[10px] font-mono leading-none text-white pointer-events-none select-none">
			{Math.round(view.zoom * 100)}%
		</div>
	{/if}
</div>

<style>
	.panzoom {
		position: absolute;
		inset: 0;
		overflow: hidden;
		/* Tell the browser NOT to handle pan/pinch-zoom itself — we drive pan/zoom from JS.
		   Without this the browser intercepts the gesture (zooming the whole page). */
		touch-action: none;
	}
	@media print {
		/* Only the print-root's overflow is opened up (via the injected .canvas-print-root
		   rule); nested canvases keep `overflow: hidden` so a floorplan stays clipped to
		   its viewport frame. */
		.panzoom {
			background-image: none !important;
		}
	}
</style>
