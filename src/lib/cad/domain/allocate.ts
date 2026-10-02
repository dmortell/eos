// Allocation (Phase 3.4, phase3.md §4): which panel port each outlet port is cabled to. Allocation IS the set of
// horizontal links — this computes the links to add (and, when re-allocating, the unpinned ones to drop); it writes
// nothing. Rules (Dave, phase3.md §9):
//  - an outlet port goes to a panel of ITS server room (OutletPort.serverRoomId ↔ the panel's room);
//  - low ports → low (floor) panels; high ports → HIGH panels first, and only when those are full, onto floor-panel
//    ports left over after the low ports;
//  - only the room's PATCH FRAMES take outlets (Rack.patchFrame) — every rack when the room has none marked;
//  - order: outlets by label (natural), then port; frames LEFT TO RIGHT in row order, filled one after another;
//    within a frame panels from the TOP U down; within a panel port 1…n;
//  - USAGE: an outlet takes a port reserved for its usage first, then a panel set to its usage (PanelInfo.usages),
//    then a general panel; reserved ports and usage panels never take other usages;
//  - existing links stay (re-running is additive). Re-allocating drops UNPINNED links in scope first — except a link
//    whose panel port is patched (a cord would be left pointing at a different outlet);
//  - what doesn't fit is reported, never squeezed in. Usage 'N/A' outlets are not cabled to a frame (legacy rule).
import type { Id, Outlet, Device, Link, Rack } from './types'
import type { ProjectIndex } from './project'
import { racksInOrder } from './devices'
import { naturalCompare } from './labels'
import { newId } from './ids'

export interface AllocOpts {
	/** Only outlets on this level (else every level). */
	levelId?: Id
	/** Only outlet ports cabled to this server room. */
	serverRoomId?: Id
	/** Only these outlets (e.g. a selection). */
	outletIds?: Id[]
	/** Drop unpinned links in scope first and allocate again from scratch. */
	reallocate?: boolean
}

export interface AllocIssue { kind: 'no-server-room' | 'no-panels' | 'full' | 'room-mismatch' | 'high-on-floor-panel' | 'kept-patched'; text: string; outletId?: Id; port?: number }

export interface RoomStats { serverRoomId: Id; name: string; low: { wanted: number; placed: number; free: number }; high: { wanted: number; placed: number; free: number; onFloor: number } }

export interface Allocation {
	add: Link[]
	/** Link ids to delete (re-allocate only). */
	remove: Id[]
	unallocated: { outletId: Id; port: number; reason: string }[]
	issues: AllocIssue[]
	rooms: RoomStats[]
}

interface Want { o: Outlet; port: number; cableType: string }
interface Slot { d: Device; port: number; reserved?: string; usages?: string[] }

const opKey = (on: Id, port: number) => `${on}:${port}`

/** The server room a panel serves: its own setting, else the room its rack stands in. */
export function panelRoom(ix: ProjectIndex, d: Device): Id | undefined {
	return d.panel?.serverRoomId ?? (ix.get(d.rackId) as Rack | undefined)?.spaceId
}

/**
 * Panels of a server room that take outlets, in FILL ORDER: racks left to right in row order, then top U down. Only
 * the room's PATCH FRAMES when it has any (Dave: outlets go to their designated frames); otherwise every rack.
 */
export function panelsInOrder(ix: ProjectIndex, roomId: Id): Device[] {
	const all = ix.devices.filter((d) => d.kind === 'panel' && d.portCount > 0 && panelRoom(ix, d) === roomId)
	const isFrame = (d: Device) => !!(ix.get(d.rackId) as Rack | undefined)?.patchFrame
	const panels = all.some(isFrame) ? all.filter(isFrame) : all
	const rackRank = new Map<Id, number>()
	for (const sp of new Set(panels.map((d) => (ix.get(d.rackId) as Rack | undefined)?.spaceId).filter((x): x is Id => !!x))) {
		for (const r of racksInOrder(ix, sp)) rackRank.set(r.id, rackRank.size)
	}
	const top = (d: Device) => d.u + d.heightU - 1
	return panels.sort((a, b) => (rackRank.get(a.rackId) ?? 1e9) - (rackRank.get(b.rackId) ?? 1e9) || top(b) - top(a) || naturalCompare(a.name, b.name))
}

