// The Rack tool (split out of tools.ts, unchanged).
import type { Id, Pt, Rack, Space } from '../domain/types'
import type { Prim } from '../views/display'
import { nextLabel } from '../domain/labels'
import { newServerRoom, nextRoomName } from '../domain/devices'
import { newId } from '../domain/ids'
import { snapPt, placeAt, type Tool, type ToolCtx, type PointerIn } from './tools'

/**
 * Rack, on the plan (Dave: racks are drawn on the floor plan, then assigned to rows).
 *  - With a `target` (Place from the racks list): put that rack where you click, then back to Select.
 *  - Without: each click draws a NEW rack, like the last one drawn (room, row, size, kind, rotation), named after it
 *    (A01 → A02). The tool stays on, so a row is just clicks in a line.
 */
export class RackTool implements Tool {
	readonly id = 'rack'
	readonly cursor = 'crosshair'
	target: Id | null = null
	last: Rack | null = null
	#hover: Pt | null = null

	constructor(private done: () => void) {}

	down(e: PointerIn, c: ToolCtx): void {
		const { at } = placeAt(c, e, 0)
		if (this.target) {
			const r = c.store.get(this.target)
			if (r?.type === 'rack') { c.store.transact(`Place rack ${r.name}`, (tx) => tx.put({ ...r, levelId: c.levelId, at })); c.select([r.id]) }
			this.target = null; this.#hover = null
			this.done()
			return
		}
		const onLevel = c.index.racks.filter((r) => r.levelId === c.levelId)
		const like = this.last?.levelId === c.levelId ? this.last : onLevel.at(-1)   // the last one drawn ON THIS level
		const room = like?.spaceId ?? c.index.spaces.find((s) => s.levelId === c.levelId && s.kind === 'server room')?.id
		// no server room on this level yet: name one, and it comes with the rack (a new level can get its first rack)
		if (!room) { c.askText?.('New server room (racks belong to a room)', nextRoomName(c.index, c.levelId), (t) => t.trim() && this.#draw(c, at, like, newServerRoom(c.index, c.levelId, t.trim()))); return }
		this.#draw(c, at, like, room)
	}
	#draw(c: ToolCtx, at: Pt, like: Rack | undefined, room: Id | Space): void {
		const taken = new Set(c.index.racks.map((r) => r.name))
		let name = like ? nextLabel(like.name) : 'R01'
		while (taken.has(name)) name = nextLabel(name)
		const r: Rack = {
			type: 'rack', id: newId(), levelId: c.levelId, spaceId: typeof room === 'string' ? room : room.id, order: c.index.racks.filter((x) => x.levelId === c.levelId).length, name,
			kind: like?.kind ?? 'cabinet', heightU: like?.heightU ?? 42, widthMm: like?.widthMm ?? 600, depthMm: like?.depthMm ?? 1000,
			...(like?.heightMm ? { heightMm: like.heightMm } : {}), ...(like?.rowId ? { rowId: like.rowId } : {}), ...(like?.rot ? { rot: like.rot } : {}),
			at,
		}
		c.store.transact(typeof room === 'string' ? `Draw rack ${name}` : `New room ${room.name} + rack ${name}`, (tx) => { if (typeof room !== 'string') tx.put(room); tx.put(r) })
		this.last = r
		c.select([r.id])
	}
	move(): void {}
	up(): void {}
	hover(e: PointerIn, c: ToolCtx): void { this.#hover = snapPt(e.p, e.alt, c.grid ?? 10) }
	cancel(): void { this.target = null; this.#hover = null }

	/** The footprint of the rack about to be placed or drawn, under the cursor. */
	preview(c: ToolCtx): Prim[] {
		const t = this.target ? c.store.get(this.target) : undefined
		const r = t?.type === 'rack' ? t : this.last ?? c.index.racks.filter((x) => x.levelId === c.levelId).at(-1)
		if (!r || !this.#hover) return []
		const hw = (r.widthMm ?? 600) / 2, hd = (r.depthMm ?? 1000) / 2, h = this.#hover, rot = r.rot ?? 0
		const pts = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => { const q = rotateBy({ x, y }, rot); return { x: h.x + q.x, y: h.y + q.y } })
		return [{ k: 'line', pts, closed: true, cls: 'draft' }]
	}
}

const rotateBy = (p: Pt, deg: number): Pt => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return { x: p.x * c - p.y * s, y: p.x * s + p.y * c } }
