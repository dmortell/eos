// BENDS (backlog "Bend radius", G270): a run's corners drawn as arcs. A corner = a node where exactly two segments of
// the run meet, both level (not a riser) and not in a straight line. Its radius: the node's own (`PathNode.radius`, 0 =
// sharp) else the run's default (`ContainmentRole.bendRadius`), cut down so the arc fits — its tangent points stay
// within half of each segment. Pure; tested in bends.test.ts.
import type { Id, Pt } from './types'
import type { Shape, PathNode } from './shapes'
import { isVertical } from './shapes'

export interface Bend {
	node: Id
	/** The radius drawn (after fitting) and the one asked for. */
	r: number
	want: number
	/** Where the arc meets each segment (the first: on the segment towards `from`). */
	t1: Pt
	t2: Pt
	/** The arc from t1 to t2, as points (t1 and t2 included). */
	arc: Pt[]
	/** The corner, the unit bisector into the bend and 1 / sin(half the corner's angle): the arc's middle is
	 *  `r × (k − 1)` from the corner along `dir`. */
	at: Pt
	dir: Pt
	k: number
	/** The largest radius that fits. */
	rMax: number
	/** The two segments (by id) and their far nodes. */
	segs: [Id, Id]
	from: Id
	to: Id
}

const sub = (a: Pt, b: Pt) => ({ x: a.x - b.x, y: a.y - b.y })
const len = (v: Pt) => Math.hypot(v.x, v.y)

/** The run's default corner radius (containment runs; 0 = sharp). */
export const defaultBend = (s: Shape): number => (s.role?.kind === 'containment' ? s.role.bendRadius ?? 0 : 0)

/** Every corner of a path that can bend (radius 0 ones too, for their handles), keyed by node id. */
export function corners(s: Shape): Map<Id, Bend> {
	const out = new Map<Id, Bend>()
	if (s.geom.kind !== 'path') return out
	const nodes = new Map(s.geom.nodes.map((n) => [n.id, n])), def = defaultBend(s)
	const at = new Map<Id, { seg: Id; other: PathNode }[]>()
	for (const g of s.geom.segs) {
		const a = nodes.get(g.a), b = nodes.get(g.b)
		if (!a || !b) continue
		at.set(a.id, [...(at.get(a.id) ?? []), { seg: g.id, other: b }])
		at.set(b.id, [...(at.get(b.id) ?? []), { seg: g.id, other: a }])
	}
	for (const [id, meet] of at) {
		const n = nodes.get(id)!
		if (meet.length !== 2 || meet.some((m) => isVertical(n, m.other) || (m.other.levelId ?? '') !== (n.levelId ?? ''))) continue
		const v1 = sub(meet[0].other, n), v2 = sub(meet[1].other, n), l1 = len(v1), l2 = len(v2)
		if (l1 < 1 || l2 < 1) continue
		const u1 = { x: v1.x / l1, y: v1.y / l1 }, u2 = { x: v2.x / l2, y: v2.y / l2 }
		const cos = Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y)), alpha = Math.acos(cos)   // the corner's inside angle
		if (alpha > (179 * Math.PI) / 180 || alpha < (1 * Math.PI) / 180) continue                 // straight on, or doubled back
		const half = alpha / 2, tanH = Math.tan(half), b = { x: u1.x + u2.x, y: u1.y + u2.y }, bl = len(b)
		const rMax = (Math.min(l1, l2) / 2) * tanH, want = n.radius ?? def, r = Math.max(0, Math.min(want, rMax))
		const t = r / tanH, k = 1 / Math.sin(half), dir = { x: b.x / bl, y: b.y / bl }
		const t1 = { x: n.x + u1.x * t, y: n.y + u1.y * t }, t2 = { x: n.x + u2.x * t, y: n.y + u2.y * t }
		const c = { x: n.x + dir.x * r * k, y: n.y + dir.y * r * k }
		const a1 = Math.atan2(t1.y - c.y, t1.x - c.x), a2 = Math.atan2(t2.y - c.y, t2.x - c.x)
		let da = a2 - a1
		while (da > Math.PI) da -= 2 * Math.PI
		while (da < -Math.PI) da += 2 * Math.PI
		const steps = r > 0 ? Math.max(4, Math.ceil(Math.abs(da) / (Math.PI / 24))) : 0
		const arc = r > 0 ? Array.from({ length: steps + 1 }, (_, i) => ({ x: c.x + r * Math.cos(a1 + (da * i) / steps), y: c.y + r * Math.sin(a1 + (da * i) / steps) })) : []
		out.set(id, { node: id, r, want, t1, t2, arc, at: { x: n.x, y: n.y }, dir, k, rMax, segs: [meet[0].seg, meet[1].seg], from: meet[0].other.id, to: meet[1].other.id })
	}
	return out
}

/** A segment's ends as drawn: pulled back to the tangent points of the bends at them. */
export function trimmedEnds(bends: Map<Id, Bend>, segId: Id, a: PathNode, b: PathNode): [Pt, Pt] {
	const end = (n: PathNode, other: PathNode): Pt => {
		const bd = bends.get(n.id)
		if (!bd || bd.r <= 0) return n
		return bd.segs[0] === segId && bd.from === other.id ? bd.t1 : bd.segs[1] === segId && bd.to === other.id ? bd.t2 : n
	}
	return [end(a, b), end(b, a)]
}
