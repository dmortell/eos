// THE editing engine (editing-merge-plan.md §3.2): the generic gestures every editable kind shares — press-drag move
// (the whole selection), grip drag, Ctrl-drag duplicate, Shift / ORTHO axis lock, the selection marquee (window /
// crossing), arrow nudge and Ctrl+D duplicate. Written ONCE; each kind (shapes, sheet frames, later 3D objects) plugs in
// through an ItemSource that says how to move / reshape / copy / select / record ITS items. The caller owns the
// pointer plumbing (beginPointerDrag) and calls begin… / …To / end… with SURFACE coords — so the engine is plain logic,
// unit-tested in itemEdit.test.ts. Tool-specific actions (drafting, text edit, node branch / split, sections, orbit) stay
// with the caller and run first.
import type { Pt } from './geometry'

/** A grip of an item: where it is and what the item becomes when it's dragged to `p`. */
export type ItemGrip<T> = { x: number; y: number; apply(p: Pt): T }

export interface ItemSource<T> {
	/** The selection kind ('ent', 'frame', …). */
	kind: string
	get(id: string): T | undefined
	id(t: T): string
	/** The item moved by (dx, dy) surface units. */
	translate(t: T, dx: number, dy: number): T
	grips(t: T): ItemGrip<T>[]
	/** A grip's target point after the kind's own constraints (Shift square / 15°, grid) — default: `p`. */
	gripPoint?(t: T, gi: number, p: Pt, shift: boolean, free?: boolean): Pt
	/** Grid-snap a move delta, anchored on the first moved item (the group stays rigid) — default: none. `free` = Alt
	 *  held (a kind whose snapping Alt turns off, e.g. frames). */
	snapDelta?(dx: number, dy: number, base: T, free?: boolean): [number, number]
	/** Copies with NEW ids, in place (Ctrl-drag / Ctrl+D place them) — groups kept together, labels made free. */
	duplicate(ts: T[]): T[]
	/** A locked item selects but never moves — default: every item moves. */
	canMove?(t: T): boolean
	/** The ids a marquee a→b selects (L→R window / R→L crossing), in the kind's own terms (layer-gated etc.). */
	marquee(a: Pt, b: Pt): string[]
	/** Expand ids to whole groups — default: as is. */
	expand?(ids: string[]): string[]
	sel: { ids(): string[]; set(ids: string[]): void }
	/** The kind's OWN history channel: begin a step, stream updates, add copies, close the step (`settleMs` = keep it
	 *  open that long so a burst — arrow nudges — coalesces into one step). */
	commit: { begin(): void; update(ts: T[]): void; add(ts: T[]): void; end(settleMs?: number): void }
}

export type MoveDrag<T> = { id: string; base: T; bases: T[]; kind: 'move' | 'grip'; gi: number; start: Pt; dup: boolean; duplicated: boolean; last: Pt | null }
export type Marquee = { a: Pt; b: Pt; add?: boolean }

export class ItemEditor<T> {
	/** The move / grip drag in flight (null = none). */
	drag: MoveDrag<T> | null = null
	/** The selection box being dragged (rendered by the caller). */
	marquee = $state<Marquee | null>(null)

	constructor(private src: ItemSource<T>, private env: {
		/** ORTHO toggle — Shift inverts it (axis lock while moving). */
		ortho(): boolean
		/** An object snap for a grip drag at this client point (the dragged item excluded), or null. */
		gripSnap?(clientX: number, clientY: number, excludeId: string): Pt | null
	}) {}

