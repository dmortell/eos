// Patching (Phase 3.5, phase3.md §5): patch cords between device ports in a server room, with the Patching tool's
// rules — the port gate, the install workflow (add / remove / change / installed), estimated lengths snapped up to
// stock lengths, bulk patching, and the circuit trace (outlet → link → panel → cord → switch …).
import type { Id, Cord, Device, PortRef, Rack } from './types'
import type { ProjectIndex } from './project'
import { racksInOrder } from './devices'
import { newId } from './ids'

export const STANDARD_LENGTHS = [0.3, 0.5, 1, 1.5, 2, 3, 5, 7, 10, 15, 20, 30]
/** A raw length snapped UP to a stock cord length (the longest when it's longer than all). */
export const snapToStandard = (m: number) => STANDARD_LENGTHS.find((l) => l >= m) ?? STANDARD_LENGTHS[STANDARD_LENGTHS.length - 1]

const RU = 44.45, RAIL_W = 482.6, RACK_GAP = 200, PORTS_PER_ROW = 24
const SLACK_SAME_RU = 2, SLACK_CROSS_RU = 5

/** `status`: what a new cord starts as — `add` (planning a new install) or `installed` (surveying a built site), the
 *  project's Planning / Surveying toggle (patch-list-plan.md D1). */
export interface CordDefaults { cableType: string; colour: string; status?: 'add' | 'installed' }

const key = (r: { on: Id; port: number }) => `${r.on}:${r.port}`

/** The cord plugged into a device port (either face counts — a port takes one cord), ignoring removed ones. */
export function cordAt(ix: ProjectIndex, r: { on: Id; port: number }, skip?: Id): Cord | undefined {
	return ix.cords.find((c) => c.id !== skip && c.status !== 'remove' && ((c.a.on === r.on && c.a.port === r.port) || (c.b.on === r.on && c.b.port === r.port)))
}

/**
 * Can a cord go on this port? Null = yes, else why not. The GATE (the Patching tool's rule, scoped to the port): a
 * patch-panel port must carry a label — allocated to an outlet, or labelled by hand — before it's patched. Any
 * device: the port must exist and be free.
 */
export function patchProblem(ix: ProjectIndex, r: PortRef, skip?: Id): string | null {
	const d = ix.get(r.on)
	if (d?.type !== 'device') return 'Cords go between device ports'
	if (r.port < 1 || r.port > d.portCount) return `${d.name} has no port ${r.port}`
	if (d.kind === 'panel' && !ix.portLabel(r)) return `${d.name} port ${r.port} has no label yet — allocate an outlet to it (or label it) before patching`
	const c = cordAt(ix, r, skip)
	if (c) return `${d.name} port ${r.port} is already patched (to ${ix.portPlace(c.a.on === r.on && c.a.port === r.port ? c.b : c.a)})`
	return null
}

/** A patch cord stays in one room: between rooms (or floors) it's an interconnect cable, not a cord. Null = same room. */
export function roomProblem(ix: ProjectIndex, a: { on: Id }, b: { on: Id }): string | null {
	const room = (on: Id) => { const d = ix.get(on); const r = d?.type === 'device' ? ix.get(d.rackId) : undefined; return r?.type === 'rack' ? r.spaceId : undefined }
	const ra = room(a.on), rb = room(b.on)
	if (!ra || !rb || ra === rb) return null
	return `A patch cord stays in one room (${ix.nameOf(ra)} ≠ ${ix.nameOf(rb)}) — use Link to… for cables between rooms`
}

/**
 * Estimated cord length in metres, snapped up to stock (the Patching tool's model, on real mm geometry): down/up the
 * rack between the two U positions; across to the side channel from each port; through the nearest horizontal
 * manager when the cord has to cross sides; rack to rack along the row (plan positions when both racks are placed,
 * else their widths in row order plus a gap); the rack depth when it goes front ↔ rear; plus slack.
 */
