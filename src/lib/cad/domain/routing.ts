// CABLE ROUTING (Phase 5.1–5.2): every link's route over the drawn containment, recomputed from the data (Dave: never
// stored). The graph: each run segment is cut wherever another run's node touches it (a tee or a shared end, within
// JOIN_MM in 3D), and riser ends meet the other level's runs the same way. A link's route:
//   outlet → the nearest point of the nearest run of its tier (or a wall run) that serves its server room — a drop:
//            plan distance, then the height difference;
//   → the shortest path through the graph (true 3D lengths, risers included);
//   → the rack: from a run serving its room (each run's nearest point; the cheapest one wins) — plan distance to the
//            rack, then the height to the panel's U.
// Backbone / tie links route rack to rack the same way. Length (5.2) = route + slack at the outlet, rounded up;
// waste % is a BOM matter (reports.ts). Outlet ports with no link yet get an ESTIMATED cable over the same graph
// (domain/estimates.ts). Pure; tested in routing.test.ts.
import { outletZ } from './floors'
import type { Id, Outlet, Rack, Device, Level, Link } from './types'
import type { Shape, PathNode } from './shapes'
import type { ProjectIndex } from './project'
import { cablesOf } from './multicore'
import { roomFloor } from './devices'

export const JOIN_MM = 50
/** The furthest an outlet reaches (plan + height) to join a run (Dave: 10 m); beyond it the port has no route. */
export const MAX_OUTLET_DROP_MM = 10_000
/** How far above / below a riser's end its shaft reaches to meet a run on that floor (a storey). */
export const RISER_REACH_MM = 4_500
export const MAX_PERMANENT_LINK_M = 90
const U_MM = 44.45

type P3 = { x: number; y: number; z: number }
/** A piece of a run segment between two graph nodes (`t0`/`t1` along the segment, 0 → 1). */
interface Piece { shape: Id; seg: Id; a: number; b: number; t0: number; t1: number; len: number }
/** One run segment in 3D, with the run's role (for the tier / room filters). */
interface Seg { shape: Shape; seg: Id; p: P3; q: P3; len: number; levelIds: Set<Id> }

export interface Graph {
	nodes: P3[]
	adj: { to: number; piece: number }[][]
	pieces: Piece[]
	segs: Seg[]
	/** Per "shape:seg": its pieces in order along it. */
	piecesOf: Map<string, number[]>
}

const dist3 = (a: P3, b: P3) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
const segKey = (shape: Id, seg: Id) => `${shape}:${seg}`

/** Where p projects onto p→q (0 → 1, clamped) and how far it is from that point, in 3D. */
function project3(p: P3, q: P3, x: P3): { t: number; d: number } {
	const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z, L2 = dx * dx + dy * dy + dz * dz
	const t = L2 ? Math.max(0, Math.min(1, ((x.x - p.x) * dx + (x.y - p.y) * dy + (x.z - p.z) * dz) / L2)) : 0
	return { t, d: dist3({ x: p.x + dx * t, y: p.y + dy * t, z: p.z + dz * t }, x) }
}

export function levelElevation(ix: ProjectIndex, levelId: Id | undefined): number {
	const l = ix.get(levelId)
	return l?.type === 'level' ? l.elevationMm : 0
}

