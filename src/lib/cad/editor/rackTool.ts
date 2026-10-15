// The Rack tool (split out of tools.ts, unchanged).
import type { Id, Pt, Rack, Space } from '../domain/types'
import type { Prim } from '../views/display'
import { nextLabel } from '../domain/labels'
import { newServerRoom, nextRoomName } from '../domain/devices'
import { newId } from '../domain/ids'
import { snapPt, placeAt, type Tool, type ToolCtx, type PointerIn } from './tools'

/**
 * Rack, on the plan (User: racks are drawn on the floor plan, then assigned to rows).
 *  - With a `target` (Place from the racks list): put that rack where you click, then back to Select.
 *  - Without: each click draws a NEW rack, like the last one drawn (room, row, size, kind, rotation), named after it
 *    (A01 → A02). The tool stays on, so a row is just clicks in a line — a click beside the last rack butts the new one
 *    against it (bayed, W14: `bayAt`).
 */
export class RackTool implements Tool {
	readonly id = 'rack'
	readonly cursor = 'crosshair'
	target: Id | null = null
	last: Rack | null = null
	/** A catalogue product picked in the Product catalogue (backlog "Catalogue"): the next racks are that product —
	 *  its size, kind and SKU — until another is picked or the tool is armed from a rack again. */
	product: Pick<Rack, 'kind' | 'heightU' | 'widthMm' | 'depthMm' | 'catalogId' | 'maker' | 'model' | 'productUrl'> | null = null
	#hover: Pt | null = null
	#alt = false

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
		const p = e.alt ? at : bayAt(like, at, this.#widthNext(like, c), onLevel)   // beside the last one: bayed (W14)
		if (!room) { c.askText?.('New server room (racks belong to a room)', nextRoomName(c.index, c.levelId), (t) => t.trim() && this.#draw(c, p, like, newServerRoom(c.index, c.levelId, t.trim()))); return }
		this.#draw(c, p, like, room)
	}
	/** The width the next rack is drawn at (as #draw makes it). */
	#widthNext = (like: Rack | undefined, c: ToolCtx): number => this.product?.widthMm ?? c.settings?.toolDefaults?.rack?.widthMm ?? like?.widthMm ?? 600
	#draw(c: ToolCtx, at: Pt, like: Rack | undefined, room: Id | Space): void {
		const def = c.settings?.toolDefaults?.rack   // Properties › Use as default on a rack (kept with the project)
		const taken = new Set(c.index.racks.map((r) => r.name))
		let name = like ? nextLabel(like.name) : 'R01'
		while (taken.has(name)) name = nextLabel(name)
		const r: Rack = {
			type: 'rack', id: newId(), levelId: c.levelId, spaceId: typeof room === 'string' ? room : room.id, order: c.index.racks.filter((x) => x.levelId === c.levelId).length, name,
			kind: like?.kind ?? 'cabinet', heightU: like?.heightU ?? 42, widthMm: like?.widthMm ?? 600, depthMm: like?.depthMm ?? 1000,
			...(like?.heightMm ? { heightMm: like.heightMm } : {}), ...(like?.rowId ? { rowId: like.rowId } : {}), ...(like?.rot ? { rot: like.rot } : {}),
			...(def ?? {}),            // the project's rack default: its kind, size, rotation, doors, color … over the last one's
			...(this.product ?? {}),   // a catalogue product picked: its size, kind and SKU
			at,
		}
		c.store.transact(typeof room === 'string' ? `Draw rack ${name}` : `New room ${room.name} + rack ${name}`, (tx) => { if (typeof room !== 'string') tx.put(room); tx.put(r) })
		this.last = r
		c.select([r.id])
	}
	move(): void {}
	up(): void {}
	hover(e: PointerIn, c: ToolCtx): void { this.#hover = snapPt(e.p, e.alt, c.grid ?? 10); this.#alt = e.alt }
	cancel(): void { this.target = null; this.#hover = null }

	/** The footprint of the rack about to be placed or drawn, under the cursor. */
	preview(c: ToolCtx): Prim[] {
		const t = this.target ? c.store.get(this.target) : undefined
		const r = t?.type === 'rack' ? t : (this.last?.levelId === c.levelId ? this.last : null) ?? c.index.racks.filter((x) => x.levelId === c.levelId).at(-1)   // as `down` draws it
		if (!r || !this.#hover) return []
		// a new rack: its own size, and bayed against the last one as `down` puts it (W14)
		const def = t ? undefined : c.settings?.toolDefaults?.rack
		const w = t ? r.widthMm ?? 600 : this.#widthNext(r, c), d = t ? r.depthMm ?? 1000 : this.product?.depthMm ?? def?.depthMm ?? r.depthMm ?? 1000
		const hw = w / 2, hd = d / 2, rot = def?.rot ?? r.rot ?? 0
		const h = t || this.#alt ? this.#hover : bayAt(r, this.#hover, w, c.index.racks.filter((x) => x.levelId === c.levelId))
		const pts = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => { const q = rotateBy({ x, y }, rot); return { x: h.x + q.x, y: h.y + q.y } })
		return [{ k: 'line', pts, closed: true, cls: 'draft' }]
	}
}

/**
 * Bayed (backlog W14): a click beside the last rack drawn — along its row, within about a rack's width of the next
 * slot and not more than ¾ of its depth to the front or back — puts the new rack flush against it on that side (racks
 * stand side by side, no gaps), lined up with it. Anywhere else (a new row), or with Alt, it goes where you click.
 * `w` = the new rack's width. A slot another rack already fills is left to the click.
 */
export function bayAt(last: Rack | null | undefined, at: Pt, w: number, others: Rack[] = []): Pt {
	if (!last?.at) return at
	const rot = last.rot ?? 0, ux = rotateBy({ x: 1, y: 0 }, rot), uy = rotateBy({ x: 0, y: 1 }, rot)
	const d = { x: at.x - last.at.x, y: at.y - last.at.y }, lx = d.x * ux.x + d.y * ux.y, ly = d.x * uy.x + d.y * uy.y
	const step = (last.widthMm ?? 600) / 2 + w / 2
	if (Math.abs(ly) > (last.depthMm ?? 1000) * 0.75 || Math.abs(lx) > step + w) return at
	const s = lx < 0 ? -1 : 1
	const r1 = (v: number) => Math.round(v * 10) / 10 || 0   // no -0
	const p = { x: r1(last.at.x + ux.x * s * step), y: r1(last.at.y + ux.y * s * step) }
	return others.some((r) => r.id !== last.id && r.at && Math.hypot(r.at.x - p.x, r.at.y - p.y) < Math.min(w, r.widthMm ?? 600) / 2) ? at : p
}

const rotateBy = (p: Pt, deg: number): Pt => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return { x: p.x * c - p.y * s, y: p.x * s + p.y * c } }
