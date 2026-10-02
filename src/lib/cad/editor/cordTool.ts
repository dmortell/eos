// The cord tool (P, Phase 3.5): in a rack view click port A, then port B — a patch cord with the sticky type / colour,
// status `add` and an estimated length. The gate is checked at each click and the reason shown when a port refuses.
// The tool stays on for the next cord. BULK: armed with selected ports (Port Properties → Patch to…), one click on
// the first target port patches them all in order.
import type { Tool, ToolCtx, PointerIn } from './tools'
import type { Prim } from '../views/display'
import type { Cord, Id, PortRef } from '../domain/types'
import { pickPrim } from './pick'
import { makeCord, patchProblem, bulkPatch, type CordDefaults } from '../domain/cords'

export interface BulkFrom { on: Id; ports: number[]; face: 'front' | 'rear' }

export class CordTool implements Tool {
	readonly id = 'cord'
	readonly cursor = 'crosshair'
	#first: PortRef | null = null
	#hover: { x: number; y: number } | null = null

	/** `bulk`: ports to bulk-patch from (armed from Port Properties; held by the workspace so the UI can show it). */
	constructor(private defaults: () => CordDefaults, private bulkFrom: { get: () => BulkFrom | null; set: (b: BulkFrom | null) => void }) {}
	get bulk(): BulkFrom | null { return this.bulkFrom.get() }
	set bulk(b: BulkFrom | null) { this.bulkFrom.set(b) }

	/** The device port under a click, on the face being viewed. */
	#portAt(e: PointerIn, c: ToolCtx): PortRef | null {
		const hit = pickPrim(c.prims(), e.p, c.tol())
		const sub = hit && hit.k !== 'image' ? hit.sub : undefined
		if (!sub || !hit?.src || c.store.get(hit.src)?.type !== 'device' || c.space.spec.kind !== 'row') return null
		return { on: hit.src, port: Number(sub), face: c.space.spec.face }
	}

	down(e: PointerIn, c: ToolCtx): void {
		const r = this.#portAt(e, c)
		if (!r) { c.say?.('Click a port in a rack elevation'); return }
		if (this.bulk) {
			const res = bulkPatch(c.index, this.bulk, { on: r.on, start: r.port, face: r.face }, this.defaults())
			if (res.cords.length) {
				c.store.transact(`Patch ${res.cords.length} cords`, (tx) => { for (const k of res.cords) tx.put(k) })
				c.select(res.cords.map((k) => k.id))
			}
			c.say?.(`${res.cords.length} cord(s) added${res.skipped.length ? ` · ${res.skipped.length} skipped — ${res.skipped[0]}` : ''}`)
			this.bulk = null
			return
		}
		if (!this.#first) {
			const p = patchProblem(c.index, r)
			if (p) { c.say?.(p); return }
			this.#first = r
			return
		}
		const res = makeCord(c.index, this.#first, r, this.defaults())
		if (!res.cord) { c.say?.(res.problem ?? 'No cord'); return }
		const cord: Cord = res.cord
		c.store.transact(`Patch ${c.index.portPlace(cord.a)} → ${c.index.portPlace(cord.b)}`, (tx) => tx.put(cord))
		c.select([cord.id])
		this.#first = null
	}
	move(e: PointerIn): void { this.#hover = e.p }
	up(): void {}
	hover(e: PointerIn): void { this.#hover = e.p }
	cancel(): void { this.#first = null; this.bulk = null; this.#hover = null }
	key(e: KeyboardEvent): boolean {
		if (e.key === 'Escape' && (this.#first || this.bulk)) { this.cancel(); return true }
		return false
	}

	/** A rubber band from the first port to the cursor. */
	preview(c: ToolCtx): Prim[] {
		if (!this.#first || !this.#hover) return []
		const f = this.#first
		const cell = c.prims().find((p) => p.k === 'line' && p.src === f.on && p.sub === String(f.port) && p.cls.startsWith('port'))
		if (!cell || cell.k !== 'line') return []
		const xs = cell.pts.map((p) => p.x), ys = cell.pts.map((p) => p.y)
		const from = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
		return [{ k: 'line', pts: [from, this.#hover], cls: 'cord cord-add draft', color: this.defaults().colour }]
	}
	get armed(): boolean { return !!this.#first }
}
