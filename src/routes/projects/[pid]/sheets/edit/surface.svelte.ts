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
	/** The visible region in world-mm (the svg's on-screen rect mapped back to world). */
	viewBounds(): { x: number; y: number; w: number; h: number } | null {
		const r = this.svg?.getBoundingClientRect(); if (!r) return null
		const a = this.toWorldXY(r.left, r.top), b = this.toWorldXY(r.right, r.bottom)
		if (!a || !b) return null
		return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
	}
	/** Offset to place pasted items: the small `gap` if their bbox is already on-screen, else
	 *  shift so the bbox centre lands at the view centre (so cross-view pastes don't vanish). */
	pasteShift(bbox: { x: number; y: number; w: number; h: number }, gap: number): { dx: number; dy: number } {
		const vb = this.viewBounds(); if (!vb) return { dx: gap, dy: gap }
		const inView = bbox.x < vb.x + vb.w && bbox.x + bbox.w > vb.x && bbox.y < vb.y + vb.h && bbox.y + bbox.h > vb.y
		if (inView) return { dx: gap, dy: gap }
		const c = this.viewCenter()
		return { dx: Math.round(c.x - (bbox.x + bbox.w / 2)), dy: Math.round(c.y - (bbox.y + bbox.h / 2)) }
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
	/** Select every visible + unlocked item of this editor (Ctrl+A). Doesn't clear the peer. */
	selectAllVisible(): void {}

	// ── grouping (H12): items sharing a groupId select/move together ──
	groupOf(_id: string): string | undefined { return undefined }      // an item's group id
	idsInGroup(_gid: string): string[] { return [] }                   // this editor's members of a group
	setGroup(_ids: string[], _gid: string | undefined): void {}        // assign/clear groupId on items
	/** If `id` is grouped, select all of this editor's members + the peer's members. Returns true
	 *  if a group was selected (caller then does a group drag instead of a single-item drag). */
	selectGroup(id: string): boolean {
		const gid = this.groupOf(id); if (!gid) return false
		this.sel = null; this.clearAux(); this.setMulti(this.idsInGroup(gid))
		if (this.peer) { this.peer.sel = null; this.peer.clearAux(); this.peer.setMulti(this.peer.idsInGroup(gid)) }
		return true
	}
	/** Delete the whole selection (multi-set, else single as array-of-1) — one path for both. */
	deleteSelection() { const ids = this.selectedIds(); if (!ids.length) return; this.removeItems(ids); this.sel = null; this.clearMulti(); this.clearAux(); this.notify() }

	// ── clipboard (per editor; the SelectionCoordinator copies/cuts/pastes across both) ──
	copySel(): void {}        // copy this editor's selection to its clipboard
	paste(): void {}          // paste this editor's clipboard (offset)
	clearClipboard(): void {} // drop this editor's clipboard
	hasClipboard(): boolean { return false }
	/** Arrow-key nudge (world-mm) / resize (Δw,Δh) of the whole selection. */
	nudgeSelection(_dx: number, _dy: number): void {}
	resizeSelection(_dw: number, _dh: number): void {}

	// ── group transform (H9): SVG-world primitives the GroupTransformBox drives (plan view) ──
	/** AABB of the selection in SVG world coords, or null if nothing selected. */
	selWorldBounds(): { x0: number; y0: number; x1: number; y1: number } | null { return null }
	/** Corner points (SVG world) of every selected item — for a tight ORIENTED bounding box. */
	selWorldPoints(_den = 1): { x: number; y: number }[] { return [] }
	/** SVG rotation (deg) of each selected box-like item — to recover a group's box angle on re-select. */
	selAngles(): number[] { return [] }
	/** Oriented box (SVG world) of a SINGLE box-like selection — for the unified transform box on a
	 *  rotated item. Null when not exactly one box-like item (lines/graphs/multi). */
	singleBox(_den = 1): { cx: number; cy: number; hw: number; hh: number; angle: number; noResize?: boolean } | null { return null }
	/** Rotate the selection `deg` about (cx,cy): rotate each item's position + add deg to its own angle. */
	rotateSelection(_deg: number, _cx: number, _cy: number): void {}
	/** Scale the selection about anchor (ax,ay) by (sx,sy), in the frame rotated by `angle` (deg).
	 *  angle=0 → axis-aligned (multi); angle=item angle → resize a rotated single item in its frame. */
	scaleSelection(_sx: number, _sy: number, _ax: number, _ay: number, _angle?: number): void {}
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
		// A lone remaining item becomes a single selection (with handles) ONLY if the peer has nothing
		// selected; in a MIXED selection it stays a multi-style highlight (no handles) so the two
		// editors read as one group.
		const peerSel = (this.peer?.selectedIds().length ?? 0) > 0
		if (arr.length === 1 && !peerSel) set({ kind: this.selKind, id: arr[0] }, [])
		else set(null, arr) // 0 → cleared; 2+ (or 1-in-mixed) → multi
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
			this.expandMarqueeGroups() // touching any group member selects the whole group (like click)
		})
	}
	/** Select this editor's items whose position falls inside the world-mm rect. */
	marqueeCollect(_rect: { x: number; y: number; w: number; h: number }): void {}
	/** After a marquee, pull in every member of any group a selected item belongs to (both editors). */
	protected expandMarqueeGroups() {
		const gids = new Set<string>()
		const scan = (e: SurfaceEditor) => { for (const id of e.selectedIds()) { const g = e.groupOf(id); if (g) gids.add(g) } }
		scan(this); if (this.peer) scan(this.peer)
		if (!gids.size) return
		const apply = (e: SurfaceEditor) => {
			const set = new Set(e.selectedIds())
			for (const g of gids) for (const id of e.idsInGroup(g)) set.add(id)
			e.sel = null; e.setMulti([...set])
		}
		apply(this); if (this.peer) apply(this.peer)
	}
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