/** The containment graph of the whole project (all levels). */
export function buildGraph(ix: ProjectIndex): Graph {
	const segs: Seg[] = []
	for (const s of ix.shapes) {
		if (s.role?.kind !== 'containment' || s.geom.kind !== 'path') continue
		const nodes = new Map(s.geom.nodes.map((n) => [n.id, n]))
		const at = (n: PathNode): P3 => ({ x: n.x, y: n.y, z: n.z + levelElevation(ix, n.levelId ?? s.levelId) })
		for (const g of s.geom.segs) {
			const a = nodes.get(g.a), b = nodes.get(g.b)
			if (!a || !b) continue
			const p = at(a), q = at(b)
			segs.push({ shape: s, seg: g.id, p, q, len: dist3(p, q), levelIds: new Set([a.levelId ?? s.levelId!, b.levelId ?? s.levelId!]) })
		}
	}
	// graph nodes: every segment end, merged within JOIN_MM
	const nodes: P3[] = []
	const nodeAt = (x: P3): number => {
		for (let i = 0; i < nodes.length; i++) if (dist3(nodes[i], x) <= JOIN_MM) return i
		nodes.push(x)
		return nodes.length - 1
	}
	const ends = segs.map((s) => [nodeAt(s.p), nodeAt(s.q)] as const)
	// cut each segment at every node lying on it (a tee), then chain the cuts
	const pieces: Piece[] = [], piecesOf = new Map<string, number[]>()
	const adj: Graph['adj'] = nodes.map(() => [])
	segs.forEach((s, i) => {
		const cuts = [{ t: 0, n: ends[i][0] }, { t: 1, n: ends[i][1] }]
		nodes.forEach((x, n) => {
			if (n === ends[i][0] || n === ends[i][1]) return
			const pr = project3(s.p, s.q, x)
			if (pr.d <= JOIN_MM && pr.t > 0 && pr.t < 1) cuts.push({ t: pr.t, n })
		})
		cuts.sort((a, b) => a.t - b.t)
		const list: number[] = []
		for (let k = 0; k + 1 < cuts.length; k++) {
			const c0 = cuts[k], c1 = cuts[k + 1]
			if (c0.n === c1.n) continue
			const piece = pieces.push({ shape: s.shape.id, seg: s.seg, a: c0.n, b: c1.n, t0: c0.t, t1: c1.t, len: s.len * (c1.t - c0.t) }) - 1
			adj[c0.n].push({ to: c1.n, piece }); adj[c1.n].push({ to: c0.n, piece })
			list.push(piece)
		}
		piecesOf.set(segKey(s.shape.id, s.seg), list)
	})
	// A riser ends at the other level's FFL, but the shaft carries on to that floor's trays: its ends also meet any node
	// straight above / below them (same plan point) within a storey (RISER_REACH_MM), counted as more of the riser.
	segs.forEach((s, i) => {
		if (s.levelIds.size < 2 || Math.abs(s.p.x - s.q.x) >= 0.5 || Math.abs(s.p.y - s.q.y) >= 0.5) return
		for (const n of ends[i]) nodes.forEach((x, m) => {
			if (m === n || Math.hypot(x.x - nodes[n].x, x.y - nodes[n].y) > JOIN_MM || Math.abs(x.z - nodes[n].z) > RISER_REACH_MM || adj[n].some((e) => e.to === m)) return
			const piece = pieces.push({ shape: s.shape.id, seg: s.seg, a: n, b: m, t0: 0, t1: 0, len: Math.abs(x.z - nodes[n].z) }) - 1
			adj[n].push({ to: m, piece }); adj[m].push({ to: n, piece })
		})
	})
	return { nodes, adj, pieces, segs, piecesOf }
}

// ── Ends ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A point where a cable joins the graph: on segment `seg` at `t`, after `dropMm` from its end (outlet / panel). */
export interface Tap { seg: number; t: number; dropMm: number }

const serves = (s: Shape, roomId: Id | undefined) => {
	const r = s.role
	return r?.kind === 'containment' && (!roomId || !r.serves?.length || r.serves.includes(roomId))
}
/** Drop from an end at `x` (plan) / `z` (absolute) to a point on the run: plan distance, then the height. */
function tapOn(g: Graph, i: number, x: P3): Tap {
	const s = g.segs[i]
	const pr = project3({ ...s.p, z: 0 }, { ...s.q, z: 0 }, { ...x, z: 0 })   // nearest in PLAN
	const z = s.p.z + (s.q.z - s.p.z) * pr.t
	return { seg: i, t: pr.t, dropMm: pr.d + Math.abs(z - x.z) }
}

/** The outlet's height above its level's FFL (domain/floors.ts, Review 2 Q5). */
export { outletZ }

