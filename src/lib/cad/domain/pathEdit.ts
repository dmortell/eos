// Editing a path's graph (walls, runs, lines alike — ADR 0007: one code path for every path). Pure: each returns a
// new shape. Nodes are model points (x, y, z, optional level / attach).
import type { Id, Pt } from './types'
import type { Shape, PathNode, PathSeg, ContainmentRole, HandCables } from './shapes'
import type { Entity } from './drawing'
import { newId } from './ids'
import { viaList, viaValue } from './routing'

type PathGeom = Extract<Shape['geom'], { kind: 'path' }>
const geomOf = (s: Shape): PathGeom => { if (s.geom.kind !== 'path') throw new Error('Not a path'); return s.geom }
const withGeom = (s: Shape, g: PathGeom): Shape => ({ ...s, geom: g })

/** Split a segment at `t` (0..1 from its `a` end): a new node between, two segments for one (the first keeps the
 *  segment's id). Both halves keep its section override and the hand cables tied to it. Openings stay on the half
 *  they were on is a later refinement. What names the segment from outside: `splitSegRefs`. */
export function insertNode(s: Shape, segId: Id, t: number, id: Id = newId()): Shape {
	const g = geomOf(s)
	const seg = g.segs.find((x) => x.id === segId)
	if (!seg) return s
	const a = g.nodes.find((n) => n.id === seg.a)!, b = g.nodes.find((n) => n.id === seg.b)!
	const k = Math.max(0, Math.min(1, t))
	const n: PathNode = { id, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, ...(a.levelId && a.levelId === b.levelId ? { levelId: a.levelId } : {}) }
	const extra = seg.section ? { section: seg.section } : {}, second = newId()
	const segs: PathSeg[] = g.segs.flatMap((x) => (x.id === segId ? [{ id: x.id, a: x.a, b: n.id, ...extra }, { id: second, a: n.id, b: x.b, ...extra }] : [x]))
	const role = s.role?.kind === 'containment' && s.role.extra?.some((h) => h.seg === segId)
		? { role: { ...s.role, extra: s.role.extra.flatMap((h) => (h.seg === segId ? [h, { ...h, seg: second }] : [h])) } } : {}
	return { ...withGeom(s, { ...g, nodes: [...g.nodes, n], segs }), ...role }
}

/** After segments of run `before` were split (`after`; the first half keeps the id): a penetration accepted on a split
 *  segment names the half it lies on — the original or a new segment on the same line, whichever its centre is
 *  nearer. The changed penetrations, to put in the same transaction. */
export function splitSegRefs(all: Iterable<Entity>, before: Shape, after: Shape): Entity[] {
	if (before.geom.kind !== 'path' || after.geom.kind !== 'path') return []
	const old = new Set(before.geom.segs.map((x) => x.id)), fresh = after.geom.segs.filter((x) => !old.has(x.id))
	if (!fresh.length) return []
	const at = new Map(after.geom.nodes.map((n) => [n.id, n])), was = new Map(before.geom.nodes.map((n) => [n.id, n]))
	const dist = (p: Pt, a: Pt, b: Pt) => { const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0; return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y) }
	const onLine = (p: Pt, a: Pt, b: Pt) => { const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy); return L > 0 && Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / L < 1 }
	const out: Entity[] = []
	for (const e of all) {
		if (e.type !== 'shape' || e.role?.kind !== 'penetration' || e.role.source?.run !== before.id) continue
		const src = e.role.source, orig = before.geom.segs.find((x) => x.id === src.seg)
		const c = e.geom.kind === 'circle' || e.geom.kind === 'rect' || e.geom.kind === 'ellipse' ? e.geom.centre : null
		if (!orig || !c) continue
		const oa = was.get(orig.a), ob = was.get(orig.b)
		if (!oa || !ob) continue
		let best = src.seg, bestD = Infinity
		for (const x of [after.geom.segs.find((q) => q.id === src.seg)!, ...fresh]) {
			const a = at.get(x?.a ?? ''), b = at.get(x?.b ?? '')
			if (!a || !b || !onLine(a, oa, ob) || !onLine(b, oa, ob)) continue
			const d = dist(c, a, b)
			if (d < bestD) { best = x.id; bestD = d }
		}
		if (best !== src.seg) out.push({ ...e, role: { ...e.role, source: { ...src, seg: best } } })
	}
	return out
}

