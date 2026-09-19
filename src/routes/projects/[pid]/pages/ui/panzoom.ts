// Reusable pan/zoom gesture action (kestrel-adoption mockup). Detects the
// gestures and calls back with deltas; the consumer applies them to its own
// view (CSS transform for the canvas, SVG group transform for a viewport).
// Controls (matching EOS conventions + standard): wheel or right-held-wheel or
// ctrl/alt/meta+wheel = zoom at cursor; right- or middle-drag = pan; touch =
// one-finger pan, two-finger pinch-zoom. Right-drag never opens the context menu.
export type PanZoomOpts = {
	enabled?: () => boolean
	// Return true when a gesture starting at these client coords should be left to the
	// consumer (e.g. a 1-finger touch on an editing handle / selected shape) instead of
	// panning. Only consulted for single-finger touch; 2-finger pinch always pans/zooms.
	grab?: (clientX: number, clientY: number) => boolean
	onpan: (dx: number, dy: number, node: HTMLElement) => void            // screen-px delta
	onzoom: (factor: number, clientX: number, clientY: number, node: HTMLElement) => void
}

export function panzoom(node: HTMLElement, initial: PanZoomOpts) {
	let opts = initial
	const on = () => (opts.enabled ? opts.enabled() : true)

	function wheel(e: WheelEvent) {
		if (!on()) return
		e.preventDefault()
		const factor = Math.exp(-e.deltaY * 0.0015)  // smooth; up = zoom in
		opts.onzoom(factor, e.clientX, e.clientY, node)
	}

	// right/middle-button drag → pan (window move/up so it survives leaving the node)
	let panning = false, lastX = 0, lastY = 0
	function down(e: PointerEvent) {
		if (!on() || (e.button !== 2 && e.button !== 1)) return
		panning = true; lastX = e.clientX; lastY = e.clientY
		e.preventDefault()
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

	// touch: 1-finger pan, 2-finger pinch
	let mode: 'none' | 'pan' | 'pinch' = 'none'
	let tx = 0, ty = 0, pd = 0, pcx = 0, pcy = 0
	const mid = (t: TouchList) => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2] as const
	const dst = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
	function tstart(e: TouchEvent) {
		if (!on()) return
		if (e.touches.length === 1) {
			// A 1-finger touch on an editing handle / selected shape belongs to the consumer
			// (pointer-event drag), not to panning — leave it alone.
			if (opts.grab && opts.grab(e.touches[0].clientX, e.touches[0].clientY)) { mode = 'none'; return }
			mode = 'pan'; tx = e.touches[0].clientX; ty = e.touches[0].clientY
		}
		else if (e.touches.length >= 2) { mode = 'pinch'; pd = dst(e.touches);[pcx, pcy] = mid(e.touches) }
	}
	function tmove(e: TouchEvent) {
		if (mode === 'none') return
		e.preventDefault()
		if (mode === 'pan' && e.touches.length === 1) {
			const t = e.touches[0]; opts.onpan(t.clientX - tx, t.clientY - ty, node); tx = t.clientX; ty = t.clientY
		} else if (mode === 'pinch' && e.touches.length >= 2) {
			const d = dst(e.touches), [cx, cy] = mid(e.touches)
			if (pd > 0) opts.onzoom(d / pd, cx, cy, node)
			opts.onpan(cx - pcx, cy - pcy, node)
			pd = d; pcx = cx; pcy = cy
		}
	}
	function tend(e: TouchEvent) {
		if (e.touches.length === 0) mode = 'none'
		else if (e.touches.length === 1) { mode = 'pan'; tx = e.touches[0].clientX; ty = e.touches[0].clientY }
	}

	node.addEventListener('wheel', wheel, { passive: false })
	node.addEventListener('pointerdown', down)
	node.addEventListener('contextmenu', ctx)
	node.addEventListener('touchstart', tstart, { passive: false })
	node.addEventListener('touchmove', tmove, { passive: false })
	node.addEventListener('touchend', tend)

	return {
		update(next: PanZoomOpts) { opts = next },
		destroy() {
			node.removeEventListener('wheel', wheel)
			node.removeEventListener('pointerdown', down)
			node.removeEventListener('contextmenu', ctx)
			node.removeEventListener('touchstart', tstart)
			node.removeEventListener('touchmove', tmove)
			node.removeEventListener('touchend', tend)
			up()
		},
	}
}
