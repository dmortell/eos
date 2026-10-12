// ALIGN / DISTRIBUTE (backlog, G248; Dave 2026-10-12 "do 27"): the selection's boxes (in the view's own x / y — a plan,
// an elevation, a sheet) lined up on the left / centre / right / top / middle / bottom of them all, or spread with
// equal gaps across / down (the first and last stay). `alignMoves` (pure) = each box's move; `applyAlign` writes them.
// Tested in align.test.ts.
import type { Bounds, Prim } from '../views/display'
import { primBounds, unionBounds } from '../views/display'
import type { Entity } from '../domain/drawing'
import type { Shape } from '../domain/shapes'
import type { EntityStore } from '../store/store'
import type { ViewSpace } from '../views/space'
import { moveBy, canMove, followAttached } from './behaviours'
import { tiedScale } from './tools'
import type { Id, Pt } from '../domain/types'

export type AlignHow = 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom' | 'across' | 'down'

export const ALIGN_LABEL: Record<AlignHow, string> = {
	left: 'Align left', centre: 'Align centres (across)', right: 'Align right', top: 'Align top', middle: 'Align middles (down)', bottom: 'Align bottom',
	across: 'Distribute across (equal gaps)', down: 'Distribute down (equal gaps)',
}

const r1 = (v: number) => Math.round(v * 10) / 10

/** Each box's move (view units) for `how`; boxes that don't move are left out. Distributing needs three or more. */
export function alignMoves(boxes: { key: string; b: Bounds }[], how: AlignHow): Map<string, Pt> {
	const out = new Map<string, Pt>()
	if (boxes.length < 2) return out
	const x0 = Math.min(...boxes.map((x) => x.b.x0)), x1 = Math.max(...boxes.map((x) => x.b.x1))
	const y0 = Math.min(...boxes.map((x) => x.b.y0)), y1 = Math.max(...boxes.map((x) => x.b.y1))
	const put = (key: string, dx: number, dy: number) => { if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) out.set(key, { x: r1(dx), y: r1(dy) }) }
	if (how === 'across' || how === 'down') {
		if (boxes.length < 3) return out
		const a = how === 'across' ? (b: Bounds) => b.x0 : (b: Bounds) => b.y0, z = how === 'across' ? (b: Bounds) => b.x1 : (b: Bounds) => b.y1
		const sorted = [...boxes].sort((p, q) => (a(p.b) + z(p.b)) - (a(q.b) + z(q.b)))
		const span = z(sorted.at(-1)!.b) - a(sorted[0].b), used = sorted.reduce((s, x) => s + z(x.b) - a(x.b), 0)
		const gap = (span - used) / (sorted.length - 1)
		let at = a(sorted[0].b)
		for (const x of sorted) {
			const d = at - a(x.b)
			if (how === 'across') put(x.key, d, 0)
			else put(x.key, 0, d)
			at += z(x.b) - a(x.b) + gap
		}
		return out
	}
	for (const { key, b } of boxes) {
		if (how === 'left') put(key, x0 - b.x0, 0)
		else if (how === 'right') put(key, x1 - b.x1, 0)
		else if (how === 'centre') put(key, (x0 + x1) / 2 - (b.x0 + b.x1) / 2, 0)
		else if (how === 'top') put(key, 0, y0 - b.y0)
		else if (how === 'bottom') put(key, 0, y1 - b.y1)
		else put(key, 0, (y0 + y1) / 2 - (b.y0 + b.y1) / 2)
	}
	return out
}

/** Align / distribute the selection as drawn in this view (its `prims`): each item — a group as one — moves in one
 *  undo step (things attached to them follow, as with a nudge). Returns what to say. */
export function applyAlign(store: EntityStore, ids: Id[], prims: Prim[], how: AlignHow, space: ViewSpace): string {
	const items = ids.map((id) => store.get(id)).filter((e): e is Entity => !!e && canMove(e))
	const keyOf = (e: Entity) => (e.type === 'shape' && (e as Shape).groupId) || e.id
	const byKey = new Map<string, Entity[]>()
	for (const e of items) byKey.set(keyOf(e), [...(byKey.get(keyOf(e)) ?? []), e])
	const boxes = [...byKey].flatMap(([key, es]) => {
		const mine = new Set(es.map((e) => e.id)), b = unionBounds(prims.filter((p) => p.src && mine.has(p.src)).map(primBounds))
		return b ? [{ key, b }] : []
	})
	const need = how === 'across' || how === 'down' ? 3 : 2
	if (boxes.length < need) return `${ALIGN_LABEL[how]}: select ${need} or more things that move (a group counts as one)`
	const moves = alignMoves(boxes, how)
	if (!moves.size) return `${ALIGN_LABEL[how]}: already in line`
	store.transact(ALIGN_LABEL[how], (tx) => {
		for (const [key, d] of moves) {
			const s = space.deltaToWorld(d), moved = new Set(byKey.get(key)!.map((e) => e.id))
			for (const id of moved) {
				const en = tx.get(id)
				if (!en) continue
				const k = tiedScale(en, (x) => tx.get(x))   // a note tied to a viewport moves in its view mm
				tx.put(moveBy(en, k === 1 ? s : { ...s, x: s.x * k, y: s.y * k }, (x) => tx.get(x)))
			}
			for (const sh of followAttached(store.ofType('shape') as Shape[], moved, s)) tx.put(sh)
		}
	})
	return `${ALIGN_LABEL[how]}: ${moves.size} moved · Ctrl+Z undoes`
}
