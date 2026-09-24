// F3: MERGE / JOIN conduit graphs. A conduit run drawn so it touches a compatible conduit (same profile + layer)
// becomes part of it instead of a separate object; a node dropped onto another node merges the two (and, across
// two conduits, the two conduits). "Touches" = within `tol` mm in 3D: node on node, or a free END on a segment
// (the segment is split there). Pure — mutates only the graphs it is given (the caller wraps an undo step).
import type { GNode, GSeg } from './graph'
import type { Obj } from './types'

type G = { nodes: GNode[]; segments: GSeg[] }
type Conduit = Extract<Obj, { type: 'conduit' }>

/** Same kind, same profile, same layer — they can be one object. */
export function compatible(a: Obj, b: Obj): boolean {
	return a.type === 'conduit' && b.type === 'conduit' && a.w === b.w && a.h === b.h && a.edges === b.edges && (a.layer ?? '') === (b.layer ?? '')
}

const d3 = (a: GNode, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const degree = (g: G, id: string) => g.segments.filter((s) => s.a === id || s.b === id).length
/** Closest point of segment a→b to p, with its parameter t ∈ [0,1]. */
function onSeg(p: GNode, a: GNode, b: GNode): { t: number; q: { x: number; y: number; z: number } } {
	const vx = b.x - a.x, vy = b.y - a.y, vz = b.z - a.z, L2 = vx * vx + vy * vy + vz * vz
	const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy + (p.z - a.z) * vz) / L2)) : 0
	return { t, q: { x: a.x + vx * t, y: a.y + vy * t, z: a.z + vz * t } }
}
/** Split `g`'s segment at `q` with a new node (both halves keep the segment's own overrides). */
function split(g: G, seg: GSeg, q: { x: number; y: number; z: number }, uid: (p: string) => string): GNode {
	const n: GNode = { id: uid('n'), x: Math.round(q.x), y: Math.round(q.y), z: Math.round(q.z) }
	g.nodes.push(n)
	const i = g.segments.indexOf(seg)
	g.segments.splice(i, 1, { ...seg, b: n.id }, { ...seg, id: uid('s'), a: n.id })
	return n
}
/** An END node of `from` lying on a segment of `on` (away from that segment's ends) → split it; null if none. */
function endOnSegment(from: G, on: G, tol: number, uid: (p: string) => string): { end: GNode; at: GNode } | null {
	const byId = new Map(on.nodes.map((n) => [n.id, n]))
	for (const e of from.nodes) {
		if (degree(from, e.id) !== 1) continue
		for (const s of on.segments) {
			const a = byId.get(s.a), b = byId.get(s.b); if (!a || !b) continue
			const { t, q } = onSeg(e, a, b)
			if (t > 0.001 && t < 0.999 && d3(e, q) <= tol) return { end: e, at: split(on, s, q, uid) }
		}
	}
	return null
}

/** Merge `src` INTO `dst` when they touch (see the header). Returns false — and changes nothing — when they don't. */
export function joinGraph(dst: G, src: G, tol: number, uid: (p: string) => string): boolean {
	const map = new Map<string, string>()   // src node id → dst node id
	for (const n of src.nodes) { const m = dst.nodes.find((k) => d3(k, n) <= tol); if (m) map.set(n.id, m.id) }
	if (!map.size) {   // a free end on the other's segment (T-junction), either way round
		const a = endOnSegment(src, dst, tol, uid)
		if (a) map.set(a.end.id, a.at.id)
		else { const b = endOnSegment(dst, src, tol, uid); if (!b) return false; map.set(b.at.id, b.end.id) }
	}
	const taken = new Set(dst.nodes.map((n) => n.id))
	for (const n of src.nodes) {
		if (map.has(n.id)) continue
		const id = taken.has(n.id) ? uid('n') : n.id
		map.set(n.id, id); taken.add(id); dst.nodes.push({ ...n, id })
	}
	const segIds = new Set(dst.segments.map((s) => s.id)), pairs = new Set(dst.segments.map((s) => [s.a, s.b].sort().join('|')))
	for (const s of src.segments) {
		const a = map.get(s.a)!, b = map.get(s.b)!, key = [a, b].sort().join('|')
		if (a === b || pairs.has(key)) continue   // collapsed, or already there
		pairs.add(key); dst.segments.push({ ...s, id: segIds.has(s.id) ? uid('s') : s.id, a, b }); segIds.add(s.id)
	}
	return true
}

/** Merge node `drop` into node `keep` of the same graph (its segments re-attach; collapsed / duplicate ones go). */
export function mergeNodes(g: G, keep: string, drop: string): void {
	if (keep === drop) return
	const pairs = new Set<string>()
	g.segments = g.segments.map((s) => ({ ...s, a: s.a === drop ? keep : s.a, b: s.b === drop ? keep : s.b })).filter((s) => {
		const key = [s.a, s.b].sort().join('|'); if (s.a === s.b || pairs.has(key)) return false
		pairs.add(key); return true
	})
	g.nodes = g.nodes.filter((n) => n.id !== drop)
}

/** A new conduit `o` joins the compatible conduits it touches (all of them become one). Returns the object the
 *  run ended up in — an existing one it joined, else `o` itself (the caller then adds `o`). `objects` is mutated:
 *  conduits absorbed into the first one are removed. */
export function joinNewConduit(objects: Obj[], o: Obj, tol: number, uid: (p: string) => string): Obj {
	if (o.type !== 'conduit') return o
	let target: Conduit | null = null
	for (const c of [...objects]) {
		if (c === o || !compatible(c, o)) continue
		if (!target) { if (joinGraph(c as Conduit, o, tol, uid)) target = c as Conduit }
		else if (joinGraph(target, c as Conduit, tol, uid)) objects.splice(objects.indexOf(c), 1)
	}
	return target ?? o
}
