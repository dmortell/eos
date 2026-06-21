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
	/** Host hook: checkpoint the current state into the undo history *before* a gesture mutates
	 *  (so undo of a ctrl-drag copy lands on the pre-duplicate state — the originals, selected). */
	beforeMutate: (() => void) | null = null

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
	/** This editor's selection kind ('obj' | 'ann') — set by the subclass. */
	protected selKind = ''
	select(kind: string, id: string) { this.sel = { kind, id }; this.peer?.clearSel() }
	isSel(kind: string, id: string) { return this.sel?.kind === kind && this.sel.id === id }
	clearSel() { this.sel = null }

	/** The editor's multi-selection id list (Model3dEditor → multi; AnnotationEditor → selAnns). */
	protected currentMulti(): string[] { return [] }
	protected setMulti(_ids: string[]): void {}
	get primarySelId(): string | null { return this.sel?.kind === this.selKind ? this.sel.id : null }
	/** All selected ids — the multi-set if any, else the single selection (the array-of-1). */
	selectedIds(): string[] { const m = this.currentMulti(); return m.length ? m : this.primarySelId ? [this.primarySelId] : [] }
	/** Capture / restore selection (for the undo history, so undo re-selects what was selected). */
	selectionState(): { sel: Sel; multi: string[] } { return { sel: this.sel ? { ...this.sel } : null, multi: [...this.currentMulti()] } }
	restoreSelection(s?: { sel: Sel; multi: string[] }) { if (!s) return; this.sel = s.sel ?? null; this.setMulti(s.multi ?? []) }

	// ── item primitives by id (each editor implements; let generic ops below serve single + multi) ──
	protected clearAux(): void {} // clear editor-specific aux selection (object vsel/usel/ssel)
	removeItems(_ids: string[]): void {}
	/** Clone the items by id (fresh ids), offset by `d` mm; return the new ids. */
	cloneItems(_ids: string[], _d?: number): string[] { return [] }

	/** Select exactly these ids on this editor (1 → single, else multi). */
	selectIds(ids: string[]) { if (ids.length === 1) { this.sel = { kind: this.selKind, id: ids[0] }; this.setMulti([]) } else { this.sel = null; this.setMulti(ids) } }
	/** Delete the whole selection (multi-set, else single as array-of-1) — one path for both. */
	deleteSelection() { const ids = this.selectedIds(); if (!ids.length) return; this.removeItems(ids); this.sel = null; this.clearMulti(); this.clearAux(); this.notify() }
	/** Ctrl+D / panel duplicate: clone the selection offset by `d`, select the clones. */
	duplicateSelection(d = 500) { const ids = this.cloneItems(this.selectedIds(), d); if (ids.length) { this.selectIds(ids); this.notify() } }

	/**
	 * Shared Ctrl-click toggle algorithm: add/remove `id` in the combined (single + multi)
	 * selection, then write it back via `set` WITHOUT clearing the peer (so mixed object+
	 * annotation selections survive toggling one out). Result of 1 → single sel; else multi.
	 * The duplicated per-editor toggle used to live in both Model3dEditor and AnnotationEditor.
	 */
	protected applyToggle(multi: string[], primaryId: string | null, id: string, set: (sel: Sel, multi: string[]) => void) {
		const s = new Set(multi.length ? multi : primaryId ? [primaryId] : [])
		if (s.has(id)) s.delete(id); else s.add(id)
		const arr = [...s]
		if (arr.length === 1) set({ kind: this.selKind, id: arr[0] }, [])
		else set(null, arr) // 0 → cleared; 2+ → multi
	}

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
	/** Clone this editor's multi-selection in place (no offset); selection moves to the clones.
	 *  Used to duplicate a peer's share of a mixed ctrl-drag. Generic over cloneItems. */
	duplicateSelectionInPlace(): void { const m = this.currentMulti(); if (m.length) this.setMulti(this.cloneItems(m)) }

	/** Shift = lock a drag to the dominant axis (horizontal or vertical). Shared by every
	 *  drag path so the constraint behaves identically for objects, annotations and groups. */
	constrain(dx: number, dy: number, shift: boolean): [number, number] {
		if (shift) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0 }
		return [dx, dy]
	}

	/** Drag the whole multi-selection (this editor + its peer) by the cursor delta. */
	beginGroupDrag(e0: MouseEvent) {
		const w0 = this.toWorld(e0); if (!w0) return
		this.beginGroupTranslate(); this.peer?.beginGroupTranslate()
		this.startDrag(e => {
			const w = this.toWorld(e); if (!w) return
			const [dx, dy] = this.constrain(w.x - w0.x, w.y - w0.y, e.shiftKey)
			this.applyGroupTranslate(dx, dy)
			this.peer?.applyGroupTranslate(dx, dy)
		}, () => { this.notify(); this.peer?.notify() })
	}

	/** Shared single-item drag: snapshot, then move by the (shift-constrained) world delta. */
	beginItemDrag(e0: MouseEvent) {
		const w0 = this.toWorld(e0); if (!w0) return
		this.beginGroupTranslate()
		this.startDrag(e => {
			const w = this.toWorld(e); if (!w) return
			const [dx, dy] = this.constrain(w.x - w0.x, w.y - w0.y, e.shiftKey)
			this.applyGroupTranslate(dx, dy)
		}, () => this.notify())
	}

	/** Deferred Ctrl/⌘ gesture: a real drag (>3px) duplicates then drags the clones; a click
	 *  with no movement toggles the selection. Shift-constrained. Shared by object + annotation
	 *  pointer entry points so the gesture stays identical and lives in one place. */
	driveCtrlDrag(e0: MouseEvent, h: { duplicate: () => void; snapshot: () => void; apply: (dx: number, dy: number) => void; toggle: () => void }) {
		const w0 = this.toWorld(e0); if (!w0) return
		const sx = e0.clientX, sy = e0.clientY
		// Drive the peer too only when it's part of a MULTI selection (a mixed marquee group),
		// so a single object/annotation drag doesn't drag a singly-selected peer along.
		const drivePeer = !!this.peer?.hasMultiSel()
		let started = false
		this.startDrag(e => {
			if (!started) {
				if (Math.hypot(e.clientX - sx, e.clientY - sy) < 3) return
				started = true
				this.beforeMutate?.() // checkpoint the originals-selected state so undo re-selects them
				h.duplicate(); h.snapshot()
				if (drivePeer) { this.peer!.duplicateSelectionInPlace(); this.peer!.beginGroupTranslate() }
			}
			const w = this.toWorld(e); if (!w) return
			const [dx, dy] = this.constrain(w.x - w0.x, w.y - w0.y, e.shiftKey)
			h.apply(dx, dy)
			if (drivePeer) this.peer!.applyGroupTranslate(dx, dy)
		}, () => { if (!started) h.toggle(); this.notify(); this.peer?.notify() })
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
