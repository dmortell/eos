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
import { portFromText } from '../domain/repatchText'

/** "PP1 has no port 25" — a device's port past its last one (the next pair, a typed port). */
function noPort(c: ToolCtx, r: PortRef): string | null {
	const d = c.index.get(r.on)
	if (d?.type !== 'device') return 'Not a device port'
	return d.portCount && (r.port < 1 || r.port > d.portCount) ? `${d.name} has no port ${r.port} (ports 1–${d.portCount})` : null
}

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
	/** the target port the cords start at, and changing it (R7-15, User 2026-10-16: the first switch port is hard to hit at
	 *  Fit zoom — port 3 was taken; the preview now fixes it instead of a new click) */
	start?: number; ports?: number; setStart?(n: number): void
	/** the heading and the OK button; default "Patch N cords" / "Patch N" */
	title?: string; okLabel?: string
	ok(): void
	cancel(): void
}

/** Where the bulk preview is shown (the workspace) and the sticky in-step / fill choice. */
export interface PatchPreviewHost { show(p: PatchPreview | null): void; fill(): boolean; setFill(on: boolean): void }

/** What the cord tool is given (the workspace holds the state the UI shows). */
export interface CordToolDeps {
	/** A new cord's type, color and status. */
	defaults: () => CordDefaults
	/** Ports to bulk-patch from (armed from Port Properties; held by the workspace so the UI can show it). */
	bulkFrom: { get: () => BulkFrom | null; set: (b: BulkFrom | null) => void }
	/** The cable type for interconnects (backlog "Own cable type for new links"); '' = the cord type. */
	linkType?: () => string
	/** A bulk patch / link has been made (or Esc'd) — the workspace puts back the tool you had. */
	done?: () => void
	/** Where a bulk patch's plan is shown to OK first, and the sticky in-step / fill choice. */
	previewHost?: PatchPreviewHost
	/** Where the port picked first is held — the workspace, so every pane can light the free / taken ports while a cord
	 *  is half made (User 2026-10-17); absent: the tool keeps it. */
	firstPort?: { get: () => PortRef | null; set: (r: PortRef | null) => void }
}

export class CordTool implements Tool {
	readonly id = 'cord'
	readonly cursor = 'crosshair'
	#own: PortRef | null = null
	#hover: { x: number; y: number } | null = null
	/** After a cord: the next pair (both ports + 1), patched by Enter (User 2026-10-17) */
	#next: { a: PortRef; b: PortRef } | null = null
	/** The port the last cord went to: a bare typed number means another port of ITS device */
	#lastTo: PortRef | null = null

