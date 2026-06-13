export interface PanZoomPoint {
	x: number
	y: number
}

export interface PanZoomAdapterOptions {
	element: HTMLElement
	onPan: (dx: number, dy: number) => void
	onZoom: (factor: number, center: PanZoomPoint) => void
	onPanningChange?: (panning: boolean) => void
	onButtonMaskChange?: (button: number, down: boolean) => void
	isZoomGesture?: (e: WheelEvent) => boolean
	panButtons?: number[]
	enableTouch?: boolean
	wheelPanSpeed?: number
	wheelZoomSpeed?: number
	dragPanSpeed?: number
	touchPanSpeed?: number
	isMacLike?: boolean
}

function isMacLikePlatform(): boolean {
	if (typeof navigator === 'undefined') return false
	const ua = navigator.userAgent || ''
	const platform = navigator.platform || ''
	return /Mac|iPhone|iPad|iPod/i.test(`${platform} ${ua}`)
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value))
}

function normalizeWheelToPixels(e: WheelEvent): PanZoomPoint {
	const linePx = 16
	const pagePx = typeof window !== 'undefined' ? window.innerHeight : 800
	let scale = 1
	if (e.deltaMode === 1) scale = linePx
	else if (e.deltaMode === 2) scale = pagePx
	return { x: e.deltaX * scale, y: e.deltaY * scale }
}

export class PanZoomInputAdapter {
	private readonly element: HTMLElement
	private readonly onPan: (dx: number, dy: number) => void
	private readonly onZoom: (factor: number, center: PanZoomPoint) => void
	private readonly onPanningChange: (panning: boolean) => void
	private readonly onButtonMaskChange?: (button: number, down: boolean) => void
	private readonly isZoomGesture: (e: WheelEvent) => boolean
	private readonly panButtons: Set<number>
	private readonly enableTouch: boolean

	private readonly wheelPanSpeed: number
	private readonly wheelZoomSpeed: number
	private readonly dragPanSpeed: number
	private readonly touchPanSpeed: number

	private panning = false
	private lastPointer: PanZoomPoint | null = null

	private pinchDistance: number | null = null
	private pinchMidpoint: PanZoomPoint | null = null
	private singleTouchPoint: PanZoomPoint | null = null

	constructor(options: PanZoomAdapterOptions) {
		const isMacLike = options.isMacLike ?? isMacLikePlatform()
		this.element = options.element
		this.onPan = options.onPan
		this.onZoom = options.onZoom
		this.onPanningChange = options.onPanningChange ?? (() => {})
		this.onButtonMaskChange = options.onButtonMaskChange
		this.isZoomGesture = options.isZoomGesture ?? ((e) => e.ctrlKey || e.altKey || e.metaKey || e.buttons === 2)
		this.panButtons = new Set(options.panButtons ?? [1, 2])
		this.enableTouch = options.enableTouch ?? true

		this.wheelPanSpeed = options.wheelPanSpeed ?? (isMacLike ? 0.4 : 0.9)
		this.wheelZoomSpeed = options.wheelZoomSpeed ?? (isMacLike ? 0.0018 : 0.0025)
		this.dragPanSpeed = options.dragPanSpeed ?? (isMacLike ? 0.8 : 1)
		this.touchPanSpeed = options.touchPanSpeed ?? 1

		this.element.addEventListener('wheel', this.handleWheel, { passive: false })
		this.element.addEventListener('mousedown', this.handleMouseDown)

		if (this.enableTouch) {
			const opts = { passive: false } as AddEventListenerOptions
			this.element.addEventListener('touchstart', this.handleTouchStart, opts)
			this.element.addEventListener('touchmove', this.handleTouchMove, opts)
			this.element.addEventListener('touchend', this.handleTouchEnd)
			this.element.addEventListener('touchcancel', this.handleTouchEnd)
		}
	}

	dispose() {
		this.element.removeEventListener('wheel', this.handleWheel)
		this.element.removeEventListener('mousedown', this.handleMouseDown)
		this.element.removeEventListener('touchstart', this.handleTouchStart)
		this.element.removeEventListener('touchmove', this.handleTouchMove)
		this.element.removeEventListener('touchend', this.handleTouchEnd)
		this.element.removeEventListener('touchcancel', this.handleTouchEnd)
		document.removeEventListener('mousemove', this.handleMouseMove)
		document.removeEventListener('mouseup', this.handleMouseUp)
	}

