// OPENINGS (Phase 6.1): holes in walls — a door or a window is a hole (Dave) with a width, a Z (its bottom above FFL),
// an H (its height) and an optional swing. Hosted on one wall segment at a distance `at` along it, so they move with
// the wall. Pure geometry for the plan (wall pieces around the holes, jambs, the door leaf + arc) and for elevations
// (the hole's outline); tested in openings.test.ts.
import type { Pt, Level } from './types'
import { heightsOf } from './floors'
import type { Opening, Shape, PathNode } from './shapes'
import { newId } from './ids'

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const along = (a: Pt, t: Pt, d: number): Pt => ({ x: a.x + t.x * d, y: a.y + t.y * d })

/** A wall segment's ends, length, direction `t` and normal `n` (plan). */
export function segEnds(s: Shape, segId: string): { a: PathNode; b: PathNode; len: number; t: Pt; n: Pt } | null {
	if (s.geom.kind !== 'path') return null
	const sg = s.geom.segs.find((x) => x.id === segId)
	const a = s.geom.nodes.find((x) => x.id === sg?.a), b = s.geom.nodes.find((x) => x.id === sg?.b)
	if (!a || !b) return null
	const d = sub(b, a), len = Math.hypot(d.x, d.y)
	if (len < 1) return null
	const t = { x: d.x / len, y: d.y / len }
	return { a, b, len, t, n: { x: -t.y, y: t.x } }
}

/** Where a click at `p` puts an opening `width` wide on a wall: the nearest segment within reach (half the wall's
 *  thickness + `tol`), centred on the click but kept inside the segment. */
export function placeOpening(s: Shape, p: Pt, width: number, tol: number): { segId: string; at: number } | null {
	if (s.geom.kind !== 'path' || s.role?.kind !== 'wall') return null
	let best: { segId: string; at: number; d: number } | null = null
	for (const sg of s.geom.segs) {
		const e = segEnds(s, sg.id)
		if (!e) continue
		const w = (sg.section ?? s.section)?.w ?? 100
		const q = sub(p, e.a), at = q.x * e.t.x + q.y * e.t.y, d = Math.abs(q.x * e.n.x + q.y * e.n.y)
		if (at < -tol || at > e.len + tol || d > w / 2 + tol) continue
		if (!best || d < best.d) best = { segId: sg.id, at: Math.min(Math.max(at, width / 2), e.len - width / 2), d }
	}
	return best && width <= (segEnds(s, best.segId)?.len ?? 0) ? { segId: best.segId, at: best.at } : null
}

export const makeOpening = (segId: string, at: number, o: { width: number; z: number; h: number; swing?: Opening['swing'] }): Opening =>
	({ id: newId(), segId, at, width: o.width, z: o.z, h: o.h, ...(o.swing ? { swing: o.swing } : {}) })

/** The solid parts of a wall segment (0 → len, mm) around its openings. */
export function wallPieces(len: number, openings: Opening[]): [number, number][] {
	const holes = openings.map((o) => [Math.max(0, o.at - o.width / 2), Math.min(len, o.at + o.width / 2)] as const).sort((x, y) => x[0] - y[0])
	const out: [number, number][] = []
	let from = 0
	for (const [h0, h1] of holes) { if (h0 > from) out.push([from, h0]); from = Math.max(from, h1) }
	if (from < len) out.push([from, len])
	return out
}

/** Plan prims of a wall segment with openings: its solid pieces (as bands), each opening's jambs, and a door's leaf +
 *  quarter arc (from the hinge jamb, on the swing face). Points in plan mm. */
export function planOpenings(s: Shape, segId: string, w: number): { pieces: [Pt, Pt][]; jambs: [Pt, Pt][]; swings: Pt[][]; holes: { id: string; a: Pt; b: Pt }[] } {
	const e = segEnds(s, segId), ops = s.role?.kind === 'wall' ? s.role.openings.filter((o) => o.segId === segId) : []
	if (!e) return { pieces: [], jambs: [], swings: [], holes: [] }
	// each hole's centreline (what a click on the gap picks)
	const holes = ops.map((o) => ({ id: o.id, a: along(e.a, e.t, o.at - o.width / 2), b: along(e.a, e.t, o.at + o.width / 2) }))
	const pieces = wallPieces(e.len, ops).map(([p0, p1]) => [along(e.a, e.t, p0), along(e.a, e.t, p1)] as [Pt, Pt])
	const jambs: [Pt, Pt][] = [], swings: Pt[][] = []
	for (const o of ops) {
		for (const d of [o.at - o.width / 2, o.at + o.width / 2]) {
			const c = along(e.a, e.t, d)
			jambs.push([along(c, e.n, -w / 2), along(c, e.n, w / 2)])
		}
		if (!o.swing) continue
		const side = o.flip ? -1 : 1, dir = o.swing === 'left' ? 1 : -1
		const hingeAt = o.at - (dir * o.width) / 2
		const hinge = along(along(e.a, e.t, hingeAt), e.n, (side * w) / 2)
		const open = along(hinge, e.n, side * o.width)   // the leaf, swung 90°
		const arc = Array.from({ length: 13 }, (_, i) => {
			const a = ((i / 12) * Math.PI) / 2   // from the open leaf back to the closed position
			return { x: hinge.x + (e.n.x * side * Math.cos(a) + e.t.x * dir * Math.sin(a)) * o.width, y: hinge.y + (e.n.y * side * Math.cos(a) + e.t.y * dir * Math.sin(a)) * o.width }
		})
		swings.push([hinge, open], arc)
	}
	return { pieces, jambs, swings, holes }
}

/** A SLAB-TO-SLAB wall's height range above its level's FFL (Dave: walls round IDF / UPS rooms go full height): from
 *  the structural slab under the raised floor to the underside of the slab above. Undefined for an ordinary wall. */
export function wallSpan(ix: { get(id: string | undefined): unknown }, s: Shape): { z0: number; z1: number } | undefined {
	if (s.role?.kind !== 'wall' || !s.role.slabToSlab) return undefined
	const l = ix.get(s.levelId) as { type?: string; heights?: { raisedFloorMm: number; clearHeightMm: number; plenumMm: number } } | undefined
	const h = heightsOf(l?.type === 'level' ? (l as Pick<Level, 'heights'>) : undefined)
	return { z0: -h.raisedFloorMm, z1: h.clearHeightMm + h.plenumMm }
}

/** An opening's four corners in 3D (plan x / y, z above FFL) — for elevations. */
export function openingCorners(s: Shape, o: Opening): { x: number; y: number; z: number }[] {
	const e = segEnds(s, o.segId)
	if (!e) return []
	const p0 = along(e.a, e.t, o.at - o.width / 2), p1 = along(e.a, e.t, o.at + o.width / 2)
	return [{ ...p0, z: o.z }, { ...p1, z: o.z }, { ...p1, z: o.z + o.h }, { ...p0, z: o.z + o.h }]
}
