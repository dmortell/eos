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

/** How many segments meet at each node (1 = an end, 2 = a run, 3+ = a junction). */
export function degree(s: Shape): Map<Id, number> {
	const m = new Map<Id, number>()
	for (const x of geomOf(s).segs) for (const id of [x.a, x.b]) m.set(id, (m.get(id) ?? 0) + 1)
	return m
}
