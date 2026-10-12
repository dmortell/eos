// The cord tool (P, Phase 3.5): in a rack view click port A, then port B — a patch cord with the sticky type / color,
// status `add` and an estimated length. The gate is checked at each click and the reason shown when a port refuses.
// The tool stays on for the next cord. BULK: armed with selected ports (Port Properties → Patch to…), one click on
// the first target port plans them all in order and shows the plan (A port → B port, what's skipped) to OK first —
// in step, or filling only the target's free ports (the sticky choice, Ctrl on the click for the other one).
import type { Tool, ToolCtx, PointerIn } from './tools'
import type { Prim } from '../views/display'
import type { Cord, Id, PortRef } from '../domain/types'
import { pickPrim } from './pick'
import { makeCord, patchProblem, bulkPatch, type CordDefaults } from '../domain/cords'
import { bulkInterconnect } from '../domain/interconnect'
import { coresOf } from '../domain/multicore'

/** Ports armed for a bulk click: patch cords (default) or interconnect cables (`kind: 'link'`, Phase 5). */
export interface BulkFrom { on: Id; ports: number[]; face: 'front' | 'rear'; kind?: 'cord' | 'link'; /** links only: more panels, in order, after the first */ more?: { on: Id; ports: number[] }[] }

/** A bulk patch waiting for OK: the cords it would make, the A ports it skips and why; `fill` switches the mapping and
 *  shows the plan again. One transaction on OK (one undo step). */
export interface PatchPreview {
	from: string; to: string
	rows: { a: number; aLabel: string; b: number; bLabel: string }[]
	skipped: string[]
	fill: boolean
	/** absent = no in-step / fill choice (Link to… always takes the next free port) */
	setFill?(on: boolean): void
	/** the heading and the OK button; default "Patch N cords" / "Patch N" */
	title?: string; okLabel?: string
	ok(): void
	cancel(): void
}

/** Where the bulk preview is shown (the workspace) and the sticky in-step / fill choice. */
export interface PatchPreviewHost { show(p: PatchPreview | null): void; fill(): boolean; setFill(on: boolean): void }

export class CordTool implements Tool {
	readonly id = 'cord'
	readonly cursor = 'crosshair'
	#first: PortRef | null = null
	#hover: { x: number; y: number } | null = null

