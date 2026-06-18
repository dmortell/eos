import { BASIS, type Axis, type Dir, type Obj } from './types'

// A projected outline in drawing-plane coords (u right, v up).
export type Shape = { pts: { u: number; v: number }[]; closed: boolean }

type P3 = { x: number; y: number; z: number }

const proj = (dir: Dir, p: P3) => {
	const b = BASIS[dir]
	return { u: b.hs * p[b.h], v: b.vs * p[b.v] }
}

const clampEdges = (e: number) => Math.max(3, Math.min(24, Math.round(e)))

// Footprint vertices of a polygon (n-gon), in the x-y plane at height z.
// Angle offset of π/n makes a 4-gon an axis-aligned square (== cuboid).
export function ngon(x: number, y: number, r: number, edges: number, z: number): P3[] {
	const n = clampEdges(edges)
	const out: P3[] = []
	for (let k = 0; k < n; k++) {
		const a = Math.PI / n + (k * 2 * Math.PI) / n
		out.push({ x: x + r * Math.cos(a), y: y + r * Math.sin(a), z })
	}
	return out
}

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
	if (o.type === 'cuboid') {
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

	if (o.type === 'polygon') {
		if (dir === 'plan') {
			return [{ closed: true, pts: ngon(o.x, o.y, o.r, o.edges, o.z).map((p) => proj(dir, p)) }]
		}
		// Elevation: silhouette rectangle (projected footprint width × height).
		const all = [...ngon(o.x, o.y, o.r, o.edges, o.z), ...ngon(o.x, o.y, o.r, o.edges, o.z + o.h)]
		return [bboxRect(all.map((p) => proj(dir, p)))]
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
// Object's position/size along a model axis. Cuboids size = w/d/h; others
// have no single box size (handled per-handle), so size returns 0.
export const posAlong = (o: Obj, a: Axis): number =>
	o.type === 'wall' ? (a === 'z' ? o.z : 0) : (o[a] as number)

export const sizeAlong = (o: Obj, a: Axis): number =>
	o.type === 'cuboid' ? ({ x: o.w, y: o.d, z: o.h }[a]) : 0

// Snap all coordinates to whole millimetres (real-world units).
export function roundObj(o: Obj) {
	const R = Math.round
	if (o.type === 'wall') {
		o.z = R(o.z); o.h = R(o.h)
		o.pts.forEach((p) => { p.x = R(p.x); p.y = R(p.y) })
	} else if (o.type === 'cuboid') {
		o.x = R(o.x); o.y = R(o.y); o.z = R(o.z); o.w = R(o.w); o.h = R(o.h); o.d = R(o.d)
	} else {
		o.x = R(o.x); o.y = R(o.y); o.z = R(o.z); o.r = R(o.r); o.h = R(o.h)
	}
}

// Translate an object along a model axis by `d` mm.
export function moveAlong(o: Obj, a: Axis, d: number) {
	if (o.type === 'wall') {
		if (a === 'z') o.z += d
		else o.pts.forEach((p) => (p[a as 'x' | 'y'] += d))
	} else {
		o[a] += d
	}
}
