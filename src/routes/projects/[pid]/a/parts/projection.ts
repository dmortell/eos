import { BASIS, type Axis, type Dir, type Obj } from './types'

// A projected outline in drawing-plane coords (u right, v up).
export type Shape = { pts: { u: number; v: number }[]; closed: boolean }

type P3 = { x: number; y: number; z: number }

const proj = (dir: Dir, p: P3) => {
	const b = BASIS[dir]
	return { u: b.hs * p[b.h], v: b.vs * p[b.v] }
}

const clampEdges = (e: number) => Math.max(3, Math.min(24, Math.round(e)))

// n-gon footprint inscribed in the w×d box [x..x+w]×[y..y+d] at height z.
// Normalized so its bounding box exactly fills the box for any edge count —
// so 4 edges reproduce the rectangle, higher counts fill it like an ellipse.
export function boxFootprint(x: number, y: number, w: number, d: number, edges: number, z: number): P3[] {
	const n = clampEdges(edges)
	const cx = x + w / 2, cy = y + d / 2
	const angs = Array.from({ length: n }, (_, k) => Math.PI / n + (k * 2 * Math.PI) / n)
	const maxc = Math.max(...angs.map((a) => Math.abs(Math.cos(a))))
	const maxs = Math.max(...angs.map((a) => Math.abs(Math.sin(a))))
	return angs.map((a) => ({
		x: cx + (w / 2) * (Math.cos(a) / maxc),
		y: cy + (d / 2) * (Math.sin(a) / maxs),
		z,
	}))
}

// 2D cross-section n-gon offsets inscribed in w×h, normalized like boxFootprint.
function crossSection(w: number, h: number, edges: number) {
	const n = clampEdges(edges)
	const angs = Array.from({ length: n }, (_, k) => Math.PI / n + (k * 2 * Math.PI) / n)
	const maxc = Math.max(...angs.map((a) => Math.abs(Math.cos(a))))
	const maxs = Math.max(...angs.map((a) => Math.abs(Math.sin(a))))
	return angs.map((a) => ({ da: (w / 2) * (Math.cos(a) / maxc), db: (h / 2) * (Math.sin(a) / maxs) }))
}

// Perpendicular axes [w-axis, h-axis] for a segment running along each axis.
const PERP: Record<Axis, [Axis, Axis]> = { x: ['y', 'z'], y: ['x', 'z'], z: ['x', 'y'] }

export function dominantAxis(p1: P3, p2: P3): Axis {
	const dx = Math.abs(p2.x - p1.x), dy = Math.abs(p2.y - p1.y), dz = Math.abs(p2.z - p1.z)
	if (dz >= dx && dz >= dy) return 'z'
	return dy >= dx ? 'y' : 'x'
}

// Convex hull (monotone chain) of 2D points — the silhouette of a swept segment.
function hull(pts: { u: number; v: number }[]) {
	const p = pts.slice().sort((a, b) => a.u - b.u || a.v - b.v)
	if (p.length < 3) return p
	const cross = (o: typeof p[0], a: typeof p[0], b: typeof p[0]) =>
		(a.u - o.u) * (b.v - o.v) - (a.v - o.v) * (b.u - o.u)
	const lo: typeof p = []
	for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q) }
	const up: typeof p = []
	for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q) }
	lo.pop(); up.pop()
	return lo.concat(up)
}

function bboxRect(pts: { u: number; v: number }[]): Shape {
	const us = pts.map((p) => p.u), vs = pts.map((p) => p.v)
	const lo = { u: Math.min(...us), v: Math.min(...vs) }
	const hi = { u: Math.max(...us), v: Math.max(...vs) }
	return {
		closed: true,
		pts: [
			{ u: lo.u, v: lo.v }, { u: hi.u, v: lo.v },
			{ u: hi.u, v: hi.v }, { u: lo.u, v: hi.v },
		],
	}
}

