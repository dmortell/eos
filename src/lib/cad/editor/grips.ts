// Node grips on a selected path, in the view's coordinates. Nodes that land on the same VIEW point are one grip: in a
// plan that's a vertical stack (dragging it moves the whole drop, so it never leans — ADR 0006); in an elevation the
// two ends of a drop are separate grips (drag one to change the drop's height).
import type { Id, Pt } from '../domain/types'
import type { Shape, PathNode } from '../domain/shapes'
import type { ViewSpace } from '../views/space'
import type { Delta } from './behaviours'

export interface Grip { at: Pt; nodeIds: Id[] }

export function pathGrips(s: Shape, sp?: ViewSpace): Grip[] {
	if (s.geom.kind !== 'path') return []
	const out: Grip[] = []
	for (const n of s.geom.nodes) {
		const at = sp ? sp.fromWorld(n) : { x: n.x, y: n.y }
		const g = out.find((x) => Math.abs(x.at.x - at.x) < 0.5 && Math.abs(x.at.y - at.y) < 0.5)
		if (g) g.nodeIds.push(n.id)
		else out.push({ at, nodeIds: [n.id] })
	}
	return out
}

export function gripAt(grips: Grip[], p: Pt, tol: number): Grip | undefined {
	let best: Grip | undefined, bestD = tol
	for (const g of grips) { const d = Math.hypot(g.at.x - p.x, g.at.y - p.y); if (d <= bestD) { best = g; bestD = d } }
	return best
}

/** The shape with the given nodes moved to plan point `to` (z kept). `attach` set / cleared on them when given. */
export function moveNodes(s: Shape, nodeIds: Id[], to: Pt, attach?: Id | null): Shape {
	if (s.geom.kind !== 'path') return s
	const ids = new Set(nodeIds)
	const nodes = s.geom.nodes.map((n): PathNode => {
		if (!ids.has(n.id)) return n
		const { attach: _old, ...rest } = n
		const keep = attach === undefined ? (n.attach ? { attach: n.attach } : {}) : attach ? { attach } : {}
		return { ...rest, x: to.x, y: to.y, ...keep }
	})
	return { ...s, geom: { ...s.geom, nodes } }
}

/** The shape with the given nodes shifted by a model displacement (an elevation drag: along the view and in z). */
export function moveNodesBy(s: Shape, nodeIds: Id[], d: Delta): Shape {
	if (s.geom.kind !== 'path') return s
	const ids = new Set(nodeIds)
	return { ...s, geom: { ...s.geom, nodes: s.geom.nodes.map((n) => (ids.has(n.id) ? { ...n, x: n.x + d.x, y: n.y + d.y, z: n.z + (d.z ?? 0) } : n)) } }
}