export function allocate(ix: ProjectIndex, opts: AllocOpts = {}): Allocation {
	const out: Allocation = { add: [], remove: [], unallocated: [], issues: [], rooms: [] }
	const only = opts.outletIds ? new Set(opts.outletIds) : null
	const outlets = ix.outlets
		.filter((o) => (!opts.levelId || o.levelId === opts.levelId) && (!only || only.has(o.id)) && o.usage !== 'N/A')
		.sort((a, b) => naturalCompare(a.label, b.label))

	// existing horizontal links, by outlet port and by panel port
	const horizontal = ix.links.filter((l) => l.kind === 'horizontal')
	const linkOfOutletPort = new Map<string, Link>(horizontal.map((l) => [opKey(l.b.on, l.b.port), l]))
	const patched = new Set(ix.cords.filter((c) => c.status !== 'remove').flatMap((c) => [opKey(c.a.on, c.a.port), opKey(c.b.on, c.b.port)]))
	const dropped = new Set<Id>()

	const wants: Want[] = []
	for (const o of outlets) for (const p of o.ports) {
		if (opts.serverRoomId && p.serverRoomId !== opts.serverRoomId) continue
		const l = linkOfOutletPort.get(opKey(o.id, p.port))
		if (l) {
			if (!opts.reallocate || l.pinned) continue
			if (patched.has(opKey(l.a.on, l.a.port))) {
				out.issues.push({ kind: 'kept-patched', outletId: o.id, port: p.port, text: `${p.label || o.label} stays on ${ix.portPlace(l.a)} — that panel port is patched` })
				continue
			}
			dropped.add(l.id)
		}
		if (!p.serverRoomId) {
			out.unallocated.push({ outletId: o.id, port: p.port, reason: 'no server room set' })
			out.issues.push({ kind: 'no-server-room', outletId: o.id, port: p.port, text: `${p.label || `${o.label} port ${p.port}`} has no server room` })
			continue
		}
		wants.push({ o, port: p.port, cableType: p.cableType })
	}
	out.remove = [...dropped]

	// panel ports already taken (by the links that stay)
	const taken = new Set(ix.links.filter((l) => !dropped.has(l.id)).flatMap((l) => [opKey(l.a.on, l.a.port), opKey(l.b.on, l.b.port)]))

	const byRoom = new Map<Id, Want[]>()
	for (const w of wants) { const r = w.o.ports[w.port - 1].serverRoomId!; byRoom.set(r, [...(byRoom.get(r) ?? []), w]) }

	for (const [roomId, roomWants] of byRoom) {
		const name = ix.nameOf(roomId) || roomId
		const panels = panelsInOrder(ix, roomId)
		const slotsOf = (tier: 'low' | 'high'): Slot[] => panels.filter((d) => (d.panel?.tier ?? 'low') === tier).flatMap((d) => {
			const res = new Map<number, string>()
			for (const r of d.panel?.reservations ?? []) for (const n of r.ports) res.set(n, r.usage)
			const usages = d.panel?.usages?.length ? d.panel.usages : undefined
			return Array.from({ length: d.portCount }, (_, i) => i + 1).filter((n) => !taken.has(opKey(d.id, n))).map((n) => ({ d, port: n, ...(res.has(n) ? { reserved: res.get(n) } : {}), ...(usages ? { usages } : {}) }))
		})
		const lowSlots = slotsOf('low'), highSlots = slotsOf('high')
		const lowWants = roomWants.filter((w) => w.o.tier !== 'high'), highWants = roomWants.filter((w) => w.o.tier === 'high')
		const stats: RoomStats = { serverRoomId: roomId, name, low: { wanted: lowWants.length, placed: 0, free: lowSlots.length }, high: { wanted: highWants.length, placed: 0, free: highSlots.length, onFloor: 0 } }
		out.rooms.push(stats)
		if (!panels.length) {
			for (const w of roomWants) out.unallocated.push({ outletId: w.o.id, port: w.port, reason: `${name} has no patch panels` })
			out.issues.push({ kind: 'no-panels', text: `${name}: ${roomWants.length} outlet port(s) to cable but no patch panels` })
			continue
		}

		const place = (w: Want, s: Slot) => {
			out.add.push({ type: 'link', id: newId(), kind: 'horizontal', a: { on: s.d.id, port: s.port, face: 'rear' }, b: { on: w.o.id, port: w.port }, cableType: w.cableType, status: 'design' })
		}
		const low = fill(lowWants, lowSlots)
		low.placed.forEach(([w, s]) => place(w, s)); stats.low.placed = low.placed.length
		const high = fill(highWants, highSlots)
		high.placed.forEach(([w, s]) => place(w, s)); stats.high.placed = high.placed.length
		// high ports that didn't fit: onto the floor-panel ports left after the low ports (never reserved ones)
		const spare = low.left.filter((s) => !s.reserved)
		const over = fill(high.unplaced, spare)
		over.placed.forEach(([w, s]) => place(w, s)); stats.high.onFloor = over.placed.length
		if (over.placed.length) out.issues.push({ kind: 'high-on-floor-panel', text: `${name}: ${over.placed.length} high-level port(s) went to floor panels — the high-level panels are full` })
		const unplaced = [...low.unplaced, ...over.unplaced]
		for (const w of unplaced) out.unallocated.push({ outletId: w.o.id, port: w.port, reason: `${name} panels are full` })
		if (unplaced.length) out.issues.push({ kind: 'full', text: `${name}: ${unplaced.length} outlet port(s) don't fit — add panels (${low.unplaced.length} low, ${over.unplaced.length} high)` })
	}

	// links that stay but go to a panel of another server room than the port asks for
	for (const l of horizontal) {
		if (dropped.has(l.id)) continue
		const o = ix.get(l.b.on), d = ix.get(l.a.on)
		if (o?.type !== 'outlet' || d?.type !== 'device' || (opts.levelId && o.levelId !== opts.levelId) || (only && !only.has(o.id))) continue
		const want = o.ports[l.b.port - 1]?.serverRoomId, got = panelRoom(ix, d)
		if (want && got && want !== got) out.issues.push({ kind: 'room-mismatch', outletId: o.id, port: l.b.port, text: `${o.ports[l.b.port - 1].label || o.label} is cabled to ${ix.nameOf(got)} but set to ${ix.nameOf(want)}` })
	}
	return out
}

