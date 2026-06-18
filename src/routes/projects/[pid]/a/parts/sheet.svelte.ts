import { tick } from 'svelte'
import { PAPER, MIN_FRAME, type View } from './types'
import { models as initialModels, initialViews } from './data'

/**
 * Reactive state + interaction logic for the A3 sheet.
 *
 * Coordinate spaces:
 *  - paper (mm): the SVG viewBox is `0 0 PAPER.w PAPER.h`.
 *  - screen (px): paper is shown via `translate(tx,ty) scale(zoom)`.
 *  - maximized model view uses a transient camera (mtx/mty/mzoom) that is
 *    NOT persisted to the view's stored viewport (mx/my/scale).
 */
export class Sheet {
	models = $state(initialModels)
	views = $state<View[]>(initialViews)

	// Page (paper) pan/zoom.
	tx = $state(40)
	ty = $state(40)
	zoom = $state(1.6) // px per paper-mm
	viewport = $state<HTMLDivElement>()

	// Selection / interaction state.
	selectedId = $state<number | null>(1)
	activeId = $state<number | null>(null) // view whose contents are interactive (dblclick)
	panViewId = $state<number | null>(null) // view in content pan/zoom mode
	selectedObj = $state<{ viewId: number; index: number } | null>(null)
	maximizedId = $state<number | null>(null) // view filling the whole content area

	// Transient maximize camera.
	mtx = $state(0)
	mty = $state(0)
	mzoom = $state(1)

	get selected() { return this.views.find((v) => v.id === this.selectedId) ?? null }
	get maxView() { return this.views.find((v) => v.id === this.maximizedId) ?? null }

	// The currently selected object (only while its view is active), with context.
	get selectedObject() {
		if (!this.selectedObj || this.activeId !== this.selectedObj.viewId) return null
		const view = this.views.find((v) => v.id === this.selectedObj!.viewId)
		const obj = view && this.modelFor(view)?.objects[this.selectedObj.index]
		return view && obj ? { view, obj, index: this.selectedObj.index } : null
	}

	modelFor = (v: View) => this.models.find((m) => m.id === v.modelId)
	isSelected = (v: View) => v.id === this.selectedId
	isActive = (v: View) => v.id === this.activeId
	isPanMode = (v: View) => v.id === this.panViewId

	// ---- Page canvas ----------------------------------------------------
	onCanvasPointerDown = (e: PointerEvent) => {
		if (e.button === 0) {
			this.selectedId = null
			this.activeId = null
			this.panViewId = null
			this.selectedObj = null
		}
		this.maybePanPage(e)
	}

	// Pan the page with right/middle button. Tracks incrementally so a
	// wheel-zoom mid-drag isn't discarded on the next move.
	maybePanPage = (e: PointerEvent) => {
		if (e.button !== 1 && e.button !== 2) return
		e.preventDefault()
		drag(e, (dx, dy) => { this.tx += dx; this.ty += dy })
	}

	onWheel = (e: WheelEvent) => {
		// Zoom the page with a modifier, or while a middle/right button is held.
		if (!(e.ctrlKey || e.metaKey || e.altKey || e.buttons & 6)) return
		e.preventDefault()
		const rect = this.viewport!.getBoundingClientRect()
		const px = e.clientX - rect.left
		const py = e.clientY - rect.top
		const nz = clamp(this.zoom * wheelFactor(e), 0.3, 8)
		// Keep the point under the cursor fixed.
		this.tx = px - (px - this.tx) * (nz / this.zoom)
		this.ty = py - (py - this.ty) * (nz / this.zoom)
		this.zoom = nz
	}

	zoomToFit = async () => {
		await tick()
		if (!this.viewport) return
		const rect = this.viewport.getBoundingClientRect()
		const pad = 40
		this.zoom = Math.min((rect.width - pad * 2) / PAPER.w, (rect.height - pad * 2) / PAPER.h)
		this.tx = (rect.width - PAPER.w * this.zoom) / 2
		this.ty = (rect.height - PAPER.h * this.zoom) / 2
	}

	// ---- View selection / modes ----------------------------------------
	activate = (v: View) => {
		this.selectedId = v.id
		this.activeId = v.id
		this.selectedObj = null
	}

	togglePan = (v: View) => {
		this.panViewId = this.panViewId === v.id ? null : v.id
		this.selectedObj = null
	}

	selectObject = (e: PointerEvent, v: View, index: number) => {
		if (e.button !== 0) return
		e.stopPropagation()
		this.selectedObj = { viewId: v.id, index }
	}

	isObjectSelected = (v: View, index: number) =>
		this.selectedObj?.viewId === v.id && this.selectedObj?.index === index

	// ---- Move / resize the frame ---------------------------------------
	startFrameMove = (e: PointerEvent, v: View) => {
		if (e.button !== 0) return
		e.stopPropagation()
		e.preventDefault()
		this.selectedId = v.id
		drag(e, (dx, dy) => {
			v.fx += dx / this.zoom
			v.fy += dy / this.zoom
		})
	}