// Project an object to one or more drawing-plane outlines for the direction.
export function project(o: Obj, dir: Dir): Shape[] {
	if (o.type === 'prism') {
		if (dir === 'plan') {
			return [{ closed: true, pts: boxFootprint(o.x, o.y, o.w, o.d, o.edges, o.z).map((p) => proj(dir, p)) }]
		}
		// Elevation: silhouette rectangle of the extruded footprint.
		const all = [
			...boxFootprint(o.x, o.y, o.w, o.d, o.edges, o.z),
			...boxFootprint(o.x, o.y, o.w, o.d, o.edges, o.z + o.h),
		]
		return [bboxRect(all.map((p) => proj(dir, p)))]
	}

	if (o.type === 'conduit') {
		const shapes: Shape[] = []
		const cs = crossSection(o.w, o.h, o.edges)
		for (let i = 0; i < o.path.length - 1; i++) {
			const p1 = o.path[i], p2 = o.path[i + 1]
			const [pa, pb] = PERP[dominantAxis(p1, p2)]
			const verts: { u: number; v: number }[] = []
			for (const end of [p1, p2]) for (const c of cs) {
				const w3: P3 = { x: end.x, y: end.y, z: end.z }
				w3[pa] += c.da; w3[pb] += c.db
				verts.push(proj(dir, w3))
			}
			const h = hull(verts)
			if (h.length >= 2) shapes.push({ closed: true, pts: h })
		}
		return shapes
	}

	// wall
	if (dir === 'plan') {
		return [{ closed: false, pts: o.pts.map((p) => proj(dir, { x: p.x, y: p.y, z: o.z })) }]
	}
	// Elevation: one quad per segment (base z .. z+h).
	const shapes: Shape[] = []
	for (let i = 0; i < o.pts.length - 1; i++) {
		const a = o.pts[i], b = o.pts[i + 1]
		shapes.push({
			closed: true,
			pts: [
				proj(dir, { x: a.x, y: a.y, z: o.z }),
				proj(dir, { x: b.x, y: b.y, z: o.z }),
				proj(dir, { x: b.x, y: b.y, z: o.z + o.h }),
				proj(dir, { x: a.x, y: a.y, z: o.z + o.h }),
			],
		})
	}
	return shapes
}

// ---- Axis accessors (for editing in the projected plane) ---------------
// Object's position/size along a model axis. Prisms size = w/d/h; walls have
// no single box size (handled per-handle), so size returns 0.
export const posAlong = (o: Obj, a: Axis): number => {
	if (o.type === 'prism') return o[a]
	if (o.type === 'wall') return a === 'z' ? o.z : 0
	return o.path[0]?.[a] ?? 0 // conduit
}

export const sizeAlong = (o: Obj, a: Axis): number =>
	o.type === 'prism' ? ({ x: o.w, y: o.d, z: o.h }[a]) : 0

// Snap all coordinates to whole millimetres (real-world units).
export function roundObj(o: Obj) {
	const R = Math.round
	if (o.type === 'wall') {
		o.z = R(o.z); o.h = R(o.h)
		o.pts.forEach((p) => { p.x = R(p.x); p.y = R(p.y) })
	} else if (o.type === 'conduit') {
		o.w = R(o.w); o.h = R(o.h)
		o.path.forEach((p) => { p.x = R(p.x); p.y = R(p.y); p.z = R(p.z) })
	} else {
		o.x = R(o.x); o.y = R(o.y); o.z = R(o.z); o.w = R(o.w); o.h = R(o.h); o.d = R(o.d)
	}
}

// Translate an object along a model axis by `d` mm.
export function moveAlong(o: Obj, a: Axis, d: number) {
	if (o.type === 'wall') {
		if (a === 'z') o.z += d
		else o.pts.forEach((p) => (p[a as 'x' | 'y'] += d))
	} else if (o.type === 'conduit') {
		o.path.forEach((p) => (p[a] += d))
	} else {
		o[a] += d
	}
}