/** Where an outlet port joins: the nearest run of its tier (wall runs take any) on its level serving its room. */
export function outletTap(g: Graph, ix: ProjectIndex, o: Outlet, roomId: Id | undefined): Tap | null {
	if (!o.at) return null
	const level = ix.get<Level>(o.levelId)
	const x = { ...o.at, z: levelElevation(ix, o.levelId) + outletZ(o, level) }
	let best: Tap | null = null
	g.segs.forEach((s, i) => {
		const role = s.shape.role
		if (role?.kind !== 'containment' || (role.tier !== o.tier && role.tier !== 'wall') || !s.levelIds.has(o.levelId) || !serves(s.shape, roomId)) return
		if (Math.abs(s.p.x - s.q.x) < 0.5 && Math.abs(s.p.y - s.q.y) < 0.5) return   // not onto a riser
		if (!g.piecesOf.get(segKey(s.shape.id, s.seg))?.length) return   // not onto a stub shorter than JOIN_MM: it has no length in the graph, so a route from it goes nowhere (Journey TV06: a 38 mm end bit)
		const t = tapOn(g, i, x)
		if (t.dropMm <= MAX_OUTLET_DROP_MM && (!best || t.dropMm < best.dropMm)) best = t
	})
	return best
}

/** The panel's height (its middle) above the rack's floor. */
export const panelZ = (d: Device | undefined) => (d ? (d.u - 1 + d.heightU / 2) * U_MM + 100 : 1000)

/** How far (plan) a rack reaches for runs to join: the runs in its room, not one across the floor. */
export const RACK_REACH_MM = 3000

/** Where a rack's cables can join: each run serving its room on its level within RACK_REACH_MM (plan), at that run's
 *  nearest point — else just the nearest run. */
export function rackTaps(g: Graph, ix: ProjectIndex, rack: Rack, device: Device | undefined): Tap[] {
	if (!rack.at) return []
	const x = { ...rack.at, z: levelElevation(ix, rack.levelId) + roomFloor(ix, rack.spaceId) + panelZ(device) }   // on its room's floor
	const best = new Map<Id, Tap & { plan: number }>()
	g.segs.forEach((s, i) => {
		if (!s.levelIds.has(rack.levelId) || !serves(s.shape, rack.spaceId)) return
		if (Math.abs(s.p.x - s.q.x) < 0.5 && Math.abs(s.p.y - s.q.y) < 0.5) return   // not onto a riser
		if (!g.piecesOf.get(segKey(s.shape.id, s.seg))?.length) return   // nor onto a stub (see outletTap)
		const plan = project3({ ...s.p, z: 0 }, { ...s.q, z: 0 }, { ...x, z: 0 }).d
		const t = { ...tapOn(g, i, x), plan }, cur = best.get(s.shape.id)
		if (!cur || t.dropMm < cur.dropMm) best.set(s.shape.id, t)
	})
	const all = [...best.values()], near = all.filter((t) => t.plan <= RACK_REACH_MM)
	const pick = near.length ? near : all.sort((a, b) => a.plan - b.plan).slice(0, 1)
	return pick.map(({ plan: _p, ...t }) => t)
}

// ── Shortest paths ───────────────────────────────────────────────────────────────────────────────────────────────

/** Dijkstra from taps (each a start with its own cost onto its segment's pieces). `prev` = the piece walked in by. */
export function fromTaps(g: Graph, taps: Tap[], o?: Only): ReturnType<typeof dijkstra> {
	const init: [number, number, number][] = []
	taps.forEach((tp, ti) => {
		const s = g.segs[tp.seg], list = g.piecesOf.get(segKey(s.shape.id, s.seg)) ?? []
		const pc = list.map((k) => g.pieces[k]).find((p) => tp.t >= p.t0 - 1e-9 && tp.t <= p.t1 + 1e-9)
		if (!pc) return
		for (const [node, tt] of [[pc.a, pc.t0], [pc.b, pc.t1]] as const) init.push([node, tp.dropMm + Math.abs(tp.t - tt) * s.len, ti])
	})
	return dijkstra(g, init, o)
}