	private readonly defaults: CordToolDeps['defaults']
	private readonly bulkFrom: CordToolDeps['bulkFrom']
	private readonly linkType: () => string
	private readonly done: () => void
	private readonly previewHost?: PatchPreviewHost
	private readonly firstPort?: CordToolDeps['firstPort']
	/** Named, not positional (hacky-code review #8: six positional arguments, four optional callbacks). */
	constructor(d: CordToolDeps) {
		this.defaults = d.defaults; this.bulkFrom = d.bulkFrom; this.linkType = d.linkType ?? (() => ''); this.done = d.done ?? (() => {})
		this.previewHost = d.previewHost; this.firstPort = d.firstPort
	}
	get bulk(): BulkFrom | null { return this.bulkFrom.get() }
	set bulk(b: BulkFrom | null) { this.bulkFrom.set(b) }
	/** The port picked first (a cord half made). */
	get first(): PortRef | null { return this.firstPort ? this.firstPort.get() : this.#own }
	#setFirst(r: PortRef | null): void { if (this.firstPort) this.firstPort.set(r); else this.#own = r }

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
			const tdev = c.index.get(r.on), tports = tdev?.type === 'device' ? tdev.portCount : undefined
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
				start: target.start, ports: tports,
				setStart: (n) => { if (n >= 1 && (!tports || n <= tports)) { target.start = n; show(fill) } },
				ok: () => { host.show(null); write(res) },
				cancel: () => { host.show(null); c.say?.('Nothing patched'); this.bulk = null; this.done() },
			})
			show(fill0, first)
			return
		}
		if (!this.first) { this.#pickFirst(r, c); return }
		this.#patchTo(r, c)
	}
	/** The first port of a cord; the reason it can't be, said and returned. */
	#pickFirst(r: PortRef, c: ToolCtx): string | null {
		const p = patchProblem(c.index, r) ?? noPort(c, r)
		if (p) { c.say?.(p); return p }
		this.#setFirst(r)
		this.#next = null
		c.say?.(`From ${c.index.portPlace(r)} — click the port to patch to, or type it (SW1:41) · Esc cancels`)
		return null
	}
	/** The cord from the first port to `r`; the reason it can't be, said and returned. */
	#patchTo(r: PortRef, c: ToolCtx): string | null {
		const first = this.first!
		// the armed port clicked again: let go of it (Q50)
		if (first.on === r.on && first.port === r.port && first.face === r.face) { this.#setFirst(null); c.say?.('Cord cancelled'); return null }
		const bad = noPort(c, r)
		if (bad) { c.say?.(bad); return bad }
		const res = makeCord(c.index, first, r, this.defaults())
		if (!res.cord) { const m = res.problem ?? 'No cord'; c.say?.(m); return m }
		const cord: Cord = res.cord
		c.store.transact(`Patch ${c.index.portPlace(cord.a)} → ${c.index.portPlace(cord.b)}`, (tx) => tx.put(cord))
		c.select([cord.id])
		this.#setFirst(null)
		this.#lastTo = r
		// Enter: the next pair (User 2026-10-17 — quicker than Patch to… for a short run)
		const next = { a: { ...first, port: first.port + 1 }, b: { ...r, port: r.port + 1 } }
		this.#next = noPort(c, next.a) || noPort(c, next.b) ? null : next
		c.say?.(`Patched ${c.index.portPlace(first)} → ${c.index.portPlace(r)}${cord.status === 'installed' ? ' as INSTALLED (surveying)' : ''}${this.#next ? ` · Enter: ${c.index.portPlace(next.a)} → ${c.index.portPlace(next.b)}` : ''}`)
		return null
	}
	move(e: PointerIn): void { this.#hover = e.p }
	up(): void {}
	hover(e: PointerIn): void { this.#hover = e.p }
	/** A view change cancels the half-made cord but KEEPS a bulk selection: an interconnect goes to another room /
	 *  floor, so the user switches views between picking the ports and clicking the target. Esc drops both. The next
	 *  pair (Enter) is kept too — a split's other pane takes the focus. */
	cancel(): void { this.#setFirst(null); this.#hover = null }
	key(e: KeyboardEvent, c?: ToolCtx): boolean {
		if (e.key === 'Escape' && this.bulk) { this.cancel(); this.bulk = null; this.done(); return true }
		if (e.key === 'Escape' && this.first) { this.cancel(); return true }
		if (e.key === 'Escape') this.#next = null
		if (e.key === 'Enter' && c && !this.first && !this.bulk && this.#next) {
			const n = this.#next
			if (!this.#pickFirst(n.a, c)) this.#patchTo(n.b, c)
			if (this.first) this.#setFirst(null)   // the second end refused: nothing half made
			return true
		}
		return false
	}
	/** Typed ports (the status bar): "SW1:41", "R01 · PP1 : 5", or a bare number = that port of the device the last cord
	 *  went to (User 2026-10-17). The first port, or the other end of the half-made cord. */
	typed(): void {}
	typedText(text: string, c: ToolCtx): string | null {
		if (this.bulk) return 'A bulk patch: click the first target port'
		if (c.space.spec.kind !== 'row') return 'Type ports in a rack view'
		const near = this.#lastTo ?? this.first
		if (!near && /^\s*\d+\s*$/.test(text)) return 'Type device : port, e.g. PP1:5'
		const p = portFromText(c.index, text, near ?? { on: '', port: 0 })
		if ('problem' in p) return p.problem
		const r: PortRef = { ...p.to, face: p.to.face ?? c.space.spec.face }
		return this.first ? this.#patchTo(r, c) : this.#pickFirst(r, c)
	}

	/** A rubber band from the first port to the cursor. */
	preview(c: ToolCtx): Prim[] {
		if (!this.first || !this.#hover) return []
		const f = this.first
		const cell = c.prims().find((p) => p.k === 'line' && p.src === f.on && p.sub === String(f.port) && p.cls.startsWith('port'))
		if (!cell || cell.k !== 'line') return []
		const xs = cell.pts.map((p) => p.x), ys = cell.pts.map((p) => p.y)
		const from = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
		return [{ k: 'line', pts: [from, this.#hover], cls: 'cord cord-add draft', color: this.defaults().colour }]
	}
	get armed(): boolean { return !!this.first }
}