export function cordLength(ix: ProjectIndex, a: PortRef, b: PortRef): number {
	const da = ix.get(a.on), db = ix.get(b.on)
	if (da?.type !== 'device' || db?.type !== 'device') return 0
	const ra = ix.get(da.rackId) as Rack | undefined, rb = ix.get(db.rackId) as Rack | undefined
	if (!ra || !rb) return 0
	const uOf = (d: Device) => d.u + (d.heightU - 1) / 2
	const cols = (d: Device) => Math.min(Math.max(d.portCount, 1), PORTS_PER_ROW)
	const col = (d: Device, port: number) => (port - 1) % cols(d)
	const left = (d: Device, port: number) => col(d, port) < cols(d) / 2
	const toChannel = (d: Device, port: number) => { const w = RAIL_W / cols(d), c = col(d, port); return left(d, port) ? (c + 0.5) * w : (cols(d) - c - 0.5) * w }
	const managers = (r: Rack) => ix.devicesIn(r.id).filter((d) => d.kind === 'manager').map(uOf)
	const nearest = (us: number[], u: number) => us.reduce((best, x) => (Math.abs(x - u) < Math.abs(best - u) ? x : best), us[0])
	const ua = uOf(da), ub = uOf(db)
	let vertical = 0, horizontal = toChannel(da, a.port) + toChannel(db, b.port)
	const same = ra.id === rb.id
	if (same) {
		const ma = managers(ra)
		if (left(da, a.port) !== left(db, b.port) && ma.length) {
			const m = nearest(ma, (ua + ub) / 2)
			vertical = (Math.abs(ua - m) + Math.abs(m - ub)) * RU
			horizontal += RAIL_W
		} else vertical = Math.abs(ua - ub) * RU
	} else {
		vertical = Math.abs(ua - ub) * RU
		const { dist, aIsLeft } = rackApart(ix, ra, rb)
		horizontal += dist
		// a port on the far side from the way the cord leaves crosses through a manager
		for (const [d, port, r, u, exitLeft] of [[da, a.port, ra, ua, !aIsLeft], [db, b.port, rb, ub, aIsLeft]] as const) {
			const ms = managers(r)
			if (left(d, port) !== exitLeft && ms.length) { vertical += 2 * Math.abs(u - nearest(ms, u)) * RU; horizontal += RAIL_W }
		}
	}
	const depth = (a.face ?? 'front') !== (b.face ?? 'front') ? ra.depthMm : 0
	const slack = (same ? SLACK_SAME_RU : SLACK_CROSS_RU) * RU
	return snapToStandard((vertical + horizontal + depth + slack) / 1000)
}

/** How far apart two racks are (centre to centre, mm), and whether A is left of B as the row is seen. */
function rackApart(ix: ProjectIndex, ra: Rack, rb: Rack): { dist: number; aIsLeft: boolean } {
	const order = racksInOrder(ix, ra.spaceId)
	const ia = order.findIndex((r) => r.id === ra.id), ib = order.findIndex((r) => r.id === rb.id)
	if (ra.at && rb.at) return { dist: Math.abs(ra.at.x - rb.at.x) + Math.abs(ra.at.y - rb.at.y), aIsLeft: ia <= ib }
	const lo = Math.min(ia, ib), hi = Math.max(ia, ib)
	let dist = 0
	for (let i = lo; i < hi; i++) dist += (order[i]?.widthMm ?? 600) / 2 + (order[i + 1]?.widthMm ?? 600) / 2 + RACK_GAP
	return { dist: ia < 0 || ib < 0 ? 2000 : dist, aIsLeft: ia <= ib }
}

/** A new cord (status `add`, or `installed` when surveying), checked against the gate at both ends. */
export function makeCord(ix: ProjectIndex, a: PortRef, b: PortRef, d: CordDefaults): { cord?: Cord; problem?: string } {
	if (a.on === b.on && a.port === b.port) return { problem: 'Both ends are the same port' }
	const p = patchProblem(ix, a) ?? patchProblem(ix, b) ?? roomProblem(ix, a, b)
	if (p) return { problem: p }
	return { cord: { type: 'cord', id: newId(), kind: 'patch', a, b, cableType: d.cableType, colour: d.colour, lengthM: cordLength(ix, a, b), lengthLocked: false, status: d.status ?? 'add' } }
}

/**
 * Delete in the install workflow: a cord that is (or was) installed is only MARKED `remove` — it has to come out on
 * site; a cord that was only ever planned (`add`) is deleted outright. Returns the cord to write, or null = delete it.
 */
