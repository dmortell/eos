// ROTATE and MIRROR (ADR 0005's Modify commands; review R92, Dave 2026-10-12), base-point tools like Move / Copy.
// Select first, then:
//  - Rotate: click the PIVOT, then a second point: the turn is the angle from +x through the pivot to it, as seen
//    (Shift: 15° steps; snaps apply) — or type an angle in degrees, anticlockwise on screen like the polar input
//    (editor/input.ts), so 90 turns a quarter anticlockwise.
//  - Mirror: click the mirror line's two points (Shift: 15° / H / V). The originals are replaced by their mirror image.
// Ctrl held on the last click keeps the originals (a turned / mirrored copy). Each is one undo step; a ghost of the
// result follows the cursor. Plans and sheets (an elevation's points are heights: rotate / mirror in the plan).
import type { Tool, ToolCtx, PointerIn } from './tools'
import type { Pt, Id } from '../domain/types'
import type { Entity } from '../domain/drawing'
import type { Shape } from '../domain/shapes'
import type { Prim } from '../views/display'
import { snapPt } from './tools'
import { canMove, rotateEntity, mirrorEntity, followAttachedMap, followSections } from './behaviours'
import { makeClip, pasteClip } from '../domain/clipboard'
import { angleStep } from './constrain'
import { rotatePt, mirrorPt, lineDeg } from '../domain/shapes'
import { norm360, screenCcwToPlan } from '../domain/conventions'
import { fromPaper } from '../views/sheet'

/** A turn about `c` (degrees clockwise on screen, as plan angles are) or a mirror in the line a → b. */
export type Xf = { kind: 'rotate'; c: Pt; deg: number } | { kind: 'mirror'; a: Pt; b: Pt }

const xfPt = (xf: Xf) => (xf.kind === 'rotate' ? (p: Pt) => rotatePt(p, xf.c, xf.deg) : (p: Pt) => mirrorPt(p, xf.a, xf.b))

/** The turn / mirror for one entity. A note tied to a viewport keeps its points in that viewport's view mm, so the pivot
 *  or line goes there too (a viewport only scales and shifts, so the angle is the same). */
function localXf(xf: Xf, e: Entity, get: (id: Id) => Entity | undefined): Xf {
	if (e.type !== 'shape' || !e.vpId || !e.sheetId) return xf
	const sheet = get(e.sheetId), vp = sheet?.type === 'sheet' ? sheet.viewports.find((v) => v.id === e.vpId) : undefined
	if (!vp) return xf
	const f = fromPaper(vp)
	return xf.kind === 'rotate' ? { ...xf, c: f(xf.c) } : { kind: 'mirror', a: f(xf.a), b: f(xf.b) }
}

/** The entity turned / mirrored (a new record; behaviours.ts knows each kind). */
export const applyXf = <T extends Entity>(e: T, xf: Xf, get: (id: Id) => Entity | undefined): T => {
	const x = localXf(xf, e, get)
	return x.kind === 'rotate' ? rotateEntity(e, x.c, x.deg) : mirrorEntity(e, x.a, x.b)
}

/** A display prim turned / mirrored for the ghost. Mirrored text is kept the right way up, as the result is. */
function ghost(p: Prim, P: (q: Pt) => Pt, turn: (r: number) => number, mirror: boolean): Prim {
	const q = p   // its clip (a viewport's window) is dropped: it doesn't turn with it
	if (q.k === 'line') return { ...q, clip: undefined, pts: q.pts.map(P), holes: undefined, cls: 'draft' }
	if (q.k === 'circle') return { ...q, clip: undefined, c: P(q.c), cls: 'draft' }
	if (q.k === 'text') {
		const r = norm360(turn(q.rot ?? 0)), flip = mirror && r > 90 && r < 270
		const anchor = flip ? (q.anchor === 'end' ? 'start' : q.anchor === 'middle' ? 'middle' : 'end') : q.anchor
		return { ...q, clip: undefined, at: P(q.at), rot: flip ? r - 180 : r, anchor, cls: 'draft' }
	}
	const box = [{ x: q.x, y: q.y }, { x: q.x + q.w, y: q.y }, { x: q.x + q.w, y: q.y + q.h }, { x: q.x, y: q.y + q.h }].map(P)
	return { k: 'line', pts: box, closed: true, cls: 'draft' }
}

const NUM = /^-?\d+(\.\d+)?$|^-?\.\d+$/
/** A plan angle (clockwise) as the user reads it: anticlockwise, −180 … 180. */
const asSeen = (deg: number) => { const a = norm360(-deg); return Math.round((a > 180 ? a - 360 : a) * 100) / 100 }

export class TransformTool implements Tool {
	readonly cursor = 'crosshair'
	/** Rotate: the pivot. Mirror: the line's first point. */
	#base: Pt | null = null
	#hover: Pt | null = null
	#ids: Id[] = []

	constructor(readonly id: 'rotate' | 'mirror') {}

	#pt(e: PointerIn, c: ToolCtx): Pt {
		const p = c.space.spec.kind === 'sheet' ? snapPt(e.p, e.alt, 0.5) : c.snap(e.p, e.alt, this.#base ? this.#ids : undefined).p
		return this.#base && e.shift ? angleStep(this.#base, p) : p
	}

