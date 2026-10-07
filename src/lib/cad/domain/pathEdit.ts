// Editing a path's graph (walls, runs, lines alike — ADR 0007: one code path for every path). Pure: each returns a
// new shape. Nodes are model points (x, y, z, optional level / attach).
import type { Id } from './types'
import type { Shape, PathNode, PathSeg } from './shapes'
import { newId } from './ids'

type PathGeom = Extract<Shape['geom'], { kind: 'path' }>
const geomOf = (s: Shape): PathGeom => { if (s.geom.kind !== 'path') throw new Error('Not a path'); return s.geom }
const withGeom = (s: Shape, g: PathGeom): Shape => ({ ...s, geom: g })

/** Split a segment at `t` (0..1 from its `a` end): a new node between, two segments for one. Openings stay on the
 *  half they were on is a later refinement; here the segment keeps its section override on both halves. */
export function insertNode(s: Shape, segId: Id, t: number, id: Id = newId()): Shape {
	const g = geomOf(s)
	const seg = g.segs.find((x) => x.id === segId)
	if (!seg) return s
	const a = g.nodes.find((n) => n.id === seg.a)!, b = g.nodes.find((n) => n.id === seg.b)!
	const k = Math.max(0, Math.min(1, t))
	const n: PathNode = { id, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, ...(a.levelId && a.levelId === b.levelId ? { levelId: a.levelId } : {}) }
	const extra = seg.section ? { section: seg.section } : {}
	const segs: PathSeg[] = g.segs.flatMap((x) => (x.id === segId ? [{ id: x.id, a: x.a, b: n.id, ...extra }, { id: newId(), a: n.id, b: x.b, ...extra }] : [x]))
	return withGeom(s, { ...g, nodes: [...g.nodes, n], segs })
}

/** A new branch from an existing node to a new node at `to`. */
export function branchFrom(s: Shape, fromId: Id, to: Omit<PathNode, 'id'>, id: Id = newId()): Shape {
	const g = geomOf(s)
	if (!g.nodes.some((n) => n.id === fromId)) return s
	return withGeom(s, { ...g, nodes: [...g.nodes, { ...to, id }], segs: [...g.segs, { id: newId(), a: fromId, b: id }] })
}

/**
 * Remove a node. A node in the middle of a run (two segments) is HEALED: its two segments become one, so the run
 * stays joined. Any other node takes its segments with it, and nodes left with no segment go too. Returns null when
 * fewer than two nodes would remain (the caller deletes the shape).
 */
export function removeNode(s: Shape, nodeId: Id): Shape | null {
	const g = geomOf(s)
	const touching = g.segs.filter((x) => x.a === nodeId || x.b === nodeId)
	let segs = g.segs.filter((x) => !touching.includes(x))
	if (touching.length === 2) {
		const [p, q] = touching.map((x) => (x.a === nodeId ? x.b : x.a))
		if (p !== q) segs = [...segs, { id: touching[0].id, a: p, b: q, ...(touching[0].section ? { section: touching[0].section } : {}) }]
	}
	const used = new Set(segs.flatMap((x) => [x.a, x.b]))
	const nodes = g.nodes.filter((n) => n.id !== nodeId && used.has(n.id))
	if (nodes.length < 2 || !segs.length) return null
	const openings = s.role?.kind === 'wall' ? { role: { ...s.role, openings: s.role.openings.filter((o) => segs.some((x) => x.id === o.segId)) } } : {}
	return { ...withGeom(s, { ...g, nodes, segs }), ...openings }
}

/**
 * JOIN node `fromId` into node `intoId` (a node dropped on another): `from`'s segments now end at `into`, and `from`
 * goes. A segment between the two collapses and goes (Dave's edge case: A dropped on B when A–B is a segment);
 * two segments left joining the same pair become one. Null when nothing would be left (a single segment).
 */
export function mergeNode(s: Shape, fromId: Id, intoId: Id): Shape | null {
	const g = geomOf(s)
	if (fromId === intoId || !g.nodes.some((n) => n.id === intoId)) return s
	const seen = new Set<string>()
	const segs = g.segs
		.map((x) => ({ ...x, a: x.a === fromId ? intoId : x.a, b: x.b === fromId ? intoId : x.b }))
		.filter((x) => {
			if (x.a === x.b) return false
			const k = [x.a, x.b].sort().join('|')
			if (seen.has(k)) return false
			seen.add(k)
			return true
		})
	if (!segs.length) return null
	const used = new Set(segs.flatMap((x) => [x.a, x.b]))
	const nodes = g.nodes.filter((n) => n.id !== fromId && used.has(n.id))
	const openings = s.role?.kind === 'wall' ? { role: { ...s.role, openings: s.role.openings.filter((o) => segs.some((x) => x.id === o.segId)) } } : {}
	return { ...withGeom(s, { ...g, nodes, segs }), ...openings }
}

/** Two paths can become one when they are the same kind of thing: two trunks, two walls, two lines. */
export function canJoin(a: Shape, b: Shape): boolean {
	if (a.geom.kind !== 'path' || b.geom.kind !== 'path' || a.id === b.id) return false
	const ra = a.role, rb = b.role
	if (!ra || !rb) return !ra && !rb
	if (ra.kind !== rb.kind) return false
	return ra.kind !== 'containment' || rb.kind !== 'containment' || ra.form === rb.form
}