	// Drag a corner handle; the opposite corner stays put.
	startResize = (e: PointerEvent, v: View, corner: string) => {
		if (e.button !== 0) return
		e.stopPropagation()
		e.preventDefault()
		this.selectedId = v.id
		const sx = e.clientX, sy = e.clientY
		const left = v.fx, top = v.fy, right = v.fx + v.fw, bottom = v.fy + v.fh
		dragAbs(sx, sy, (tdx, tdy) => {
			const dx = tdx / this.zoom, dy = tdy / this.zoom
			let nl = left, nt = top, nr = right, nb = bottom
			if (corner.includes('w')) nl = Math.min(left + dx, right - MIN_FRAME)
			if (corner.includes('e')) nr = Math.max(right + dx, left + MIN_FRAME)
			if (corner.includes('n')) nt = Math.min(top + dy, bottom - MIN_FRAME)
			if (corner.includes('s')) nb = Math.max(bottom + dy, top + MIN_FRAME)
			v.fx = nl; v.fy = nt; v.fw = nr - nl; v.fh = nb - nt
		})
	}

	// ---- In-frame content pan/zoom (edits the view's stored viewport) ---
	// Paper coord under the cursor + screen-px-per-model-unit factor `k`.
	private paperAt(e: PointerEvent | WheelEvent, v: View) {
		const rect = this.viewport!.getBoundingClientRect()
		return {
			pxPaper: (e.clientX - rect.left - this.tx) / this.zoom,
			pyPaper: (e.clientY - rect.top - this.ty) / this.zoom,
			k: this.zoom * v.scale,
		}
	}

	startContentPan = (e: PointerEvent, v: View) => {
		if (e.button !== 0) return
		e.stopPropagation()
		e.preventDefault()
		const omx = v.mx, omy = v.my
		const sx = e.clientX, sy = e.clientY
		const { k } = this.paperAt(e, v)
		dragAbs(sx, sy, (tdx, tdy) => {
			v.mx = omx - tdx / k
			v.my = omy - tdy / k
		})
	}

	contentZoom = (e: WheelEvent, v: View) => {
		e.preventDefault()
		e.stopPropagation()
		const { pxPaper, pyPaper } = this.paperAt(e, v)
		const mxAt = v.mx + (pxPaper - v.fx) / v.scale
		const myAt = v.my + (pyPaper - v.fy) / v.scale
		v.scale = clamp(v.scale * wheelFactor(e), 0.05, 50)
		v.mx = mxAt - (pxPaper - v.fx) / v.scale
		v.my = myAt - (pyPaper - v.fy) / v.scale
	}

	// ---- Maximize (transient model-space camera) -----------------------
	toggleMax = (v: View) => {
		this.maximizedId = this.maximizedId === v.id ? null : v.id
		if (this.maximizedId) {
			this.selectedId = v.id
			this.activeId = v.id
			this.panViewId = null
			this.fitMax(v)
		}
	}

	// Fit the view's frame to the content area when entering maximize.
	fitMax = (v: View) => {
		const r = this.viewport!.getBoundingClientRect()
		const s = Math.min(r.width / v.fw, r.height / v.fh)
		this.mzoom = s
		this.mtx = (r.width - v.fw * s) / 2
		this.mty = (r.height - v.fh * s) / 2
	}

	maxPanStart = (e: PointerEvent) => {
		if (e.button !== 1 && e.button !== 2) return
		e.preventDefault()
		drag(e, (dx, dy) => { this.mtx += dx; this.mty += dy })
	}

	maxWheel = (e: WheelEvent) => {
		if (!(e.ctrlKey || e.metaKey || e.altKey || e.buttons & 6)) return
		e.preventDefault()
		e.stopPropagation() // don't also zoom the page underneath
		const r = this.viewport!.getBoundingClientRect()
		const px = e.clientX - r.left
		const py = e.clientY - r.top
		const nz = clamp(this.mzoom * wheelFactor(e), 0.05, 40)
		this.mtx = px - (px - this.mtx) * (nz / this.mzoom)
		this.mty = py - (py - this.mty) * (nz / this.mzoom)
		this.mzoom = nz
	}
}

// ---- Small shared helpers ----------------------------------------------
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const wheelFactor = (e: WheelEvent) => (e.deltaY < 0 ? 1.1 : 1 / 1.1)

// Incremental pointer drag: calls `onMove` with per-frame screen deltas.
function drag(e: PointerEvent, onMove: (dx: number, dy: number) => void) {
	let lastX = e.clientX, lastY = e.clientY
	const move = (ev: PointerEvent) => {
		onMove(ev.clientX - lastX, ev.clientY - lastY)
		lastX = ev.clientX
		lastY = ev.clientY
	}
	const up = () => {
		window.removeEventListener('pointermove', move)
		window.removeEventListener('pointerup', up)
	}
	window.addEventListener('pointermove', move)
	window.addEventListener('pointerup', up)
}

// Absolute pointer drag: calls `onMove` with total screen deltas from the start.
function dragAbs(sx: number, sy: number, onMove: (dx: number, dy: number) => void) {
	const move = (ev: PointerEvent) => onMove(ev.clientX - sx, ev.clientY - sy)
	const up = () => {
		window.removeEventListener('pointermove', move)
		window.removeEventListener('pointerup', up)
	}
	window.addEventListener('pointermove', move)
	window.addEventListener('pointerup', up)
}