	// ── move / grip / Ctrl-drag duplicate ──
	/** A press on item `id` (its body = 'move', or its grip `gi`). A plain press on an unselected item selects it (+ its
	 *  group) first; `dup` (Ctrl) drags COPIES, made on the first real move. The step opens here. Returns false for a
	 *  locked item (it stays selected, nothing drags). */
	beginMove(id: string, p: Pt, kind: 'move' | 'grip', gi: number, opts: { dup: boolean; additive: boolean }): boolean {
		const src = this.src, base = src.get(id); if (!base) return false
		const expand = (ids: string[]) => (src.expand ? src.expand(ids) : ids)
		const sel = new Set(src.sel.ids())
		if (!opts.additive && !sel.has(id)) src.sel.set(expand([id]))
		const moveIds = kind === 'move' ? (sel.has(id) ? src.sel.ids() : expand([id])) : [id]
		const bases = moveIds.map((i) => src.get(i)).filter((t): t is T => !!t)
		if (src.canMove && bases.some((t) => !src.canMove!(t))) return false
		this.drag = { id, base, bases, kind, gi, start: p, dup: opts.dup && kind === 'move', duplicated: false, last: null }
		src.commit.begin()
		return true
	}
	/** The pointer at surface point `p` (client point for the grip's object snap). */
	moveTo(p: Pt, shift: boolean, client?: { x: number; y: number }, free = false) {
		const src = this.src, d = this.drag; if (!d) return
		d.last = p
		if (d.kind === 'grip') {
			const g = src.grips(d.base)[d.gi]; if (!g) return
			const s = client && this.env.gripSnap && !free ? this.env.gripSnap(client.x, client.y, d.id) : null   // Alt: no object snap
			src.commit.update([g.apply(s ?? (src.gripPoint ? src.gripPoint(d.base, d.gi, p, shift, free) : p))])
			return
		}
		if (d.dup && !d.duplicated) {   // Ctrl-drag: on the first real move, drop copies and drag THEM
			const copies = src.duplicate(d.bases)
			src.commit.add(copies); src.sel.set(copies.map((c) => src.id(c)))
			d.bases = copies; d.duplicated = true
		}
		const [dx, dy] = this.axisLock(p[0] - d.start[0], p[1] - d.start[1], shift)
		const [gx, gy] = src.snapDelta ? src.snapDelta(dx, dy, d.bases[0], free) : [dx, dy]
		src.commit.update(d.bases.map((b) => src.translate(b, gx, gy)))
	}
	/** Shift pressed / released mid-drag: re-apply from the last point (a move re-locks WITHOUT grid snap, as before). */
	reconstrain(shift: boolean) {
		const src = this.src, d = this.drag; if (!d || !d.last) return
		if (d.kind === 'grip') { this.moveTo(d.last, shift); return }
		const [dx, dy] = this.axisLock(d.last[0] - d.start[0], d.last[1] - d.start[1], shift)
		src.commit.update(d.bases.map((b) => src.translate(b, dx, dy)))
	}
	endMove() { if (!this.drag) return; this.drag = null; this.src.commit.end() }
	/** A cancelled drag (a second finger): put the items back. */
	cancelMove(moved: boolean) { const d = this.drag; if (!d) return; if (moved) this.src.commit.update(d.bases.map((b) => b)); this.drag = null; this.src.commit.end() }
	private axisLock(dx: number, dy: number, shift: boolean): [number, number] {
		if (shift !== this.env.ortho()) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0 }
		return [dx, dy]
	}

	// ── marquee ──
	beginMarquee(p: Pt, add: boolean) { this.marquee = { a: p, b: p, add } }
	marqueeTo(p: Pt) { const m = this.marquee; if (m) this.marquee = { ...m, b: p } }
	/** Release: select what the box took (whole groups; Shift / Ctrl UNIONS). Returns false for a tiny box (a click). */
	endMarquee(minSize = 2): boolean {
		const src = this.src, m = this.marquee; this.marquee = null
		if (!m || (Math.abs(m.b[0] - m.a[0]) < minSize && Math.abs(m.b[1] - m.a[1]) < minSize)) return false
		const got = src.expand ? src.expand(src.marquee(m.a, m.b)) : src.marquee(m.a, m.b)
		src.sel.set(m.add ? [...new Set([...src.sel.ids(), ...got])] : got)
		return true
	}
	cancelMarquee() { this.marquee = null }

	// ── keys ──
	/** Arrow keys: move the selection by (dx, dy); a burst coalesces into one step (closes 600 ms after the last). */
	nudge(dx: number, dy: number): boolean { return this.moveSel(dx, dy, 600) }
	/** Move the selection by (dx, dy) as one step (MOVE on the command line; `settleMs` coalesces a burst). Locked items
	 *  stay. Returns false when nothing movable is selected. */
	moveSel(dx: number, dy: number, settleMs?: number): boolean {
		const src = this.src, items = src.sel.ids().map((i) => src.get(i)).filter((t): t is T => !!t && (!src.canMove || src.canMove(t)))
		if (!items.length) return false
		src.commit.begin(); src.commit.update(items.map((t) => src.translate(t, dx, dy))); src.commit.end(settleMs)
		return true
	}
	/** COPY / ARRAY: one copy of the selection per offset, all in ONE step; the originals stay selected. Returns the
	 *  copies' ids. */
	copySel(offs: [number, number][]): string[] {
		const src = this.src, items = src.sel.ids().map((i) => src.get(i)).filter((t): t is T => !!t)
		if (!items.length || !offs.length) return []
		const keep = src.sel.ids(), out: string[] = []
		src.commit.begin()
		for (const [dx, dy] of offs) {
			const copies = src.duplicate(items).map((c) => src.translate(c, dx, dy))
			src.commit.add(copies); src.commit.update(copies)   // add places them (shapes); update positions kinds whose duplicate is in place (frames)
			out.push(...copies.map((c) => src.id(c)))
		}
		src.commit.end(); src.sel.set(keep)
		return out
	}
	/** Ctrl+D: copies of the selection `off` along both axes, selected. Returns the copies' ids. */
	duplicateSel(off: number): string[] {
		const src = this.src, items = src.sel.ids().map((i) => src.get(i)).filter((t): t is T => !!t)
		if (!items.length) return []
		const copies = src.duplicate(items).map((c) => src.translate(c, off, off))
		src.commit.add(copies)
		const ids = copies.map((c) => src.id(c)); src.sel.set(ids)
		return ids
	}
}
