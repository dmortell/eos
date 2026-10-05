// MOVE and COPY with a base point (backlog, Dave 2026-10-05): select what to move, pick the tool, click a BASE point
// (it snaps to what's drawn), then the second point — snapped, Shift for 15° steps, or typed (`@dx,dy` from the base).
// Move moves the selection by base → second point, one undo step, and is done. Copy places a copy there and keeps
// going: each click another copy, Enter / Esc ends. A ghost of the selection follows the cursor. Plans, elevations,
// sections and sheets (a rack row moves devices by U: use drag / nudge there).
import type { Tool, ToolCtx, PointerIn } from './tools'
import type { Pt, Id } from '../domain/types'
import type { Shape } from '../domain/shapes'
import type { Prim } from '../views/display'
import { tiedScale, snapPt } from './tools'
import { moveBy, canMove, followAttached } from './behaviours'
import { makeClip, pasteClip, type Clip } from '../domain/clipboard'
import { angleStep } from './constrain'

/** A display prim shifted by d (view mm). */
function shiftPrim(p: Prim, d: Pt): Prim {
	const m = (q: Pt) => ({ x: q.x + d.x, y: q.y + d.y })
	if (p.k === 'line') return { ...p, pts: p.pts.map(m), cls: 'draft' }
	if (p.k === 'circle') return { ...p, c: m(p.c), cls: 'draft' }
	if (p.k === 'text') return { ...p, at: m(p.at), cls: 'draft' }
	return { ...p, x: p.x + d.x, y: p.y + d.y, opacity: 0.4 }
}

export class MoveTool implements Tool {
	readonly cursor = 'crosshair'
	#base: Pt | null = null
	#hover: Pt | null = null
	#ids: Id[] = []
	#clip: Clip | null = null
	#made = 0

	constructor(readonly id: 'move' | 'copy') {}

	#pt(e: PointerIn, c: ToolCtx): Pt {
		const p = c.space.spec.kind === 'sheet' ? snapPt(e.p, e.alt, 0.5) : c.snap(e.p, e.alt, this.#base ? this.#ids : undefined).p
		return this.#base && e.shift ? angleStep(this.#base, p) : p
	}

	down(e: PointerIn, c: ToolCtx): void {
		if (!this.#base) {
			const ids = c.selection.filter((id) => { const en = c.store.get(id); return !!en && canMove(en) })
			if (!ids.length) { c.say?.(`Select what to ${this.id} first, then click its base point`); return }
			this.#base = this.#pt(e, c)
			this.#ids = ids
			this.#clip = this.id === 'copy' ? makeClip(c.index, ids, '') : null
			if (this.id === 'copy' && (!this.#clip || this.#clip.from.kind === 'rack')) { this.cancel(); c.say?.('Those can\'t be copied here (copy devices in a rack view)'); return }
			c.say?.(`Base point set · click where it goes (Shift: 15° · type @dx,dy)${this.id === 'copy' ? ' · each click a copy, Enter ends' : ''}`)
			return
		}
		this.#place(this.#pt(e, c), c)
	}

	#place(p: Pt, c: ToolCtx): void {
		const base = this.#base!, d = { x: p.x - base.x, y: p.y - base.y }
		if (Math.hypot(d.x, d.y) < 1e-6) return
		const s = c.space.deltaToWorld(d)
		if (this.id === 'copy' && this.#clip) {
			const r = pasteClip(this.#clip, { pid: '', ix: c.index, to: { kind: this.#clip.from.kind, id: this.#clip.from.id }, d: s })
			c.store.transact(r.put.length === 1 ? 'Copy' : `Copy ${r.select.length} items`, (tx) => { for (const x of r.put) tx.put(x) })
			this.#made++
			c.say?.(`${this.#made} cop${this.#made === 1 ? 'y' : 'ies'} · click for another · Enter / Esc ends`)
			return
		}
		const ids = this.#ids, moved = new Set(ids)
		c.store.transact(ids.length === 1 ? 'Move' : `Move ${ids.length} items`, (tx) => {
			for (const id of ids) {
				const en = tx.get(id)
				if (!en) continue
				const k = tiedScale(en, (x) => tx.get(x))   // a note tied to a viewport moves in its view mm
				tx.put(moveBy(en, k === 1 ? s : { ...s, x: s.x * k, y: s.y * k }))
			}
			for (const sh of followAttached(c.store.ofType('shape') as Shape[], moved, s)) tx.put(sh)
		})
		c.select(ids)
		this.cancel()
		c.say?.('Moved · click a new base point to move again')
	}

	move(e: PointerIn, c: ToolCtx): void { this.#hover = this.#pt(e, c) }
	hover(e: PointerIn, c: ToolCtx): void { this.#hover = this.#pt(e, c) }
	up(): void {}
	cancel(): void { this.#base = null; this.#hover = null; this.#ids = []; this.#clip = null; this.#made = 0 }
	key(e: KeyboardEvent): boolean {
		if ((e.key === 'Escape' || e.key === 'Enter') && this.#base) { this.cancel(); return true }
		return false
	}
	finish(): void { this.cancel() }
	typed(p: Pt, c: ToolCtx): void { if (this.#base) this.#place(p, c); else this.down({ p, shift: false, ctrl: false, alt: true }, c) }
	lastPoint(): Pt | null { return this.#base }
	dragFrom(): Pt | null { return this.#base }

	/** The rubber band from the base point, and the selection as it would land. */
	preview(c: ToolCtx): Prim[] {
		const base = this.#base, h = this.#hover
		if (!base || !h) return []
		const d = { x: h.x - base.x, y: h.y - base.y }, ids = new Set(this.#ids)
		return [{ k: 'line', pts: [base, h], cls: 'draft' }, ...c.prims().filter((p) => p.src && ids.has(p.src)).map((p) => shiftPrim(p, d))]
	}
}