/** Runs a walk may not use (on the way to / from them). */
type Only = { skip?: Id[] }
/** Dijkstra from start nodes, each with its cost (and a tag kept in `startTap`: which start it grew from). */
function dijkstra(g: Graph, init: [node: number, cost: number, tag: number][], o?: Only): { d: Float64Array; prev: Int32Array; startTap: Int32Array } {
	const n = g.nodes.length, d = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), startTap = new Int32Array(n).fill(-1)
	const heap: [number, number][] = []
	const push = (k: number, v: number) => { heap.push([k, v]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p } }
	const pop = (): [number, number] => {
		const top = heap[0], last = heap.pop()!
		if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m } }
		return top
	}
	for (const [node, c, tag] of init) if (c < d[node]) { d[node] = c; prev[node] = -1; startTap[node] = tag; push(c, node) }
	while (heap.length) {
		const [c, u] = pop()
		if (c > d[u]) continue
		for (const e of g.adj[u]) {
			const sh = g.pieces[e.piece].shape
			if (o?.skip?.includes(sh)) continue
			const v = e.to, nc = c + g.pieces[e.piece].len
			if (nc < d[v]) { d[v] = nc; prev[v] = e.piece; startTap[v] = startTap[u]; push(nc, v) }
		}
	}
	return { d, prev, startTap }
}

export interface Route {
	linkId: Id
	/** Installed length: the route + the outlet slack, rounded up to the metre (a hand-set `lengthM` wins). */
	lengthM?: number
	/** The route itself, mm: end drops + the path. */
	routeMm?: number
	/** The run segments walked, outlet end first (for Trace / fill). */
	segs: { shape: Id; seg: Id }[]
	/** Why there is no route. */
	problem?: string
	/** Over the 90 m permanent-link limit. */
	over90?: boolean
	handSet?: boolean
}

export interface CableSettings { slackM: number; wastePct: number }
export const DEFAULT_CABLE: CableSettings = { slackM: 0.5, wastePct: 10 }
/** The project's cable settings, defaults filled in. */
export function cableSettings(ix: ProjectIndex): CableSettings {
	const s = ix.get('settings')
	const c = s?.type === 'settings' ? s.cable : undefined
	return { slackM: c?.slackM ?? DEFAULT_CABLE.slackM, wastePct: c?.wastePct ?? DEFAULT_CABLE.wastePct }
}

/** Every link's route and length. */
export function routeLinks(ix: ProjectIndex, cable: CableSettings = DEFAULT_CABLE): Map<Id, Route> {
	return routeLinksOn(buildGraph(ix), ix, cable)
}

/** The cheapest way from a search (`from`, grown from rack taps) to one of `ends`: onto an end tap's piece from a node
 *  the search reached, or straight along the segment when a rack tap is on the same one. Null = not connected. */
export function bestEnd(g: Graph, from: Stage, ends: Tap[]): { cost: number; node: number; tap: Tap } | null {
	let best: { cost: number; node: number; tap: Tap } | null = null
	for (const tp of ends) {
		const s = g.segs[tp.seg], list = g.piecesOf.get(segKey(s.shape.id, s.seg)) ?? []
		const pc = list.map((k) => g.pieces[k]).find((p) => tp.t >= p.t0 - 1e-9 && tp.t <= p.t1 + 1e-9)
		if (!pc) continue
		for (const [node, tt] of [[pc.a, pc.t0], [pc.b, pc.t1]] as const) {
			const c = from.d[node] + Math.abs(tp.t - tt) * s.len + tp.dropMm
			if (c < (best?.cost ?? Infinity)) best = { cost: c, node, tap: tp }
		}
		for (const rt of from.taps) if (rt.seg === tp.seg) {
			const c = rt.dropMm + Math.abs(rt.t - tp.t) * s.len + tp.dropMm
			if (c < (best?.cost ?? Infinity)) best = { cost: c, node: -1, tap: tp }
		}
	}
	return best && Number.isFinite(best.cost) ? best : null
}