	/** The turn / mirror the second point `p` gives; null = none (on the base point, or no turn). */
	#xfAt(p: Pt): Xf | null {
		const b = this.#base
		if (!b || Math.hypot(p.x - b.x, p.y - b.y) < 1e-6) return null
		if (this.id === 'mirror') return { kind: 'mirror', a: b, b: p }
		const deg = lineDeg(b, p)
		return Math.abs(norm360(deg)) < 1e-9 ? null : { kind: 'rotate', c: b, deg }
	}

	down(e: PointerIn, c: ToolCtx): void {
		if (!this.#base) {
			const ids = c.selection.filter((id) => { const en = c.store.get(id); return !!en && canMove(en) })
			if (!ids.length) { c.say?.(`Select what to ${this.id} first, then click ${this.id === 'rotate' ? 'the point to turn it about' : 'the mirror line’s first point'}`); return }
			this.#base = this.#pt(e, c)
			this.#ids = ids
			c.say?.(this.id === 'rotate'
				? 'Pivot set · click to set the angle from +x (Shift: 15°) or type degrees (anticlockwise) · Ctrl-click keeps the originals'
				: 'First point set · click the mirror line’s second point (Shift: 15° / H / V) · Ctrl-click keeps the originals')
			return
		}
		const xf = this.#xfAt(this.#pt(e, c))
		if (xf) this.#apply(xf, e.ctrl, c)
	}

	#apply(xf: Xf, copy: boolean, c: ToolCtx): void {
		const ids = this.#ids, verb = this.id === 'rotate' ? 'Rotate' : 'Mirror', n = ids.length
		if (copy) {
			const clip = makeClip(c.index, ids, '')
			if (!clip || clip.from.kind === 'rack') { c.say?.('Those can’t be copied here (copy devices in a rack view)'); return }
			const r = pasteClip(clip, { pid: '', ix: c.index, to: { kind: clip.from.kind, id: clip.from.id } })
			const get = (id: Id) => c.store.get(id)
			c.store.transact(n === 1 ? `${verb} a copy` : `${verb} copies of ${n} items`, (tx) => { for (const x of r.put) tx.put(applyXf(x, xf, get)) })
			c.select(r.select)
		} else {
			c.store.transact(n === 1 ? verb : `${verb} ${n} items`, (tx) => {
				const was = ids.map((id) => tx.get(id))
				for (const id of ids) {
					const en = tx.get(id)
					if (en) tx.put(applyXf(en, xf, (x) => tx.get(x)))
				}
				for (const sh of followAttachedMap(c.store.ofType('shape') as Shape[], new Set(ids), xfPt(xf))) tx.put(sh)   // runs ending on them follow
				followSections(tx, was, c.store.ofType('shape'), new Set(ids))   // notes on a turned section's plane go with it
			})
			c.select(ids)
		}
		this.cancel()
		const done = xf.kind === 'rotate' ? `Turned ${asSeen(xf.deg)}° (anticlockwise)` : 'Mirrored'
		c.say?.(`${done}${copy ? ' · originals kept' : ''} · click a new ${this.id === 'rotate' ? 'pivot' : 'first point'} to ${this.id} again`)
	}

	move(e: PointerIn, c: ToolCtx): void { this.#hover = this.#pt(e, c) }
	hover(e: PointerIn, c: ToolCtx): void { this.#hover = this.#pt(e, c) }
	up(): void {}
	cancel(): void { this.#base = null; this.#hover = null; this.#ids = [] }
	key(e: KeyboardEvent): boolean {
		if ((e.key === 'Escape' || e.key === 'Enter') && this.#base) { this.cancel(); return true }
		return false
	}
	finish(): void { this.cancel() }
	/** Rotate, once the pivot is set: a bare number is the angle (degrees anticlockwise). Anything else is a point. */
	typedText(text: string, c: ToolCtx): string | null | false {
		const t = text.trim()
		if (this.id !== 'rotate' || !this.#base || !NUM.test(t)) return false
		const deg = screenCcwToPlan(Number(t))
		if (deg < 1e-9) return 'That angle turns nothing'
		this.#apply({ kind: 'rotate', c: this.#base, deg }, false, c)
		return null
	}
	typedLabel(): string | null {
		return this.id === 'rotate' && this.#base ? 'Angle — degrees, anticlockwise (or a point: x,y · @dx,dy)' : null
	}
	typed(p: Pt, c: ToolCtx): void {
		if (!this.#base) { this.down({ p, shift: false, ctrl: false, alt: true }, c); return }
		const xf = this.#xfAt(p)
		if (xf) this.#apply(xf, false, c)
	}
	lastPoint(): Pt | null { return this.#base }
	dragFrom(): Pt | null { return this.#base }

	/** The rubber band (Rotate: and the 0° line it's measured from), and the selection as it would land. */
	preview(c: ToolCtx): Prim[] {
		const base = this.#base, h = this.#hover
		if (!base || !h) return []
		const band: Prim[] = [{ k: 'line', pts: [base, h], cls: 'draft' }]
		if (this.id === 'rotate') band.push({ k: 'line', pts: [base, { x: base.x + Math.hypot(h.x - base.x, h.y - base.y), y: base.y }], cls: 'draft' })
		const xf = this.#xfAt(h)
		if (!xf) return band
		const ids = new Set(this.#ids), P = xfPt(xf)
		const turn = xf.kind === 'rotate' ? (r: number) => r + xf.deg : (r: number) => 2 * lineDeg(xf.a, xf.b) - r
		return [...band, ...c.prims().filter((p) => p.src && ids.has(p.src)).map((p) => ghost(p, P, turn, xf.kind === 'mirror'))]
	}
}