	/** `bulk`: ports to bulk-patch from (armed from Port Properties; held by the workspace so the UI can show it). */
	/** `linkType` = the cable type for interconnects (backlog "Own cable type for new links"); '' = the cord type. */
	/** `done`: a bulk patch / link has been made (or Esc'd) — the workspace puts back the tool you had. */
	constructor(private defaults: () => CordDefaults, private bulkFrom: { get: () => BulkFrom | null; set: (b: BulkFrom | null) => void }, private linkType: () => string = () => '', private done: () => void = () => {}, private previewHost?: PatchPreviewHost) {}
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
		if (this.bulk?.kind === 'link') {
			// permanent cabling lands on the panels' REAR, whichever face is being viewed
			// a multi-core type (Settings › Cable types › Cores): the ports go into cables of that many cores
			const type = this.linkType() || this.defaults().cableType, cores = coresOf(c.settings, type)
			const bulk = this.bulk
			const res = bulkInterconnect(c.index, { ...bulk, face: 'rear' }, { on: r.on, start: r.port, face: 'rear' }, { cableType: type, cores })
			const n = res.links.length, cables = cores > 1 ? Math.ceil(n / cores) : n
			const what = cores > 1 ? `${cables} × ${cores}-core cable(s), ${n} cores` : `${n} interconnect cable(s)`
			const kind = res.links[0]?.kind === 'tie' ? 'tie' : 'backbone'
			const write = () => {
				if (n) c.store.transact(cores > 1 ? `Link ${cables} ${cores}-core ${kind} cable(s)` : `Link ${n} ${kind} cable(s)`, (tx) => { for (const k of res.links) tx.put(k) })
				c.say?.(`${what} added${res.skipped.length ? ` · ${res.skipped.length} skipped — ${res.skipped[0]}` : ''} · choose the riser in Port Properties`)
				this.bulk = null
				this.done()
			}
			const host = this.previewHost
			// as Patch to…: the cables are listed to OK first (review follow-up to R93); one port onto a free port goes at once
			if (!host || (n === 1 && !res.skipped.length)) { write(); return }
			const dev = (on: Id) => { const d = c.index.get(on); return d?.type === 'device' ? d.name : on }
			const name = (on: Id) => { const d = c.index.get(on); return d?.type === 'device' ? `${c.index.nameOf(d.rackId)} · ${d.name}` : on }
			const several = !!bulk.more?.length
			host.show({
				from: several ? `${name(bulk.on)} + ${bulk.more!.length} more` : name(bulk.on), to: name(r.on), fill: false, skipped: res.skipped,
				title: cores > 1 ? `Link ${cables} ${cores}-core ${kind} cable${cables === 1 ? '' : 's'} (${n} cores)` : `Link ${n} ${kind} cable${n === 1 ? '' : 's'}`,
				okLabel: `Link ${n}`,
				rows: res.links.map((k) => ({ a: k.a.port, aLabel: `${several ? `${dev(k.a.on)} · ` : ''}${c.index.portLabel(k.a)}`, b: k.b.port, bLabel: c.index.portLabel(k.b) })),
				ok: () => { host.show(null); write() },
				cancel: () => { host.show(null); c.say?.('Nothing linked'); this.bulk = null; this.done() },
			})
			return
		}
		if (this.bulk) {
			const bulk = this.bulk, target = { on: r.on, start: r.port, face: r.face }
			const plan = (fill: boolean) => bulkPatch(c.index, bulk, target, this.defaults(), { fill })
			const write = (res: { cords: Cord[]; skipped: string[] }) => {
				if (res.cords.length) {
					c.store.transact(`Patch ${res.cords.length} cords`, (tx) => { for (const k of res.cords) tx.put(k) })
					c.select(res.cords.map((k) => k.id))
				}
				c.say?.(`${res.cords.length} cord(s) added${this.defaults().status === 'installed' ? ' as INSTALLED (surveying)' : ''}${res.skipped.length ? ` · ${res.skipped.length} skipped — ${res.skipped[0]}` : ''}`)
				this.bulk = null
				this.done()
			}
			const host = this.previewHost
			// Ctrl on the click: the other mapping this time
			const fill0 = (host?.fill() ?? false) !== e.ctrl
			const first = plan(fill0)
			// one port onto a free port needs no preview
			if (!host || (first.cords.length === 1 && !first.skipped.length)) { write(first); return }
			const name = (on: Id) => { const d = c.index.get(on); return d?.type === 'device' ? `${c.index.nameOf(d.rackId)} · ${d.name}` : on }
			const show = (fill: boolean, res = plan(fill)) => host.show({
				from: name(bulk.on), to: name(r.on), fill, skipped: res.skipped,
				rows: res.cords.map((k) => ({ a: k.a.port, aLabel: c.index.portLabel(k.a), b: k.b.port, bLabel: c.index.portLabel(k.b) })),
				setFill: (on) => { host.setFill(on); show(on) },
				ok: () => { host.show(null); write(res) },
				cancel: () => { host.show(null); c.say?.('Nothing patched'); this.bulk = null; this.done() },
			})
			show(fill0, first)
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
		if (cord.status === 'installed') c.say?.('Cord recorded as INSTALLED (surveying)')
		this.#first = null
	}
	move(e: PointerIn): void { this.#hover = e.p }
	up(): void {}
	hover(e: PointerIn): void { this.#hover = e.p }
	/** A view change cancels the half-made cord but KEEPS a bulk selection: an interconnect goes to another room /
	 *  floor, so the user switches views between picking the ports and clicking the target. Esc drops both. */
	cancel(): void { this.#first = null; this.#hover = null }
	key(e: KeyboardEvent): boolean {
		if (e.key === 'Escape' && this.bulk) { this.cancel(); this.bulk = null; this.done(); return true }
		if (e.key === 'Escape' && this.#first) { this.cancel(); return true }
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
