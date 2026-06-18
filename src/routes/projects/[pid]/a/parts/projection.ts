import { BASIS, type Axis, type Dir, type Obj } from './types'

// A projected outline in drawing-plane coords (u right, v up).
export type Shape = { pts: { u: number; v: number }[]; closed: boolean }

type P3 = { x: number; y: number; z: number }

const proj = (dir: Dir, p: P3) => {
	const b = BASIS[dir]
	return { u: b.hs * p[b.h], v: b.vs * p[b.v] }
}

// Footprint vertices of a polygon (n-gon), in the x-y plane at height z.
// Angle offset of π/n makes a 4-gon an axis-aligned square (== cuboid).
export function ngon(x: number, y: number, r: number, edges: number, z: number): P3[] {
	const n = Math.max(3, Math.min(24, Math.round(edges)))
	const out: P3[] = []
	for (let k = 0; k < n; k++) {
		const a = Math.PI / n + (k * 2 * Math.PI) / n
		out.push({ x: x + r * Math.cos(a), y: y + r * Math.sin(a), z })
	}
	return out
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
		const pts: { u: number; v: number }[] = []
		for (const x of [o.x, o.x + o.w])
			for (const y of [o.y, o.y + o.d])
				for (const z of [o.z, o.z + o.h]) pts.push(proj(dir, { x, y, z }))
		return [bboxRect(pts)]
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

// Translate an object along a model axis by `d` mm.
export function moveAlong(o: Obj, a: Axis, d: number) {
	if (o.type === 'wall') {
		if (a === 'z') o.z += d
		else o.pts.forEach((p) => (p[a as 'x' | 'y'] += d))
	} else {
		o[a] += d
	}
}