/** The segments walked for `bestEnd`'s answer, far end first. */
export function bestSegs(g: Graph, from: Stage, best: { node: number; tap: Tap }): Route['segs'] {
	const endSeg = g.segs[best.tap.seg]
	return dedupe([{ shape: endSeg.shape.id, seg: endSeg.seg }, ...(best.node >= 0 ? walk(g, from, best.node) : [])])
}

/** `routeLinks` over a graph already built (the estimates share it: domain/estimates.ts). */
export function routeLinksOn(g: Graph, ix: ProjectIndex, cable: CableSettings = DEFAULT_CABLE): Map<Id, Route> {
	const out = new Map<Id, Route>()
	const deviceOf = (id: Id) => ix.get<Device>(id)
	const rackOfDevice = (d: Device | undefined) => (d ? ix.get<Rack>(d.rackId) : undefined)
	// one Dijkstra per (rack, panel height): cheap at these sizes, and shared by the panel's links
	const runs = new Map<string, ReturnType<typeof fromTaps> & { taps: Tap[] }>()
	const fromRack = (rack: Rack, dev: Device | undefined) => {
		const k = `${rack.id}|${dev?.u ?? 0}|${dev?.heightU ?? 0}`
		let r = runs.get(k)
		if (!r) { const taps = rackTaps(g, ix, rack, dev); r = { ...fromTaps(g, taps), taps }; runs.set(k, r) }
		return r
	}
	for (const l of ix.links) {
		const dev = deviceOf(l.a.on), rack = rackOfDevice(dev)
		const outlet = ix.get(l.b.on)
		const finish = (r: Omit<Route, 'linkId'>): void => {
			const handSet = !!l.lengthM
			const lengthM = handSet ? l.lengthM : r.routeMm != null ? Math.ceil(r.routeMm / 1000 + (outlet?.type === 'outlet' ? cable.slackM : 0)) : undefined
			out.set(l.id, { ...r, linkId: l.id, lengthM, handSet, over90: lengthM != null && lengthM > MAX_PERMANENT_LINK_M })
		}
		if (!rack?.at) { finish({ segs: [], problem: rack ? 'the rack is not placed on a plan' : 'the panel is not in a rack' }); continue }
		const from = fromRack(rack, dev)
		if (!from.taps.length) { finish({ segs: [], problem: `no run serving ${ix.nameOf(rack.spaceId) || 'its room'} on the rack's level` }); continue }
		// the other end: an outlet port, or another rack's panel
		let ends: Tap[]
		if (outlet?.type === 'outlet') {
			if (!outlet.at) { finish({ segs: [], problem: 'the outlet is not placed' }); continue }
			const port = outlet.ports.find((p) => p.port === l.b.port)
			const t = outletTap(g, ix, outlet, port?.serverRoomId ?? rack.spaceId)
			if (!t) { finish({ segs: [], problem: `no ${outlet.tier} run within ${MAX_OUTLET_DROP_MM / 1000} m of the outlet serving its room` }); continue }
			ends = [t]
		} else {
			const d2 = deviceOf(l.b.on), r2 = rackOfDevice(d2)
			if (!r2?.at) { finish({ segs: [], problem: 'the far panel is not in a placed rack' }); continue }
			ends = rackTaps(g, ix, r2, d2)
		}
		// through chosen runs, in order (a riser for diversity; a route set by hand): rack → run 1 → … → run n → far
		// end, each leg the shortest way; a run is entered at whichever of its pieces makes the whole cheapest
		const vias = viaList(l)
		if (vias.length) {
			const r = throughRuns(g, from, ends, vias)
			if ('stuck' in r) {
				const name = ix.nameOf(r.stuck) || 'a chosen run'
				finish({ segs: [], problem: r.on ? `the cable can't go on from ${name} to its other end (a dead end?)` : `the cable can't reach ${name}${vias.length > 1 ? ' in the order given' : ''}` })
				continue
			}
			finish(r)
			continue
		}
		// cost at each end tap: reach its segment's piece ends from the rack, or (same segment as a rack tap) go along it
		const best = bestEnd(g, from, ends)
		if (!best) { finish({ segs: [], problem: 'the runs at the two ends are not connected' }); continue }
		// the segments walked, from the far end back to the rack
		finish({ segs: bestSegs(g, from, best), routeMm: best.cost })
	}
	return out
}

