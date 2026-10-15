// WALLS FROM A ROOM (Dave 2026-10-15, "allow walls to be generated from a room rect"): one closed wall along a room's
// outline, its INSIDE face on the outline (the centreline offset outward by half the thickness), slab to slab by
// default. Pure; the room's Properties › Walls round it makes it (ui/RoomProps.svelte).
import type { Pt, Space } from './types'
import type { Shape } from './shapes'
import { makeWall } from './make'
import { newId } from './ids'

/** The polygon moved out by `d` (its edges parallel, corners where the moved edges meet); either winding. */
export function offsetOutline(pts: Pt[], d: number): Pt[] {
	const n = pts.length
	if (n < 3) return pts
	const area = pts.reduce((s, p, i) => { const q = pts[(i + 1) % n]; return s + p.x * q.y - q.x * p.y }, 0) / 2
	const out = area > 0 ? -1 : 1   // the side the normal (−dy, dx) points to is inside for a positive area (y down or up alike)
	const line = (i: number) => {
		const a = pts[i], b = pts[(i + 1) % n], len = Math.hypot(b.x - a.x, b.y - a.y) || 1
		const nx = (-(b.y - a.y) / len) * out * d, ny = ((b.x - a.x) / len) * out * d
		return { a: { x: a.x + nx, y: a.y + ny }, b: { x: b.x + nx, y: b.y + ny } }
	}
	return pts.map((_, i) => {
		const p = line((i - 1 + n) % n), q = line(i)
		const d1 = { x: p.b.x - p.a.x, y: p.b.y - p.a.y }, d2 = { x: q.b.x - q.a.x, y: q.b.y - q.a.y }
		const den = d1.x * d2.y - d1.y * d2.x
		if (Math.abs(den) < 1e-9) return q.a   // straight on: the moved point
		const t = ((q.a.x - p.a.x) * d2.y - (q.a.y - p.a.y) * d2.x) / den
		return { x: Math.round(p.a.x + d1.x * t), y: Math.round(p.a.y + d1.y * t) }
	})
}

/** One closed wall round the room (null: no outline). */
export function wallsRound(room: Space, thickness = 100, height = 2700, slabToSlab = true): Shape | null {
	const b = room.boundary
	if (!b || b.length < 3) return null
	const w = makeWall(room.levelId, offsetOutline(b, thickness / 2), thickness, height)
	if (w.geom.kind !== 'path' || w.role?.kind !== 'wall') return w
	const ns = w.geom.nodes
	return { ...w, geom: { ...w.geom, segs: [...w.geom.segs, { id: newId(), a: ns[ns.length - 1].id, b: ns[0].id }] }, role: { ...w.role, ...(slabToSlab ? { slabToSlab: true } : {}) } }
}
