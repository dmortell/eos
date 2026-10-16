// The ROOM tool (backlog W30, walkthrough B38: EPS / riser rooms couldn't be named or drawn — boundaries only came from
// imports). Click the room's corners (snaps; Shift = 15° steps); Enter, C or a click back on the first corner closes
// it, and it asks for the name. A room drawn round a riser is an EPS ("EPS 1"): the riser view names its EPS box after
// it. The room is a Space with that boundary, on the plan's Rooms layer; Properties renames it or changes its kind.
import type { Id, Pt, Space } from '../domain/types'
import type { Shape } from '../domain/shapes'
import type { Prim } from '../views/display'
import type { Tool, ToolCtx, PointerIn } from './tools'
import { snapMark } from './tools'
import type { Snap } from './snap'
import { angleStep } from './constrain'
import { newId } from '../domain/ids'
import { inPolygon } from '../views/primGeom'

/** Does a riser (a run's vertical segment to another level) stand inside `poly` on this level? */
export function riserInside(shapes: readonly Shape[], levelId: Id, poly: Pt[]): boolean {
	for (const s of shapes) {
		if (s.role?.kind !== 'containment' || s.geom.kind !== 'path') continue
		const nodes = new Map(s.geom.nodes.map((n) => [n.id, n]))
		for (const g of s.geom.segs) {
			const a = nodes.get(g.a), b = nodes.get(g.b)
			if (!a || !b || a.x !== b.x || a.y !== b.y) continue
			const la = a.levelId ?? s.levelId, lb = b.levelId ?? s.levelId
			if (la !== lb && (la === levelId || lb === levelId) && inPolygon(a, poly)) return true
		}
	}
	return false
}

/** The room a closed outline makes: an EPS round a riser, else a room; named on from the level's others of that kind. */
export function newRoom(c: Pick<ToolCtx, 'index' | 'levelId'>, boundary: Pt[], name?: string): Space {
	const eps = riserInside(c.index.shapes, c.levelId, boundary), kind = eps ? 'eps' : 'room'
	const here = c.index.spaces.filter((s) => s.levelId === c.levelId)
	const n = here.filter((s) => s.kind.toLowerCase() === kind).length + 1
	return { type: 'space', id: newId(), levelId: c.levelId, kind, name: name?.trim() || `${eps ? 'EPS' : 'Room'} ${n}`, boundary, order: here.length + 1 }
}

/** A server room on this level with no outline yet whose placed racks all stand inside `poly`. */
export function serverRoomInside(c: Pick<ToolCtx, 'index' | 'levelId'>, poly: Pt[]): Space | undefined {
	return c.index.spaces.find((s) => {
		if (s.kind !== 'server room' || s.levelId !== c.levelId || s.boundary?.length) return false
		const racks = c.index.racks.filter((r) => r.spaceId === s.id && r.at)
		return racks.length > 0 && racks.every((r) => inPolygon(r.at!, poly))
	})
}

export class RoomTool implements Tool {
	readonly id = 'room'
	readonly cursor = 'crosshair'
	pts: Pt[] = []
	#hover: Snap | null = null

	#pick(e: PointerIn, c: ToolCtx): Snap {
		const last = e.shift ? this.pts.at(-1) : undefined
		return last ? { p: angleStep(last, e.p), kind: 'grid' } : c.snap(e.p, e.alt)
	}
	down(e: PointerIn, c: ToolCtx): void {
		const first = this.pts.length >= 3 ? this.pts[0] : null
		if (first && Math.hypot(e.p.x - first.x, e.p.y - first.y) <= c.tol() * 1.5) { this.finish(c); return }
		this.#add(this.#pick(e, c).p)
	}
	typed(p: Pt): void { this.#add(p) }
	#add(p: Pt): void {
		const q = { x: Math.round(p.x), y: Math.round(p.y) }, last = this.pts.at(-1)
		if (!last || last.x !== q.x || last.y !== q.y) this.pts.push(q)
	}
	lastPoint(): Pt | null { return this.pts.at(-1) ?? null }
	move(e: PointerIn, c: ToolCtx): void { this.hover(e, c) }
	hover(e: PointerIn, c: ToolCtx): void { this.#hover = this.#pick(e, c) }
	up(): void {}
	key(e: KeyboardEvent, c: ToolCtx): boolean {
		if (e.key === 'Enter' || (e.key.toLowerCase() === 'c' && this.pts.length >= 3)) { this.finish(c); return true }
		if (e.key === 'Backspace' && this.pts.length) { this.pts.pop(); return true }
		if (e.key === 'Escape' && this.pts.length) { this.cancel(); return true }
		return false
	}
	/** Close the outline (3+ corners) and ask for its name; nothing is written until the name is given. */
	finish(c: ToolCtx): void {
		const pts = this.pts
		this.pts = []
		if (pts.length < 3) { if (pts.length) c.say?.('A room needs three corners or more'); return }
		const room = newRoom(c, pts)
		const make = (name: string) => {
			const r = { ...room, name: name.trim() || room.name }
			c.store.transact(`New ${r.kind === 'eps' ? 'EPS' : 'room'} ${r.name}`, (tx) => tx.put(r))
			c.select([r.id])
		}
		// its name in a dialog (R7, User 2026-10-16: names are asked in a dialog, not the status bar)
		const named = () => {
			const eps = room.kind === 'eps'
			if (c.askInDialog) c.askInDialog({ title: eps ? 'New EPS' : 'New room', label: 'Name', value: room.name, ok: 'Add', hint: eps ? 'A riser stands inside it: the riser view names its EPS box after it.' : 'Properties renames it or changes its kind later.' }, make)
			else if (c.askText) c.askText(eps ? 'EPS name (a riser is inside it)' : 'Room name', room.name, make)
			else make(room.name)
		}
		// round a server room's racks (R7-28, User 2026-10-16: it became a second room beside IDF 1 — the IDF2 / 33IDF2
		// case): offer to make it that server room's outline instead
		const sr = serverRoomInside(c, pts)
		if (sr && c.ask2) {
			c.ask2(`These corners hold ${sr.name}'s racks — make them ${sr.name}'s room outline (no second room)?`, `${sr.name}'s outline`, () => {
				c.store.transact(`${sr.name}: room outline`, (tx) => tx.put({ ...sr, boundary: pts }))
				c.select([sr.id])
				c.say?.(`${sr.name} has its outline — its walls, room elevations and sheets go with it`)
			}, { label: 'A new room', apply: named })
			return
		}
		named()
	}
	cancel(): void { this.pts = []; this.#hover = null }

	/** The outline so far, to the cursor, closing back to the first corner; the snap marker. */
	preview(c: ToolCtx): Prim[] {
		const h = this.#hover
		const out: Prim[] = []
		if (this.pts.length) out.push({ k: 'line', pts: [...this.pts, ...(h ? [h.p] : []), ...(this.pts.length >= 2 ? [this.pts[0]] : [])], cls: 'draft' })
		if (h && h.kind !== 'grid') out.push(snapMark(h, c.tol()))
		return out
	}
}