/** The run segments from a node back to the taps a search started from (that tap's segment last). */
function walk(g: Graph, run: ReturnType<typeof fromTaps> & { taps: Tap[] }, node: number): Route['segs'] {
	const out: Route['segs'] = []
	let n = node
	for (; run.prev[n] >= 0;) { const pc = g.pieces[run.prev[n]]; out.push({ shape: pc.shape, seg: pc.seg }); n = pc.a === n ? pc.b : pc.a }
	const st = run.startTap[node]
	if (st >= 0) { const s0 = g.segs[run.taps[st].seg]; out.push({ shape: s0.shape.id, seg: s0.seg }) }
	return out
}
/** A link's runs to pass through, in order (`via`: one run id, or several). */
export const viaList = (l: Pick<Link, 'via'>): Id[] => (Array.isArray(l.via) ? l.via : l.via ? [l.via] : [])

/** How a list of runs is stored on a link: none → absent, one → its id (as before), several → the list. Runs next to
 *  each other twice collapse to one. */
export const viaValue = (ids: Id[]): Link['via'] => { const v = ids.filter((x, i) => x && x !== ids[i - 1]); return v.length > 1 ? v : v[0] }

/** A search grown from taps, with the taps it grew from. */
export type Stage = ReturnType<typeof fromTaps> & { taps: Tap[] }
/** ALONG one run: its pieces only, walked as directed pieces that never turn straight back on the one just walked
 *  (a dead end stops there), starting from wherever `from` reaches it. `d` = the cheapest arrival at each node after at
 *  least one piece; `back(n)` = the pieces walked to `n` (last first) and the node it joined the run at. */
function alongRun(g: Graph, from: Float64Array, run: Id): { d: Float64Array; back: (n: number) => { segs: Route['segs']; start: number } } {
	const cost = new Map<number, number>(), prev = new Map<number, number>(), heap: [number, number][] = []
	const push = (k: number, v: number) => { heap.push([k, v]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p } }
	const pop = (): [number, number] => {
		const top = heap[0], last = heap.pop()!
		if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m } }
		return top
	}
	// a state = piece × direction (2·piece + 1 = walked b → a); it ends at `end(state)`
	const end = (st: number) => (st & 1 ? g.pieces[st >> 1].a : g.pieces[st >> 1].b), begin = (st: number) => (st & 1 ? g.pieces[st >> 1].b : g.pieces[st >> 1].a)
	const relax = (st: number, c: number, from: number) => { if (c < (cost.get(st) ?? Infinity)) { cost.set(st, c); prev.set(st, from); push(c, st) } }
	g.pieces.forEach((pc, pi) => { if (pc.shape === run) for (const st of [2 * pi, 2 * pi + 1]) if (Number.isFinite(from[begin(st)])) relax(st, from[begin(st)] + pc.len, -1) })
	while (heap.length) {
		const [c, st] = pop()
		if (c > (cost.get(st) ?? Infinity)) continue
		const w = end(st)
		for (const e of g.adj[w]) {
			const pc = g.pieces[e.piece]
			if (pc.shape !== run || e.piece === st >> 1) continue
			relax(2 * e.piece + (pc.a === w ? 0 : 1), c + pc.len, st)
		}
	}
	const d = new Float64Array(g.nodes.length).fill(Infinity), best = new Int32Array(g.nodes.length).fill(-1)
	for (const [st, c] of cost) { const w = end(st); if (c < d[w]) { d[w] = c; best[w] = st } }
	return {
		d,
		back: (n) => {
			const segs: Route['segs'] = []
			let st = best[n], start = n
			for (; st >= 0; st = prev.get(st) ?? -1) { const pc = g.pieces[st >> 1]; segs.push({ shape: pc.shape, seg: pc.seg }); start = begin(st) }
			return { segs, start }
		},
	}
}