/** Containment runs on `levelId` with a segment passing THROUGH one of `ends` (plan within 0.5 mm, height within 1 mm,
 *  not at its ends): each gets a node exactly there, so a run drawn from / to the middle of another one's segment joins
 *  it — the junction then moves both (backlog "More snaps": was "Join runs on draw"). Returns the changed runs. */
export function splitRunsAt(shapes: Shape[], levelId: Id, ends: { x: number; y: number; z: number }[]): Shape[] {
	const out: Shape[] = []
	for (const s of shapes) {
		if (s.levelId !== levelId || s.role?.kind !== 'containment' || s.geom.kind !== 'path') continue
		let cur: Shape = s
		for (const p of ends) {
			const g = geomOf(cur), byId = new Map(g.nodes.map((n) => [n.id, n]))
			if (g.nodes.some((n) => !n.levelId && Math.abs(n.x - p.x) < 0.5 && Math.abs(n.y - p.y) < 0.5 && Math.abs(n.z - p.z) < 1)) continue
			const seg = g.segs.find((q) => {
				const a = byId.get(q.a), b = byId.get(q.b)
				if (!a || !b || a.levelId || b.levelId) return false
				const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy
				if (!L2) return false
				const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2
				return t > 0 && t < 1 && Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y) < 0.5 && Math.abs(a.z + (b.z - a.z) * t - p.z) < 1
			})
			if (!seg) continue
			const id = newId(), next = insertNode(cur, seg.id, 0.5, id), split = geomOf(next)
			cur = withGeom(next, { ...split, nodes: split.nodes.map((n) => (n.id === id ? { ...n, x: p.x, y: p.y, z: p.z } : n)) })
		}
		if (cur !== s) out.push(cur)
	}
	return out
}

/** The height of the containment run on `levelId` whose segment or node lies under plan point `p` (within 0.5 mm) —
 *  the one nearest `z` when several do; null = none. A run drawn to it at another height drops / rises to it. */
export function runZAt(shapes: Shape[], levelId: Id, p: { x: number; y: number }, z: number): number | null {
	let best: number | null = null
	for (const s of shapes) {
		if (s.levelId !== levelId || s.role?.kind !== 'containment' || s.geom.kind !== 'path') continue
		const byId = new Map(s.geom.nodes.map((n) => [n.id, n]))
		for (const q of s.geom.segs) {
			const a = byId.get(q.a), b = byId.get(q.b)
			if (!a || !b || a.levelId || b.levelId) continue
			const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy
			const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0
			if (Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y) >= 0.5 || (!L2 && a.z !== b.z)) continue   // (a drop: its ends are nodes)
			const h = Math.round(a.z + (b.z - a.z) * t)
			if (best === null || Math.abs(h - z) < Math.abs(best - z)) best = h
		}
	}
	return best
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

/** Joining on a PLAN: the node pairs must be at the same height — runs at different heights are joined by hand in an
 *  elevation (Dave 2026-10-12, Review 2 Q7: a plan join merged a low run into a high one and lost its tier).
 *  Null = fine; else the message to show. */
