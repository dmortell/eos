// Editing INSIDE a selected run (Dave, 2026-10-05): its nodes (a click on a grip) and segments (a second click on the
// run), a selected segment dragged whole, the nodes of OTHER runs that sit on the moving ones (they move along: joined
// nodes move together), and two runs joined into one when a node is dropped on the other run's node.
import type { Id, Pt } from '../domain/types'
import type { Shape } from '../domain/shapes'
import type { ViewSpace } from '../views/space'
import { canJoin, joinShapes, removeNode, removeSegs, pieces, splitAtNode } from '../domain/pathEdit'

export interface PathSel { shape: Id; nodes: Id[]; segs: Id[] }

type PathShape = Shape & { geom: Extract<Shape['geom'], { kind: 'path' }> }
const isPath = (s: Shape): s is PathShape => s.geom.kind === 'path'

/** The segment of `s` under view point `p` (within `tol`), as drawn in this view; null = none (or seen end-on). */
export function segAt(s: Shape, sp: ViewSpace, p: Pt, tol: number): Id | null {
	if (!isPath(s)) return null
	const at = new Map(s.geom.nodes.map((n) => [n.id, sp.fromWorld(n)]))
	let best: Id | null = null, bestD = tol
	for (const g of s.geom.segs) {
		const a = at.get(g.a), b = at.get(g.b)
		if (!a || !b) continue
		const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy
		if (L < 1) continue
		const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L))
		const d = Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y)
		if (d <= bestD) { best = g.id; bestD = d }
	}
	return best
}

/** Delete what's picked: nodes go with their two segments joined (healed), segments go and the run splits where it
 *  must. The run's pieces after it ([] = nothing left: delete the run). */
export function deletePicked(s: Shape, sel: PathSel): Shape[] {
	if (!sel.nodes.length) return removeSegs(s, sel.segs)
	let cur: Shape | null = s
	for (const id of sel.nodes) cur = cur && removeNode(cur, id)
	return cur ? pieces(cur) : []
}

/** DISCONNECT at the picked node(s): the segments meeting there separate, the run splitting into its pieces. */
export function disconnectPicked(s: Shape, nodeIds: Id[]): Shape[] {
	let out = [s]
	for (const id of nodeIds) out = out.flatMap((x) => (isPath(x) && x.geom.nodes.some((n) => n.id === id) ? splitAtNode(x, id) : [x]))
	return out
}

/** The end nodes of some segments. */
export function segNodes(s: Shape, segIds: Id[]): Id[] {
	return isPath(s) ? [...new Set(s.geom.segs.filter((g) => segIds.includes(g.id)).flatMap((g) => [g.a, g.b]))] : []
}

/** Nodes of OTHER runs on the same level that sit exactly on the moving nodes (same x / y, same height): they move
 *  along (backlog "Joined nodes move together"). shape id → its node ids. */
export function followersOf(shapes: Shape[], s: Shape, nodeIds: Id[]): Map<Id, Id[]> {
	const out = new Map<Id, Id[]>()
	if (!isPath(s)) return out
	const moving = s.geom.nodes.filter((n) => nodeIds.includes(n.id))
	for (const o of shapes) {
		if (o.id === s.id || !isPath(o) || o.levelId !== s.levelId) continue
		const ids = o.geom.nodes.filter((m) => moving.some((n) => Math.abs(m.x - n.x) < 0.5 && Math.abs(m.y - n.y) < 0.5 && Math.abs(m.z - n.z) < 1)).map((m) => m.id)
		if (ids.length) out.set(o.id, ids)
	}
	return out
}

/** A dragged node (grip) now on a node of ANOTHER run of the same kind (not one moving with it): the two become one
 *  run, `moved`'s id kept. Each dragged node joins the other run's node nearest in height. */
export function joinAcross(moved: Shape, nodeIds: Id[], others: Shape[], sp: ViewSpace): { shape: Shape; absorbed: Id } | null {
	if (!isPath(moved)) return null
	const mine = moved.geom.nodes.filter((n) => nodeIds.includes(n.id))
	if (!mine.length) return null
	const p = sp.fromWorld(mine[0])
	for (const o of others) {
		if (!isPath(o) || o.levelId !== moved.levelId || !canJoin(moved, o)) continue
		const targets = o.geom.nodes.filter((n) => { const q = sp.fromWorld(n); return Math.abs(q.x - p.x) < 0.5 && Math.abs(q.y - p.y) < 0.5 })
		if (!targets.length) continue
		const pairs = mine.map((n): [Id, Id] => [n.id, [...targets].sort((a, b) => Math.abs(a.z - n.z) - Math.abs(b.z - n.z))[0].id])
		const shape = joinShapes(moved, o, pairs)
		if (shape) return { shape, absorbed: o.id }
	}
	return null
}
