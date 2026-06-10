import type { Point } from '$lib/ui/print/types'

/** A selection is a tagged object reference; tools narrow `kind` to their object kinds. */
export type Sel = { kind: string; id: string } | null

/**
 * Base class for every tool editor. Owns the shared interaction plumbing — client↔world (real-mm)
 * mapping via `svg.getScreenCTM()`, selection, window drag listeners, and a debounced `onChange`
 * persistence hook — so each tool editor only adds its data slices + mutations. The host binds
 * `svg` (the render's `<svg>`) and sets `onChange` (→ persist).
 */
export class SurfaceEditor {
	/** The render's `<svg>` (real-mm viewBox); set by the host. Drives all coordinate maths. */
	svg: SVGSVGElement | null = null
	sel = $state<Sel>(null)
	/** Called after any mutation that should persist; the host wires this to a debounced save. */
	onChange: (() => void) | null = null
	/** Sibling editor sharing this surface (object ↔ annotation); selecting here clears it there. */
	peer: SurfaceEditor | null = null

	#move: ((e: MouseEvent) => void) | null = null
	#up: (() => void) | null = null
	#n = 0

	notify() { this.onChange?.() }
	uid(p: string) { return `${p}${Date.now().toString(36)}${this.#n++}` }

	// ── coordinates (client px → real-mm, through the canvas + viewport transforms) ──
	toWorldXY(cx: number, cy: number): Point | null {
		const m = this.svg?.getScreenCTM(); if (!m) return null
		const p = new DOMPoint(cx, cy).matrixTransform(m.inverse())
		return { x: p.x, y: p.y }
	}
	toWorld = (e: MouseEvent): Point | null => this.toWorldXY(e.clientX, e.clientY)
	/** On-screen px per world-mm — counter-scale handles by this so they stay a steady size. */
	screenScale(): number { const m = this.svg?.getScreenCTM(); return m ? Math.hypot(m.a, m.b) : 1 }
	viewCenter(): Point {
		const r = this.svg?.getBoundingClientRect()
		return (r && this.toWorldXY(r.left + r.width / 2, r.top + r.height / 2)) || { x: 0, y: 0 }
	}

	// ── selection ──
	select(kind: string, id: string) { this.sel = { kind, id }; this.peer?.clearSel() }
	isSel(kind: string, id: string) { return this.sel?.kind === kind && this.sel.id === id }
	clearSel() { this.sel = null }

	// ── marquee multi-selection + group translate ──
	// Editors that support marquee override these to act on their own data slices. A marquee or a
	// group drag drives BOTH the tool editor and its annotation peer through the same hooks so a
	// box can hold (and a drag can move) mixed object + annotation selections together.
	/** Live marquee rect (world-mm) while dragging an empty-space box; rendered by the edit layer. */
	marquee = $state<{ x: number; y: number; w: number; h: number } | null>(null)

	/** Empty-space left-drag in Select mode: rubber-band a box, then select inside it (this editor +
	 *  the annotation peer). Identical across tools, so it lives here; tools only override marqueeCollect. */
	beginMarquee(e0: MouseEvent) {
		const w0 = this.toWorld(e0)
		this.clearSel(); this.peer?.clearSel(); this.peer?.clearMulti()
		if (!w0) return
		this.startDrag(e => {
			const w = this.toWorld(e); if (!w) return
			this.marquee = { x: Math.min(w0.x, w.x), y: Math.min(w0.y, w.y), w: Math.abs(w.x - w0.x), h: Math.abs(w.y - w0.y) }
		}, () => {
			const m = this.marquee; this.marquee = null
			if (!m || (m.w < 100 && m.h < 100)) return // tiny = treat as a click → stay deselected
			this.marqueeCollect(m); this.peer?.marqueeCollect(m)
		})
	}
	/** Select this editor's items whose position falls inside the world-mm rect. */
	marqueeCollect(_rect: { x: number; y: number; w: number; h: number }): void {}
	/** Snapshot the current multi-selection's positions ahead of a group drag. */
	beginGroupTranslate(): void {}
	/** Offset every multi-selected item by (dx,dy) from the snapshot taken in beginGroupTranslate. */
	applyGroupTranslate(_dx: number, _dy: number): void {}
	/** Clear the marquee multi-selection (not the single `sel`). */
	clearMulti(): void {}
	/** Whether a marquee multi-selection exists on this editor. */
	hasMultiSel(): boolean { return false }

	/** Drag the whole multi-selection (this editor + its peer) by the cursor delta. */
	beginGroupDrag(e0: MouseEvent) {
		const w0 = this.toWorld(e0); if (!w0) return
		this.beginGroupTranslate(); this.peer?.beginGroupTranslate()
		this.startDrag(e => {
			const w = this.toWorld(e); if (!w) return
			this.applyGroupTranslate(w.x - w0.x, w.y - w0.y)
			this.peer?.applyGroupTranslate(w.x - w0.x, w.y - w0.y)
		}, () => { this.notify(); this.peer?.notify() })
	}

	// ── drag: window-level listeners with auto-cleanup ──
	startDrag(move: (e: MouseEvent) => void, up?: () => void) {
		this.endDrag()
		this.#move = move
		this.#up = () => { this.endDrag(); up?.() }
		window.addEventListener('mousemove', this.#move)
		window.addEventListener('mouseup', this.#up)
	}
	endDrag() {
		if (this.#move) window.removeEventListener('mousemove', this.#move)
		if (this.#up) window.removeEventListener('mouseup', this.#up)
		this.#move = this.#up = null
	}
}

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y })
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y })
export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
/** Rotate a vector by `deg` clockwise (SVG y-down). */
export function rotate(p: Point, deg: number): Point {
	const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
	return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }
}
export { sub as vsub, add as vadd }