export function joinHeightProblem(a: Shape, b: Shape, pairs: [Id, Id][]): string | null {
	const at = (id: Id) => (geomOf(a).nodes.find((n) => n.id === id) ?? geomOf(b).nodes.find((n) => n.id === id))?.z
	for (const [x, y] of pairs) {
		const zx = at(x), zy = at(y)
		if (zx != null && zy != null && Math.abs(zx - zy) > 1) return `Not joined: the runs are at different heights (Z ${Math.round(zx)} / ${Math.round(zy)}) — join them in an elevation view`
	}
	return null
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
 * b's segments keep b's section as their own where it differs; a wall's openings come along; a run's data merges
 * (`joinRole`). What names b is re-pointed by the caller (`repointRefs`, same transaction).
 */
export function joinShapes(a: Shape, b: Shape, pairs: [Id, Id][]): Shape | null {
	const ga = geomOf(a), gb = geomOf(b)
	const own = (x: PathSeg) => (x.section || !b.section || JSON.stringify(b.section) === JSON.stringify(a.section) ? x : { ...x, section: b.section })
	// b's corners keep b's bend radius where the runs differ (a node's own radius wins over the run's)
	const ra = a.role?.kind === 'containment' ? a.role.bendRadius ?? 0 : 0, rb = b.role?.kind === 'containment' ? b.role.bendRadius ?? 0 : 0
	const bNodes = ra === rb ? gb.nodes : gb.nodes.map((n) => (n.radius != null ? n : { ...n, radius: rb }))
	let out: Shape | null = { ...withGeom(a, { ...ga, nodes: [...ga.nodes, ...bNodes], segs: [...ga.segs, ...gb.segs.map(own)] }), ...(a.label || !b.label ? {} : { label: b.label }) }
	if (a.role?.kind === 'wall' && b.role?.kind === 'wall') out = { ...out, role: { ...a.role, openings: [...a.role.openings, ...b.role.openings] } }
	if (a.role?.kind === 'containment' && b.role?.kind === 'containment') out = { ...out, role: joinRole(a.role, b.role, ga.segs.map((x) => x.id), gb.segs.map((x) => x.id)) }
	for (const [from, into] of pairs) { out = out && mergeNode(out, from, into); if (!out) return null }
	return dropStaleExtra(out)
}

/** Two runs' data as one: hand cables (each run's "every segment" ones tied to its own segments unless both runs had
 *  the same), the server rooms either may serve (either open to any = any), primary if either was. The tier stays a's
 *  (a run has one). */
function joinRole(a: ContainmentRole, b: ContainmentRole, aSegs: Id[], bSegs: Id[]): ContainmentRole {
	const all = (r: ContainmentRole) => (r.extra ?? []).filter((h) => !h.seg)
	const same = JSON.stringify(all(a)) === JSON.stringify(all(b))
	const scoped = (r: ContainmentRole, segs: Id[]): HandCables[] => (r.extra ?? []).flatMap((h) => (h.seg || same ? [h] : segs.map((seg) => ({ ...h, seg }))))
	const extra = [...scoped(a, aSegs), ...scoped(b, bSegs).filter((h) => !(same && !h.seg))]
	const serves = a.serves?.length && b.serves?.length ? [...new Set([...a.serves, ...b.serves])] : undefined
	const { extra: _e, serves: _s, ...rest } = a
	return { ...rest, ...(extra.length ? { extra } : {}), ...(serves ? { serves } : {}), ...(a.primary || b.primary ? { primary: true } : {}) }
}

/** Hand cables tied to a segment the run no longer has (collapsed by a join, or in another piece) go. */
function dropStaleExtra(s: Shape): Shape {
	if (s.role?.kind !== 'containment' || !s.role.extra?.some((h) => h.seg) || s.geom.kind !== 'path') return s
	const segs = new Set(s.geom.segs.map((x) => x.id)), extra = s.role.extra.filter((h) => !h.seg || segs.has(h.seg))
	if (extra.length === s.role.extra.length) return s
	const { extra: _e, ...role } = s.role
	return { ...s, role: extra.length ? { ...role, extra } : role }
}

/**
 * What names run `from` re-pointed (a join absorbed it, or it split into pieces): cables' chosen runs, path nodes and
 * leaders attached to it, outlets and shapes hosted on it, an accepted penetration's source, a fill-section viewport.
 * `to(seg)` = the new id, given the segment the reference names when it names one (else undefined); return `from`
 * to leave it. The changed entities, to put in the same transaction.
 */
export function repointRefs(all: Iterable<Entity>, from: Id, to: (seg?: Id) => Id): Entity[] {
	const out: Entity[] = []
	for (const e of all) {
		if (e.id === from) continue
		if (e.type === 'link') {
			const via = viaList(e)
			if (via.includes(from) && to() !== from) out.push({ ...e, via: viaValue(via.map((v) => (v === from ? to() : v))) })
		} else if (e.type === 'outlet') {
			if (e.hostShapeId === from && to() !== from) out.push({ ...e, hostShapeId: to() })
		} else if (e.type === 'sheet') {
			const hit = e.viewports.some((v) => v.view.spec.kind === 'fill' && v.view.spec.shapeId === from)
			if (hit) out.push({ ...e, viewports: e.viewports.map((v) => (v.view.spec.kind === 'fill' && v.view.spec.shapeId === from ? { ...v, view: { ...v.view, spec: { ...v.view.spec, shapeId: to(v.view.spec.segId) } } } : v)) })
		} else if (e.type === 'shape') {
			let s: Shape = e
			if (s.hostId === from) s = { ...s, hostId: to() }
			if (s.geom.kind === 'path' && s.geom.nodes.some((n) => n.attach === from)) s = { ...s, geom: { ...s.geom, nodes: s.geom.nodes.map((n) => (n.attach === from ? { ...n, attach: to() } : n)) } }
			if (s.geom.kind === 'leader' && s.geom.attach === from) s = { ...s, geom: { ...s.geom, attach: to() } }
			if (s.role?.kind === 'penetration' && s.role.source?.run === from) s = { ...s, role: { ...s.role, source: { ...s.role.source, run: to(s.role.source.seg) } } }
			if (s !== e && JSON.stringify(s) !== JSON.stringify(e)) out.push(s)
		}
	}
	return out
}

/** The path's CONNECTED pieces as shapes: the piece holding the first segment keeps the id, the others get new ids
 *  (a wall's openings and a run's hand cables go with their segment). One piece = the shape as it is. What names a
 *  segment of a new piece is re-pointed by the caller (`pieceRefs`). */
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
		return dropStaleExtra({ ...withGeom(s, { ...g, nodes: g.nodes.filter((n) => group.has(n.id)), segs }), ...role, id: i === 0 ? s.id : newId(), ...(i > 0 && s.label ? { label: undefined } : {}) })
	})
}