export function removeCord(c: Cord): Cord | null {
	if (c.status === 'add') return null
	if (c.status === 'remove') return c
	// a planned move not yet made: the cord is still at its old ends on site — it comes out from there
	if (c.status === 'change' && c.previous) return { ...c, a: c.previous.a, b: c.previous.b, status: 'remove', previous: c.previous }
	// a swap not yet made: the cord on site is the one it replaces — that comes out
	if (c.status === 'replace' && c.previous) return { ...revertCord(c), status: 'remove', previous: c.previous }
	return { ...c, status: 'remove', previous: { a: c.a, b: c.b, status: c.status } }
}

/** Several cords out in the install workflow: the planned ones deleted, the others marked `remove` (already marked: as is). */
export function removeCords(cs: Cord[]): { marked: Cord[]; deleted: Id[] } {
	const marked: Cord[] = [], deleted: Id[] = []
	for (const c of cs) {
		const n = removeCord(c)
		if (!n) deleted.push(c.id)
		else if (n !== c) marked.push(n)
	}
	return { marked, deleted }
}
/** "3 marked for removal, 2 deleted" — what removeCords did. */
export const removedText = (r: { marked: Cord[]; deleted: Id[] }) => [r.marked.length ? `${r.marked.length} marked for removal` : '', r.deleted.length ? `${r.deleted.length} deleted (never installed)` : ''].filter(Boolean).join(', ')

/** The same port and face. */
export const sameEnd = (x: PortRef, y: PortRef) => x.on === y.on && x.port === y.port && (x.face ?? '') === (y.face ?? '')

/**
 * Move one end of a cord. An installed cord becomes a `change` (remembering where it was); a planned one just moves.
 * A change moved back onto its old ends is `installed` again (nothing to do on site). A cord being removed doesn't
 * move — restore it first.
 */
export function repatch(ix: ProjectIndex, c: Cord, end: 'a' | 'b', to: PortRef): { cord?: Cord; problem?: string } {
	if (c.status === 'remove') return { problem: 'The cord is marked for removal — restore it first' }
	const other = end === 'a' ? c.b : c.a
	if (to.on === other.on && to.port === other.port) return { problem: 'Both ends are the same port' }
	const p = patchProblem(ix, to, c.id) ?? roomProblem(ix, to, other)
	if (p) return { problem: p }
	const moved = { ...c, [end]: to }
	let next: Cord = c.status === 'installed' || c.status === 'change' || c.status === 'replace'
		? { ...moved, status: 'change', previous: c.previous ?? { a: c.a, b: c.b, status: c.status } }
		: moved
	if (next.status === 'change' && next.previous && sameEnd(next.a, next.previous.a) && sameEnd(next.b, next.previous.b)) next = revertCord(next)
	return { cord: c.lengthLocked ? next : { ...next, lengthM: cordLength(ix, next.a, next.b) } }
}

/**
 * The status set by hand (Cord Properties' dropdown, the patch list's Add) — to fix a mistake, so it never deletes:
 * installed / add forget the change history; remove remembers the cord's ends and status (Restore brings it back);
 * change keeps the history it has.
 */
export function setStatus(c: Cord, s: Cord['status']): Cord {
	if (s === c.status) return c
	const { previous: _p, ...rest } = c
	if (s === 'installed' || s === 'add') return { ...rest, status: s }
	if (s === 'remove') return removeCord(c) ?? { ...rest, status: 'remove', previous: { a: c.a, b: c.b, status: c.status } }
	// replace: the cord as it is now is what comes out (its type, colour, length) — change those next
	if (s === 'replace') return { ...c, status: s, previous: { ...(c.previous ?? { a: c.a, b: c.b, status: c.status }), cableType: c.cableType, colour: c.colour, lengthM: c.lengthM } }
	return { ...c, status: s }
}

/** Every cord status, in the lists' order. */
export const CORD_STATUSES: Cord['status'][] = ['add', 'change', 'replace', 'remove', 'installed']

/** What a REPLACE swaps out, when it differs: "was CAT6 · blue · 2 m". */
export function replacedText(c: Cord, typeLabel: (id: string) => string = (x) => x): string {
	const p = c.previous
	if (c.status !== 'replace' || !p) return ''
	const parts = [p.cableType !== undefined && p.cableType !== c.cableType ? typeLabel(p.cableType) : '', p.colour !== undefined && p.colour !== c.colour ? p.colour : '', p.lengthM !== undefined && p.lengthM !== c.lengthM ? `${p.lengthM} m` : '']
	return parts.some(Boolean) ? `was ${parts.filter(Boolean).join(' · ')}` : ''
}

