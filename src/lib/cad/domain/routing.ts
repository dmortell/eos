// CABLE ROUTING (Phase 5.1–5.2): every link's route over the drawn containment, recomputed from the data (Dave: never
// stored). The graph: each run segment is cut wherever another run's node touches it (a tee or a shared end, within
// JOIN_MM in 3D), and riser ends meet the other level's runs the same way. A link's route:
//   outlet → the nearest point of the nearest run of its tier (or a wall run) that serves its server room — a drop:
//            plan distance, then the height difference;
//   → the shortest path through the graph (true 3D lengths, risers included);
//   → the rack: from a run serving its room (each run's nearest point; the cheapest one wins) — plan distance to the
//            rack, then the height to the panel's U.
// Backbone / tie links route rack to rack the same way. Length (5.2) = route + slack at the outlet, rounded up;
// waste % is a BOM matter (reports.ts). Pure; tested in routing.test.ts.
import type { Id, Outlet, Rack, Device, Level } from './types'
import type { Shape, PathNode } from './shapes'
import type { ProjectIndex } from './project'

export const JOIN_MM = 50
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

/** The outlet's height above its level's FFL: its own z, else by mount (ceiling → the clear height). */
export function outletZ(o: Outlet, level: Level | undefined): number {
	return o.z ?? (o.mount === 'ceiling' ? level?.heights.clearHeightMm ?? 2600 : o.mount === 'wall' ? 300 : 0)
}

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
		const t = tapOn(g, i, x)
		if (!best || t.dropMm < best.dropMm) best = t
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
	const x = { ...rack.at, z: levelElevation(ix, rack.levelId) + panelZ(device) }
	const best = new Map<Id, Tap & { plan: number }>()
	g.segs.forEach((s, i) => {
		if (!s.levelIds.has(rack.levelId) || !serves(s.shape, rack.spaceId)) return
		if (Math.abs(s.p.x - s.q.x) < 0.5 && Math.abs(s.p.y - s.q.y) < 0.5) return   // not onto a riser
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
export function fromTaps(g: Graph, taps: Tap[]): { d: Float64Array; prev: Int32Array; startTap: Int32Array } {
	const n = g.nodes.length, d = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), startTap = new Int32Array(n).fill(-1)
	const heap: [number, number][] = []
	const push = (k: number, v: number) => { heap.push([k, v]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p } }
	const pop = (): [number, number] => {
		const top = heap[0], last = heap.pop()!
		if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m } }
		return top
	}
	taps.forEach((tp, ti) => {
		const s = g.segs[tp.seg], list = g.piecesOf.get(segKey(s.shape.id, s.seg)) ?? []
		const pc = list.map((k) => g.pieces[k]).find((p) => tp.t >= p.t0 - 1e-9 && tp.t <= p.t1 + 1e-9)
		if (!pc) return
		for (const [node, tt] of [[pc.a, pc.t0], [pc.b, pc.t1]] as const) {
			const c = tp.dropMm + Math.abs(tp.t - tt) * s.len
			if (c < d[node]) { d[node] = c; prev[node] = -1; startTap[node] = ti; push(c, node) }
		}
	})
	while (heap.length) {
		const [c, u] = pop()
		if (c > d[u]) continue
		for (const e of g.adj[u]) {
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
	const g = buildGraph(ix), out = new Map<Id, Route>()
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
			if (!t) { finish({ segs: [], problem: `no ${outlet.tier} run near the outlet serving its room` }); continue }
			ends = [t]
		} else {
			const d2 = deviceOf(l.b.on), r2 = rackOfDevice(d2)
			if (!r2?.at) { finish({ segs: [], problem: 'the far panel is not in a placed rack' }); continue }
			ends = rackTaps(g, ix, r2, d2)
		}
		// through a chosen run (a riser for diversity): rack → the run → far end, both halves shortest
		if (l.via) {
			const fromB = { ...fromTaps(g, ends), taps: ends }
			let bv: { cost: number; u: number; v: number; piece: number } | null = null
			g.pieces.forEach((pc, pi) => {
				if (pc.shape !== l.via) return
				for (const [u, v] of [[pc.a, pc.b], [pc.b, pc.a]] as const) {
					const c = from.d[u] + pc.len + fromB.d[v]
					if (c < (bv?.cost ?? Infinity)) bv = { cost: c, u, v, piece: pi }
				}
			})
			const via = bv as { cost: number; u: number; v: number; piece: number } | null
			if (!via || !Number.isFinite(via.cost)) { finish({ segs: [], problem: `the cable can't reach ${ix.nameOf(l.via) || 'the chosen run'} from both ends` }); continue }
			const vp = g.pieces[via.piece]
			finish({ segs: dedupe([...walk(g, fromB, via.v).reverse(), { shape: vp.shape, seg: vp.seg }, ...walk(g, from, via.u)]), routeMm: via.cost })
			continue
		}
		// cost at each end tap: reach its segment's piece ends from the rack, or (same segment as a rack tap) go along it
		let best: { cost: number; node: number; tap: Tap; direct?: Tap } | null = null
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
				if (c < (best?.cost ?? Infinity)) best = { cost: c, node: -1, tap: tp, direct: rt }
			}
		}
		if (!best || !Number.isFinite(best.cost)) { finish({ segs: [], problem: 'the runs at the two ends are not connected' }); continue }
		// the segments walked, from the far end back to the rack
		const endSeg = g.segs[best.tap.seg]
		finish({ segs: dedupe([{ shape: endSeg.shape.id, seg: endSeg.seg }, ...(best.node >= 0 ? walk(g, from, best.node) : [])]), routeMm: best.cost })
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
const dedupe = (segs: Route['segs']) => segs.filter((s, i) => !i || s.shape !== segs[i - 1].shape || s.seg !== segs[i - 1].seg)

/** For the BOM: metres per cable type with waste, and a box note (305 m boxes). */
export function cableMetres(ix: ProjectIndex, routes: Map<Id, Route>, cable: CableSettings = DEFAULT_CABLE): { type: string; metres: number; links: number; unrouted: number }[] {
	const by = new Map<string, { type: string; metres: number; links: number; unrouted: number }>()
	for (const l of ix.links) {
		const type = l.cableType ?? 'cable', r = routes.get(l.id), row = by.get(type) ?? { type, metres: 0, links: 0, unrouted: 0 }
		row.links++
		if (r?.lengthM != null) row.metres += r.lengthM
		else row.unrouted++
		by.set(type, row)
	}
	return [...by.values()].map((r) => ({ ...r, metres: Math.ceil(r.metres * (1 + cable.wastePct / 100)) }))
}

export const BOX_M = 305
export const boxNote = (metres: number) => `≈ ${Math.ceil(metres / BOX_M)} box(es) of ${BOX_M} m`