/** What names run `s` by one of its segments (a penetration, a fill-section viewport) re-pointed to the piece now
 *  holding that segment, after `s` split into `out` (pieces / deletes / disconnects). */
export function pieceRefs(all: Iterable<Entity>, s: Shape, out: Shape[]): Entity[] {
	if (out.length < 2 && out[0]?.id === s.id) return []
	const owner = new Map<Id, Id>()
	for (const p of out) if (p.geom.kind === 'path') for (const x of p.geom.segs) owner.set(x.id, p.id)
	return repointRefs(all, s.id, (seg) => (seg && owner.get(seg)) || s.id)
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

/** COPY some segments (backlog "Copy one segment of a run": Ctrl-drag picked segments) as new runs of the same kind —
 *  section, role, layer, style kept; new ids throughout; a wall's openings on them come along; nodes no longer attached
 *  to anything and no label (they're the original's). Disconnected segments give one run each. */
export function copySegs(s: Shape, segIds: Id[]): Shape[] {
	const g = geomOf(s), segs = g.segs.filter((x) => segIds.includes(x.id))
	if (!segs.length) return []
	const nid = new Map<Id, Id>(), sid = new Map<Id, Id>()
	for (const x of segs) { for (const n of [x.a, x.b]) if (!nid.has(n)) nid.set(n, newId()); sid.set(x.id, newId()) }
	const nodes = g.nodes.filter((n) => nid.has(n.id)).map((n) => { const { attach: _a, ...rest } = n; return { ...rest, id: nid.get(n.id)! } })
	const role = s.role?.kind === 'wall' ? { role: { ...s.role, openings: s.role.openings.filter((o) => sid.has(o.segId)).map((o) => ({ ...o, id: newId(), segId: sid.get(o.segId)! })) } } : {}
	const copy: Shape = { ...withGeom(s, { ...g, nodes, segs: segs.map((x) => ({ ...x, id: sid.get(x.id)!, a: nid.get(x.a)!, b: nid.get(x.b)! })) }), ...role, id: newId() }
	delete copy.label
	delete copy.groupId
	return pieces(copy)
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