/** The route through `vias` in order: legs that don't use the runs they go between (the way to a run comes in from
 *  outside it, the way on never doubles back along it), and ALONG each run (`alongRun`); the last run meets the far
 *  end's Dijkstra. Returns the route (segments far end first), else the run it got stuck at: not reached, or no way
 *  `on` from it without doubling back (a dead end). */
function throughRuns(g: Graph, start: Stage, ends: Tap[], vias: Id[]): Omit<Route, 'linkId'> | { stuck: Id; on: boolean } {
	const from: Stage = { ...fromTaps(g, start.taps, { skip: [vias[0]] }), taps: start.taps }
	const parts: ({ leg: Stage } | { along: ReturnType<typeof alongRun> })[] = []
	let reach = from.d, along: ReturnType<typeof alongRun> | null = null
	for (const [i, run] of vias.entries()) {
		along = alongRun(g, reach, run)
		if (!along.d.some(Number.isFinite)) return { stuck: run, on: false }
		parts.push({ along })
		if (i < vias.length - 1) {
			const out: [number, number, number][] = []
			along.d.forEach((c, n) => { if (Number.isFinite(c)) out.push([n, c, -1]) })
			const leg = { ...dijkstra(g, out, { skip: [run, vias[i + 1]] }), taps: [] }
			parts.push({ leg })
			reach = leg.d
		}
	}
	const last = vias[vias.length - 1], back: Stage = { ...fromTaps(g, ends, { skip: [last] }), taps: ends }
	let x = -1, cost = Infinity
	along!.d.forEach((c, n) => { if (c + back.d[n] < cost) { cost = c + back.d[n]; x = n } })
	if (x < 0 || !Number.isFinite(cost)) return { stuck: last, on: true }
	// back from the far end: its walk, then each part from where it was left to where it began, then to the rack
	const segs: Route['segs'] = [...walk(g, back, x).reverse()]
	let n = x
	for (const p of parts.reverse()) {
		if ('along' in p) { const b = p.along.back(n); segs.push(...b.segs); n = b.start; continue }
		for (; p.leg.prev[n] >= 0;) { const pc = g.pieces[p.leg.prev[n]]; segs.push({ shape: pc.shape, seg: pc.seg }); n = pc.a === n ? pc.b : pc.a }
	}
	segs.push(...walk(g, from, n))
	return { segs: dedupe(segs), routeMm: cost }
}
const dedupe = (segs: Route['segs']) => segs.filter((s, i) => !i || s.shape !== segs[i - 1].shape || s.seg !== segs[i - 1].seg)

/** For the BOM: metres per cable type with waste, and a box note (305 m boxes). `links` = cables: a multi-core cable
 *  counts once, at the length of its first routed core. */
export function cableMetres(ix: ProjectIndex, routes: Map<Id, Route>, cable: CableSettings = DEFAULT_CABLE): { type: string; metres: number; links: number; unrouted: number }[] {
	const by = new Map<string, { type: string; metres: number; links: number; unrouted: number }>()
	for (const cores of cablesOf(ix.links)) {
		const type = cores[0].cableType ?? 'cable', row = by.get(type) ?? { type, metres: 0, links: 0, unrouted: 0 }
		const len = cores.map((l) => routes.get(l.id)?.lengthM).find((m) => m != null)
		row.links++
		if (len != null) row.metres += len
		else row.unrouted++
		by.set(type, row)
	}
	return [...by.values()].map((r) => ({ ...r, metres: Math.ceil(r.metres * (1 + cable.wastePct / 100)) }))
}

export const BOX_M = 305
export const boxNote = (metres: number) => `≈ ${Math.ceil(metres / BOX_M)} box(es) of ${BOX_M} m`