/** Back to how it was before a re-patch / removal (the `previous` ends and status). */
export function revertCord(c: Cord): Cord {
	if (!c.previous) return c
	const { previous, ...rest } = c
	const { a, b, status, cableType, colour, lengthM } = previous
	// a replace (or a removal of one) also takes back the cord it swapped out
	return { ...rest, a, b, status, ...(cableType !== undefined ? { cableType } : {}), ...(colour !== undefined ? { colour } : {}), ...(lengthM !== undefined ? { lengthM } : {}) }
}

/** On site: the cord is in. A removed cord is gone (null = delete the record). */
export function installCord(c: Cord): Cord | null {
	if (c.status === 'remove') return null
	const { previous: _p, ...rest } = c
	return { ...rest, status: 'installed' }
}

/** What the patch list (and Properties for several cords) does to the selected cords (patch-list-plan.md Slice 2). */
export type CordAction = 'installed' | 'add' | 'remove' | 'restore' | 'delete'

/**
 * A bulk action as writes: Installed = done on site (a `remove` cord's record goes); Add = planned again (history
 * forgotten); Remove = the install workflow (planned ones deleted, the others marked); Restore = back to the ends and
 * status before the change / removal; Delete = the records go, no removal work. Cords it doesn't apply to are left.
 */
export function cordAction(cs: Cord[], a: CordAction): { put: Cord[]; del: Id[] } {
	const put: Cord[] = [], del: Id[] = []
	if (a === 'delete') return { put, del: cs.map((c) => c.id) }
	if (a === 'remove') { const r = removeCords(cs); return { put: r.marked, del: r.deleted } }
	for (const c of cs) {
		if (a === 'installed' && c.status !== 'installed') { const n = installCord(c); if (n) put.push(n); else del.push(c.id) }
		else if (a === 'add' && c.status !== 'add') put.push(setStatus(c, 'add'))
		else if (a === 'restore' && c.previous) put.push(revertCord(c))
	}
	return { put, del }
}

/** A cable type on cords: its colour comes with it (as the legacy patch list did), else the cord keeps its own. */
export function withCableType(c: Cord, type: { id: string; color?: string }): Cord {
	return { ...c, cableType: type.id, ...(type.color ? { colour: type.color } : {}) }
}

/**
 * Bulk patch: the ports of device A, in order, onto device B from port `start`. IN STEP (the default): the i-th port
 * goes to `start + i`, a pair is skipped when either port is refused (taken, unlabelled), and it stops at B's last
 * port. `fill`: only B's free ports are filled — a refused B port is passed over, so every free A port gets the next
 * free B port. `skipped`: one reason per A port left unpatched (their count is what the preview shows as skipped).
 */
export function bulkPatch(ix: ProjectIndex, a: { on: Id; ports: number[]; face?: 'front' | 'rear' }, b: { on: Id; start: number; face?: 'front' | 'rear' }, d: CordDefaults, opts: { fill?: boolean } = {}): { cords: Cord[]; skipped: string[] } {
	const devB = ix.get(b.on)
	const cords: Cord[] = [], skipped: string[] = []
	if (devB?.type !== 'device') return { cords, skipped: ['Not a device'] }
	const room = roomProblem(ix, a, b)
	if (room) return { cords, skipped: [room] }
	let nb = b.start
	const usedB = new Set<number>()
	a.ports.forEach((pa, i) => {
		const ra: PortRef = { on: a.on, port: pa, ...(a.face ? { face: a.face } : {}) }
		if (!opts.fill) nb = b.start + i
		if (nb > devB.portCount) { skipped.push(`${ix.portPlace(ra)}: ${devB.name} has no ${opts.fill ? 'free port left' : `port ${nb}`}`); return }
		const pr = patchProblem(ix, ra)
		if (pr) { skipped.push(pr); return }
		if (opts.fill) {
			while (nb <= devB.portCount && (usedB.has(nb) || patchProblem(ix, { on: b.on, port: nb }))) nb++
			if (nb > devB.portCount) { skipped.push(`${ix.portPlace(ra)}: ${devB.name} has no free port left`); return }
		} else {
			const pb = patchProblem(ix, { on: b.on, port: nb })
			if (pb) { skipped.push(`${ix.portPlace(ra)}: ${pb}`); return }
		}
		const rb: PortRef = { on: b.on, port: nb, ...(b.face ? { face: b.face } : {}) }
		cords.push({ type: 'cord', id: newId(), kind: 'patch', a: ra, b: rb, cableType: d.cableType, colour: d.colour, lengthM: cordLength(ix, ra, rb), lengthLocked: false, status: d.status ?? 'add' })
		usedB.add(nb++)
	})
	return { cords, skipped }
}

