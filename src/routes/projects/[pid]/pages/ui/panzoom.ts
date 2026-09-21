// Reusable pan/zoom gesture action (kestrel-adoption mockup). Detects the
// gestures and calls back with deltas; the consumer applies them to its own
// view (CSS transform for the canvas, SVG group transform for a viewport).
// Controls (matching EOS conventions + standard): wheel or right-held-wheel or
// ctrl/alt/meta+wheel = zoom at cursor; right- or middle-drag = pan; touch =
// two-finger pinch-zoom + pan (a single finger is left for drawing/editing).
// Right-drag never opens the context menu.
import { normalizeWheelToPixels, wheelZoomFactorFromEvent } from '$lib/ui/panzoom-controller'

export type PanZoomOpts = {
	enabled?: () => boolean
	// True → the wheel ZOOMS (AutoCAD-style, the default). False → the wheel PANS (EOS/Sheets
	// style) and only a modifier key zooms. Evaluated per-event.
	wheelZoom?: () => boolean
	onpan: (dx: number, dy: number, node: HTMLElement) => void            // screen-px delta
	onzoom: (factor: number, clientX: number, clientY: number, node: HTMLElement) => void
}

export function panzoom(node: HTMLElement, initial: PanZoomOpts) {
	let opts = initial
	const on = () => (opts.enabled ? opts.enabled() : true)

	function wheel(e: WheelEvent) {
		if (!on()) return
		e.preventDefault()
		e.stopPropagation()   // don't also act on an enabled panzoom ancestor (canvas under a viewport)
		// Pages is Alt-free (Dave rarely uses Alt) — Ctrl / Meta / right-button+wheel still force zoom.
		const zoom = (opts.wheelZoom ? opts.wheelZoom() : true) || e.ctrlKey || e.metaKey || (e.buttons & 2) !== 0
		// Normalise the wheel to pixels first (Firefox reports line/page deltas), and clamp the zoom
		// factor per event — shared with the Sheets tool via $lib/ui/panzoom-controller.
		const { x, y } = normalizeWheelToPixels(e)
		if (zoom) {
			opts.onzoom(wheelZoomFactorFromEvent(e, 0.0015), e.clientX, e.clientY, node)  // up = zoom in
		} else if (e.shiftKey) {
			opts.onpan(-y, 0, node)              // shift+wheel = horizontal pan (Sheets convention)
		} else {
			opts.onpan(-x, -y, node)             // plain wheel = pan
		}
	}

	// right/middle-button drag → pan (window move/up so it survives leaving the node)
	let panning = false, lastX = 0, lastY = 0
	function down(e: PointerEvent) {
		if (!on() || (e.button !== 2 && e.button !== 1)) return
		panning = true; lastX = e.clientX; lastY = e.clientY
		e.preventDefault()
		e.stopPropagation()   // pan this element, not an enabled panzoom ancestor
		window.addEventListener('pointermove', move)
		window.addEventListener('pointerup', up)
	}
	function move(e: PointerEvent) {
		if (!panning) return
		opts.onpan(e.clientX - lastX, e.clientY - lastY, node)
		lastX = e.clientX; lastY = e.clientY
	}
	function up() {
		panning = false
		window.removeEventListener('pointermove', move)
		window.removeEventListener('pointerup', up)
	}
	function ctx(e: MouseEvent) { if (on()) e.preventDefault() }  // no browser menu over the canvas

	// touch: navigation is 2-finger only (pinch-zoom + pan). A single finger is left for the
	// consumer to draw / select / edit — so it never pans. (Mouse pans with right/middle drag.)
	let mode: 'none' | 'pinch' = 'none'
	let pd = 0, pcx = 0, pcy = 0
	const mid = (t: TouchList) => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2] as const
	const dst = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
	function tstart(e: TouchEvent) {
		if (!on()) return
		if (e.touches.length >= 2) { mode = 'pinch'; pd = dst(e.touches);[pcx, pcy] = mid(e.touches); e.stopPropagation() }
	}
	function tmove(e: TouchEvent) {
		if (mode !== 'pinch' || e.touches.length < 2) return
		e.preventDefault()
		const d = dst(e.touches), [cx, cy] = mid(e.touches)
		if (pd > 0) opts.onzoom(d / pd, cx, cy, node)
		opts.onpan(cx - pcx, cy - pcy, node)
		pd = d; pcx = cx; pcy = cy
	}
	function tend(e: TouchEvent) {
		if (e.touches.length < 2) mode = 'none'   // ending a pinch; the lone finger doesn't pan
	}
	function tcancel() { mode = 'none' }   // a cancelled pinch must not leave mode stuck

	node.addEventListener('wheel', wheel, { passive: false })
	node.addEventListener('pointerdown', down)
	node.addEventListener('contextmenu', ctx)
	node.addEventListener('touchstart', tstart, { passive: false })
	node.addEventListener('touchmove', tmove, { passive: false })
	node.addEventListener('touchend', tend)
	node.addEventListener('touchcancel', tcancel)

	return {
		update(next: PanZoomOpts) { opts = next },
		destroy() {
			node.removeEventListener('wheel', wheel)
			node.removeEventListener('pointerdown', down)
			node.removeEventListener('contextmenu', ctx)
			node.removeEventListener('touchstart', tstart)
			node.removeEventListener('touchmove', tmove)
			node.removeEventListener('touchend', tend)
			node.removeEventListener('touchcancel', tcancel)
			up()
		},
	}
}