/**
 * Each outlet port, in order, takes the first free slot (in fill order) of the best kind for its usage:
 *  1. a port RESERVED for its usage, 2. a port on a panel FOR its usage, 3. a port on a GENERAL panel (no usages set,
 *  not reserved). A reserved port or a usage panel never takes another usage.
 */
function fill(wants: Want[], slots: Slot[]): { placed: [Want, Slot][]; unplaced: Want[]; left: Slot[] } {
	const placed: [Want, Slot][] = [], unplaced: Want[] = [], used = new Set<Slot>()
	// one cursor per kind of slot, so each search resumes where the last left off
	const queues = new Map<string, Slot[]>()
	const queue = (k: string, pred: (s: Slot) => boolean) => { let q = queues.get(k); if (!q) { q = slots.filter(pred); queues.set(k, q) } return q }
	const take = (q: Slot[]) => { while (q.length && used.has(q[0])) q.shift(); const s = q.shift(); if (s) used.add(s); return s }
	for (const w of wants) {
		const u = w.o.usage
		const s = take(queue(`r:${u}`, (x) => x.reserved === u)) ?? take(queue(`u:${u}`, (x) => !x.reserved && !!x.usages?.includes(u))) ?? take(queue('g', (x) => !x.reserved && !x.usages))
		if (s) placed.push([w, s]); else unplaced.push(w)
	}
	return { placed: placed.sort((a, b) => slots.indexOf(a[1]) - slots.indexOf(b[1])), unplaced, left: slots.filter((s) => !used.has(s)) }
}

/** "Assign here": put these outlet ports, in order, on consecutive FREE ports of panels from a starting port (moving
 *  them off wherever they were). Hand placement — the links are pinned so re-allocation never moves them. */
export function assignFrom(ix: ProjectIndex, wants: { outletId: Id; port: number }[], start: { on: Id; port: number }): { add: Link[]; remove: Id[]; left: number } {
	const panel = ix.get(start.on)
	if (panel?.type !== 'device') return { add: [], remove: [], left: wants.length }
	const room = panelRoom(ix, panel)
	const order = room ? panelsInOrder(ix, room) : [panel]
	const from = order.findIndex((d) => d.id === panel.id)
	const moving = new Set(wants.map((w) => opKey(w.outletId, w.port)))
	const remove = ix.links.filter((l) => l.kind === 'horizontal' && moving.has(opKey(l.b.on, l.b.port))).map((l) => l.id)
	const removed = new Set(remove)
	const taken = new Set(ix.links.filter((l) => !removed.has(l.id)).flatMap((l) => [opKey(l.a.on, l.a.port), opKey(l.b.on, l.b.port)]))
	const slots: { d: Device; port: number }[] = []
	for (const d of order.slice(from < 0 ? 0 : from)) for (let n = d.id === panel.id ? start.port : 1; n <= d.portCount; n++) if (!taken.has(opKey(d.id, n))) slots.push({ d, port: n })
	const add: Link[] = []
	wants.forEach((w, i) => {
		const s = slots[i], o = ix.get(w.outletId)
		if (!s || o?.type !== 'outlet') return
		add.push({ type: 'link', id: newId(), kind: 'horizontal', a: { on: s.d.id, port: s.port, face: 'rear' }, b: { on: w.outletId, port: w.port }, cableType: o.ports[w.port - 1]?.cableType, status: 'design', pinned: true })
	})
	return { add, remove, left: wants.length - add.length }
}