	private setPanning(next: boolean) {
		if (this.panning === next) return
		this.panning = next
		this.onPanningChange(next)
	}

	private localPoint(clientX: number, clientY: number): PanZoomPoint {
		const rect = this.element.getBoundingClientRect()
		return { x: clientX - rect.left, y: clientY - rect.top }
	}

	private handleWheel = (e: WheelEvent) => {
		e.preventDefault()
		const { x: pxX, y: pxY } = normalizeWheelToPixels(e)

		if (this.isZoomGesture(e)) {
			const center = this.localPoint(e.clientX, e.clientY)
			const factor = clamp(Math.exp(-pxY * this.wheelZoomSpeed), 0.7, 1.45)
			this.onZoom(factor, center)
			return
		}

		if (e.shiftKey) {
			const xDelta = Math.abs(pxX) > 0.01 ? pxX : pxY
			this.onPan(-xDelta * this.wheelPanSpeed, 0)
			return
		}

		this.onPan(-pxX * this.wheelPanSpeed, -pxY * this.wheelPanSpeed)
	}

	private handleMouseDown = (e: MouseEvent) => {
		this.onButtonMaskChange?.(e.button, true)
		if (!this.panButtons.has(e.button)) return
		e.preventDefault()
		this.lastPointer = { x: e.clientX, y: e.clientY }
		this.setPanning(true)
		document.addEventListener('mousemove', this.handleMouseMove)
		document.addEventListener('mouseup', this.handleMouseUp)
	}

	private handleMouseMove = (e: MouseEvent) => {
		if (!this.panning || !this.lastPointer) return
		const dx = e.clientX - this.lastPointer.x
		const dy = e.clientY - this.lastPointer.y
		this.lastPointer = { x: e.clientX, y: e.clientY }
		if (dx === 0 && dy === 0) return
		this.onPan(dx * this.dragPanSpeed, dy * this.dragPanSpeed)
	}

	private handleMouseUp = (e: MouseEvent) => {
		this.onButtonMaskChange?.(e.button, false)
		this.lastPointer = null
		this.setPanning(false)
		document.removeEventListener('mousemove', this.handleMouseMove)
		document.removeEventListener('mouseup', this.handleMouseUp)
	}

	private handleTouchStart = (e: TouchEvent) => {
		if (e.touches.length === 1) {
			const t = e.touches[0]
			this.singleTouchPoint = { x: t.clientX, y: t.clientY }
			this.pinchDistance = null
			this.pinchMidpoint = null
			return
		}
		if (e.touches.length === 2) {
			e.preventDefault()
			const [a, b] = e.touches
			this.pinchDistance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
			this.pinchMidpoint = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
			this.singleTouchPoint = null
		}
	}

	private handleTouchMove = (e: TouchEvent) => {
		if (e.touches.length === 1 && this.singleTouchPoint) {
			e.preventDefault()
			const t = e.touches[0]
			const dx = (t.clientX - this.singleTouchPoint.x) * this.touchPanSpeed
			const dy = (t.clientY - this.singleTouchPoint.y) * this.touchPanSpeed
			this.singleTouchPoint = { x: t.clientX, y: t.clientY }
			if (dx !== 0 || dy !== 0) this.onPan(dx, dy)
			return
		}

		if (e.touches.length !== 2 || !this.pinchDistance || !this.pinchMidpoint) return
		e.preventDefault()
		const [a, b] = e.touches
		const midpoint = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
		const distance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
		const center = this.localPoint(midpoint.x, midpoint.y)

		const panDx = midpoint.x - this.pinchMidpoint.x
		const panDy = midpoint.y - this.pinchMidpoint.y
		if (panDx !== 0 || panDy !== 0) this.onPan(panDx, panDy)

		const factor = clamp(distance / this.pinchDistance, 0.8, 1.25)
		if (Number.isFinite(factor) && factor > 0) this.onZoom(factor, center)

		this.pinchDistance = distance
		this.pinchMidpoint = midpoint
	}

	private handleTouchEnd = (e: TouchEvent) => {
		if (e.touches.length === 0) {
			this.singleTouchPoint = null
			this.pinchDistance = null
			this.pinchMidpoint = null
			return
		}
		if (e.touches.length === 1) {
			const t = e.touches[0]
			this.singleTouchPoint = { x: t.clientX, y: t.clientY }
			this.pinchDistance = null
			this.pinchMidpoint = null
		}
	}
}
