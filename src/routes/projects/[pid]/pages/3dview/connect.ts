// F6: CONNECTION POINTS — where a conduit end attaches to a box / rack or an outlet (Visio-style × marks). A box
// offers its own points (`Obj.cpts`, offsets from its footprint centre, rotating with it) or, by default, its top
// centre + the midpoints of its four footprint edges; an outlet offers its insertion point. A conduit NODE snapped
// onto one records it (`GNode.conn`) and FOLLOWS it when the box / outlet moves. Connections are plan (x, y) only:
// the node keeps its own height. Pure.
import type { GNode } from './graph'
import type { Obj, Model } from './types'
import type { Ent } from '../ui/geometry'
import { isOutletEnt } from '../store/allocate'

/** A node's attachment: a model object's point (`obj` + `pt`), or an outlet shape (`ent`). */
export type Conn = { obj?: string; ent?: string; pt?: string }
/** A box's user connection point, in its unrotated footprint: `u` / `v` = the fraction of its width / depth from the
 *  left / top edge (0.5 = the middle), so the point stays put when the box is resized. Legacy points are mm offsets
 *  from the centre (`dx` / `dy`) — still read. */
export type CPt = { id: string; u?: number; v?: number; dx?: number; dy?: number }
/** The default points: the centre + the four edge midpoints. */
export const DEFAULT_CPTS: CPt[] = [{ id: 'c', u: 0.5, v: 0.5 }, { id: 'n', u: 0.5, v: 0 }, { id: 'e', u: 1, v: 0.5 }, { id: 's', u: 0.5, v: 1 }, { id: 'w', u: 0, v: 0.5 }]
/** A point's (u, v) on a w × d box (a legacy mm offset converted). */
export function cptUV(p: CPt, w: number, d: number): [number, number] {
	return p.u != null ? [p.u, p.v ?? 0.5] : [0.5 + (p.dx ?? 0) / (w || 1), 0.5 + (p.dy ?? 0) / (d || 1)]
}
/** The (u, v) of a plan point on a box (rotation undone), clamped onto the footprint and rounded to 0.001. */
export function uvAt(o: { x: number; y: number; w: number; d: number; rot?: number }, x: number, y: number): [number, number] {
	const cx = o.x + o.w / 2, cy = o.y + o.d / 2, [lx, ly] = rot(x - cx, y - cy, -(o.rot ?? 0))
	const r = (t: number) => Math.round(Math.max(0, Math.min(1, t)) * 1000) / 1000
	return [r(0.5 + lx / (o.w || 1)), r(0.5 + ly / (o.d || 1))]
}
/** `z0`/`z1` = the box's height range (stacked boxes — a riser room per floor — share plan points; a node attaches
 *  to the one at its own height). */
export type ConnPt = { x: number; y: number; conn: Conn; z0?: number; z1?: number }

const rot = (dx: number, dy: number, deg = 0): [number, number] => {
	if (!deg) return [dx, dy]
	const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
	return [dx * c - dy * s, dx * s + dy * c]
}
/** A box's connection points (plan): its `cpts`, else centre + edge midpoints. Openings / tilted boxes have none. */
export function boxPoints(o: Obj): ConnPt[] {
	if (o.type !== 'prism' || o.open || o.rotX || o.rotY || !o.id) return []
	const cx = o.x + o.w / 2, cy = o.y + o.d / 2
	const pts: CPt[] = o.cpts?.length ? o.cpts : DEFAULT_CPTS
	return pts.map((p) => {
		const [u, v] = cptUV(p, o.w, o.d), [x, y] = rot((u - 0.5) * o.w, (v - 0.5) * o.d, o.rot)
		return { x: cx + x, y: cy + y, conn: { obj: o.id, pt: p.id }, z0: o.z, z1: o.z + o.h }
	})
}
/** Every connection point in the model: boxes (not the conduits themselves) + outlets. */
export function connPoints(m: Pick<Model, 'objects'> & { shapes?: Ent[] }): ConnPt[] {
	const out: ConnPt[] = []
	for (const o of m.objects) out.push(...boxPoints(o))
	for (const e of m.shapes ?? []) if (isOutletEnt(e) && e.a && !e.plane) out.push({ x: e.a[0], y: e.a[1], conn: { ent: e.id } })
	return out
}
/** The connection point within `tol` of (x, y) — the nearest; with a height `z`, a box spanning it (the room on the
 *  node's own floor) beats one above / below — or null. */
export function nearestConn(pts: ConnPt[], x: number, y: number, tol: number, z?: number): ConnPt | null {
	let best: ConnPt | null = null, bd = Infinity
	const miss = (p: ConnPt) => (z == null || p.z0 == null ? 0 : z >= p.z0 && z <= p.z1! ? 0 : 1)
	for (const p of pts) {
		const d = Math.hypot(p.x - x, p.y - y); if (d > tol) continue
		const s = miss(p) * 1e9 + d   // off-height first loses to any on-height one
		if (s < bd) { bd = s; best = p }
	}
	return best
}
const same = (a: Conn, b: Conn) => a.obj === b.obj && a.ent === b.ent && a.pt === b.pt
/** Where a connection is now (null when its box / outlet / point is gone). */
export function connPos(pts: ConnPt[], c: Conn): { x: number; y: number } | null {
	return pts.find((p) => same(p.conn, c)) ?? null
}

/** Snap a node onto the nearest point (records `conn`), or detach it when it is not on one. Returns whether attached. */
export function attachNode(n: GNode, pts: ConnPt[], tol: number): boolean {
	const p = nearestConn(pts, n.x, n.y, tol, n.z)
	if (!p) { if (n.conn) delete n.conn; return false }
	n.x = Math.round(p.x); n.y = Math.round(p.y); n.conn = { ...p.conn }
	return true
}
/** Move every attached conduit node onto its point's CURRENT position (after boxes / outlets moved). Nodes whose
 *  point is gone are detached. Only nodes attached to `changed` (object or shape ids) are touched, if given. */
export function followConnections(m: Pick<Model, 'objects'> & { shapes?: Ent[] }, changed?: Set<string>): number {
	// the attached nodes first — usually none, so an edit / drag pays nothing for the (whole-model) point list
	const nodes: GNode[] = []
	for (const o of m.objects) if (o.type === 'conduit') for (const n of o.nodes) { const c = n.conn; if (c && (!changed || changed.has(c.obj ?? c.ent ?? ''))) nodes.push(n) }
	if (!nodes.length) return 0
	const pts = connPoints(m)
	let moved = 0
	for (const n of nodes) {
		const p = connPos(pts, n.conn!)
		if (!p) { delete n.conn; continue }
		const x = Math.round(p.x), y = Math.round(p.y)
		if (x !== n.x || y !== n.y) { n.x = x; n.y = y; moved++ }
	}
	return moved
}