/**
 * JOIN path `b` into path `a` (Dave: a trunk's node dropped on another trunk's node): one shape (a's id, role, label)
 * with both graphs, each `[from, into]` node pair (one node from each run, either way round) merged into `into`.
 * b's segments keep b's section as their own where it differs; a wall's openings come along.
 */
export function joinShapes(a: Shape, b: Shape, pairs: [Id, Id][]): Shape | null {
	const ga = geomOf(a), gb = geomOf(b)
	const own = (x: PathSeg) => (x.section || !b.section || JSON.stringify(b.section) === JSON.stringify(a.section) ? x : { ...x, section: b.section })
	let out: Shape | null = { ...withGeom(a, { ...ga, nodes: [...ga.nodes, ...gb.nodes], segs: [...ga.segs, ...gb.segs.map(own)] }) }
	if (a.role?.kind === 'wall' && b.role?.kind === 'wall') out = { ...out, role: { ...a.role, openings: [...a.role.openings, ...b.role.openings] } }
	for (const [from, into] of pairs) { out = out && mergeNode(out, from, into); if (!out) return null }
	return out
}

/** The path's CONNECTED pieces as shapes: the piece holding the first segment keeps the id, the others get new ids
 *  (a wall's openings go with their segment). One piece = the shape as it is. */
export function pieces(s: Shape): Shape[] {
	const g = geomOf(s)
	const next = new Map<Id, Id[]>()
	for (const x of g.segs) { next.set(x.a, [...(next.get(x.a) ?? []), x.b]); next.set(x.b, [...(next.get(x.b) ?? []), x.a]) }
	const seen = new Set<Id>(), groups: Set<Id>[] = []
	for (const x of g.segs) {
		if (seen.has(x.a)) continue
		const group = new Set<Id>(), todo = [x.a]
		while (todo.length) { const n = todo.pop()!; if (group.has(n)) continue; group.add(n); seen.add(n); todo.push(...(next.get(n) ?? [])) }
		groups.push(group)
	}
	if (groups.length <= 1) return [s]
	return groups.map((group, i) => {
		const segs = g.segs.filter((x) => group.has(x.a))
		const role = s.role?.kind === 'wall' ? { role: { ...s.role, openings: s.role.openings.filter((o) => segs.some((x) => x.id === o.segId)) } } : {}
		return { ...withGeom(s, { ...g, nodes: g.nodes.filter((n) => group.has(n.id)), segs }), ...role, id: i === 0 ? s.id : newId(), ...(i > 0 && s.label ? { label: undefined } : {}) }
	})
}

/** DISCONNECT at a node (Dave: separate the segments joined there): each segment after the first gets its own copy of
 *  the node, then the path splits into its pieces (a run cut in two, a junction in three). */
export function splitAtNode(s: Shape, nodeId: Id): Shape[] {
	const g = geomOf(s), n = g.nodes.find((x) => x.id === nodeId)
	const touching = g.segs.filter((x) => x.a === nodeId || x.b === nodeId)
	if (!n || touching.length < 2) return [s]
	const copies: PathNode[] = []
	const segs = g.segs.map((x) => {
		if (!touching.includes(x) || x === touching[0]) return x
		const c = { ...n, id: newId() }
		copies.push(c)
		return { ...x, a: x.a === nodeId ? c.id : x.a, b: x.b === nodeId ? c.id : x.b }
	})
	return pieces(withGeom(s, { ...g, nodes: [...g.nodes, ...copies], segs }))
}

/** Delete segments: nodes left with none go, and what remains splits into its pieces ([] = nothing left). */
export function removeSegs(s: Shape, segIds: Id[]): Shape[] {
	const g = geomOf(s)
	const segs = g.segs.filter((x) => !segIds.includes(x.id))
	if (!segs.length) return []
	const used = new Set(segs.flatMap((x) => [x.a, x.b]))
	const role = s.role?.kind === 'wall' ? { role: { ...s.role, openings: s.role.openings.filter((o) => segs.some((x) => x.id === o.segId)) } } : {}
	return pieces({ ...withGeom(s, { ...g, nodes: g.nodes.filter((n) => used.has(n.id)), segs }), ...role })
}

/** How many segments meet at each node (1 = an end, 2 = a run, 3+ = a junction). */
export function degree(s: Shape): Map<Id, number> {
	const m = new Map<Id, number>()
	for (const x of geomOf(s).segs) for (const id of [x.a, x.b]) m.set(id, (m.get(id) ?? 0) + 1)
	return m
}

/** Each segment's length (3D, mm) with its end nodes' places in the node list (1-based), and the total — run / wall
 *  Properties' Segments list (backlog "Segment lengths"). A vertical segment (a drop / rise) counts its height. */
export function segmentLengths(s: Shape): { segs: { id: Id; from: number; to: number; len: number; vertical: boolean }[]; total: number } {
	if (s.geom.kind !== 'path') return { segs: [], total: 0 }
	const at = new Map(s.geom.nodes.map((n, i) => [n.id, { n, i: i + 1 }]))
	const segs = s.geom.segs.flatMap((g) => {
		const a = at.get(g.a), b = at.get(g.b)
		if (!a || !b) return []
		const len = Math.hypot(b.n.x - a.n.x, b.n.y - a.n.y, b.n.z - a.n.z)
		return [{ id: g.id, from: a.i, to: b.i, len, vertical: a.n.x === b.n.x && a.n.y === b.n.y && a.n.z !== b.n.z }]
	})
	return { segs, total: segs.reduce((t, x) => t + x.len, 0) }
}