/** How a device's ports are used: `patched` = a cord on it (either face; removed cords don't count), `linked` = a
 *  permanent cable on it (to an outlet, a tie, backbone), `used` = either, `free` = neither. */
export interface PortUse { ports: number; used: number; patched: number; linked: number; free: number }
export function portUse(ix: ProjectIndex, d: Device): PortUse {
	return portUseByDevice(ix).get(d.id) ?? { ports: d.portCount, used: 0, patched: 0, linked: 0, free: d.portCount }
}
/** Every device's port use in one pass (for a list of many racks). */
export function portUseByDevice(ix: ProjectIndex): Map<Id, PortUse> {
	const patched = new Map<Id, Set<number>>(), linked = new Map<Id, Set<number>>()
	const mark = (m: Map<Id, Set<number>>, r: PortRef) => { let s = m.get(r.on); if (!s) m.set(r.on, (s = new Set())); s.add(r.port) }
	for (const c of ix.cords) if (c.status !== 'remove') { mark(patched, c.a); mark(patched, c.b) }
	for (const l of ix.links) { mark(linked, l.a); mark(linked, l.b) }
	const out = new Map<Id, PortUse>()
	for (const d of ix.devices) {
		const ok = (n: number) => n >= 1 && n <= d.portCount
		const p = [...(patched.get(d.id) ?? [])].filter(ok), l = [...(linked.get(d.id) ?? [])].filter(ok)
		const used = new Set([...p, ...l]).size
		out.set(d.id, { ports: d.portCount, used, patched: p.length, linked: l.length, free: d.portCount - used })
	}
	return out
}
/** "24 ports · used 20 (patched 12, linked 18) · free 4". */
export const portUseText = (u: PortUse) => `${u.ports} port${u.ports === 1 ? '' : 's'} · used ${u.used} (patched ${u.patched}, linked ${u.linked}) · free ${u.free}`

export interface TraceStep { ref: { on: Id; port: number }; via?: { kind: 'link' | 'cord'; id: Id } }

/**
 * The circuit through a port: across links (outlet ↔ panel rear, panel ↔ panel ties) and cords (panel front ↔
 * switch …), treating a panel port's front and rear as one point. Returned in order from one end to the other.
 */
export function traceCircuit(ix: ProjectIndex, start: { on: Id; port: number }): TraceStep[] {
	const edges = new Map<string, { to: { on: Id; port: number }; kind: 'link' | 'cord'; id: Id }[]>()
	const add = (x: { on: Id; port: number }, y: { on: Id; port: number }, kind: 'link' | 'cord', id: Id) => {
		edges.set(key(x), [...(edges.get(key(x)) ?? []), { to: { on: y.on, port: y.port }, kind, id }])
	}
	for (const l of ix.links) { add(l.a, l.b, 'link', l.id); add(l.b, l.a, 'link', l.id) }
	for (const c of ix.cords) if (c.status !== 'remove') { add(c.a, c.b, 'cord', c.id); add(c.b, c.a, 'cord', c.id) }
	// walk to one end first, then back across to the other, so the result reads end to end
	const walk = (from: { on: Id; port: number }): TraceStep[] => {
		const seen = new Set([key(from)]), out: TraceStep[] = [{ ref: from }]
		for (let cur = from; ;) {
			const next = (edges.get(key(cur)) ?? []).find((e) => !seen.has(key(e.to)))
			if (!next) return out
			seen.add(key(next.to))
			out.push({ ref: next.to, via: { kind: next.kind, id: next.id } })
			cur = next.to
		}
	}
	const full = walk(walk(start).at(-1)!.ref)
	// read it from the OUTLET end when one end is an outlet (outlet → panel → switch), whichever way it was walked
	const isOutlet = (s: TraceStep) => ix.get(s.ref.on)?.type === 'outlet'
	return !isOutlet(full[0]) && isOutlet(full[full.length - 1]) ? walk(full[full.length - 1].ref) : full
}
