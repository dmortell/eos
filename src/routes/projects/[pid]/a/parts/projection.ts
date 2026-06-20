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

// ---- small 3D vector helpers (conduit miters) --------------------------
const vsub = (a: P3, b: P3): P3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const vadd = (a: P3, b: P3): P3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const vscale = (a: P3, s: number): P3 => ({ x: a.x * s, y: a.y * s, z: a.z * s })
const vdot = (a: P3, b: P3) => a.x * b.x + a.y * b.y + a.z * b.z
const vcross = (a: P3, b: P3): P3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const vlen = (a: P3) => Math.hypot(a.x, a.y, a.z)
const vnorm = (a: P3): P3 => { const l = vlen(a) || 1; return vscale(a, 1 / l) }
const AXVEC: Record<Axis, P3> = { x: { x: 1, y: 0, z: 0 }, y: { x: 0, y: 1, z: 0 }, z: { x: 0, y: 0, z: 1 } }
// Rotate v around unit axis k by angle (Rodrigues).
function vrot(v: P3, k: P3, ang: number): P3 {
	const c = Math.cos(ang), s = Math.sin(ang)
	return vadd(vadd(vscale(v, c), vscale(vcross(k, v), s)), vscale(k, vdot(k, v) * (1 - c)))
}

// Orthonormal cross-section frame (e1=w-axis, e2=h-axis) perpendicular to a
// segment direction. Axis-aligned segments use the PERP convention.
function perpFrame(d: P3): { e1: P3; e2: P3 } {
	const ax: Axis = Math.abs(d.x) >= Math.abs(d.y) && Math.abs(d.x) >= Math.abs(d.z) ? 'x' : Math.abs(d.y) >= Math.abs(d.z) ? 'y' : 'z'
	const [pa, pb] = PERP[ax]
	return { e1: AXVEC[pa], e2: AXVEC[pb] }
}

// One cross-section ring per path vertex, mitered at interior joints so
// adjacent segments share a ring (no corner gap). The cross-section frame is
// parallel-transported along the path, so ring vertices correspond 1:1 and the
// tube surface doesn't twist. End vertices get a perpendicular cap ring.
function conduitRings(o: { w: number; h: number; edges: number; path: P3[] }): P3[][] {
	// drop consecutive duplicate points (degenerate zero-length segments)
	const path: P3[] = []
	for (const p of o.path) {
		const last = path[path.length - 1]
		if (!last || last.x !== p.x || last.y !== p.y || last.z !== p.z) path.push(p)
	}
	const S = path.length - 1
	if (S < 1) return []

	const dirs = Array.from({ length: S }, (_, s) => vnorm(vsub(path[s + 1], path[s])))
	const cs = crossSection(o.w, o.h, o.edges)

	// Frames per segment, parallel-transported from the first.
	const frames: { e1: P3; e2: P3 }[] = [perpFrame(dirs[0])]
	for (let s = 1; s < S; s++) {
		const axis = vcross(dirs[s - 1], dirs[s])
		const al = vlen(axis)
		if (al < 1e-6) { frames.push(frames[s - 1]); continue } // collinear
		const k = vscale(axis, 1 / al)
		const ang = Math.acos(Math.max(-1, Math.min(1, vdot(dirs[s - 1], dirs[s]))))
		frames.push({ e1: vrot(frames[s - 1].e1, k, ang), e2: vrot(frames[s - 1].e2, k, ang) })
	}

	// Per-segment 3D offset vectors for each ring vertex.
	const offs = frames.map((f) => cs.map((c) => vadd(vscale(f.e1, c.da), vscale(f.e2, c.db))))

	const rings: P3[][] = []
	rings.push(offs[0].map((off) => vadd(path[0], off))) // start cap (perpendicular)
	for (let k = 1; k < S; k++) {
		const din = dirs[k - 1], dout = dirs[k]
		const m = vnorm(vadd(din, dout)) // miter-plane normal (bisector)
		const denom = vdot(din, m)
		const V = path[k]
		rings.push(offs[k - 1].map((off) => {
			const t = denom !== 0 ? -vdot(off, m) / denom : 0
			return vadd(V, vadd(off, vscale(din, t)))
		}))
	}
	rings.push(offs[S - 1].map((off) => vadd(path[S], off))) // end cap (perpendicular)
	return rings
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

// Default orbit camera: 45° yaw + ~35.26° pitch == the classic isometric view.
export const DEFAULT_YAW = Math.PI / 4
export const DEFAULT_PITCH = Math.atan(1 / Math.SQRT2)

// Orbit camera: yaw around the vertical (z) axis, pitch (elevation, 0=side,
// π/2=top-down), centered on the ground pivot (cx,cy,0). Parallel (orthographic)
// projection: u right, v up, depth into screen.
function cam(p: P3, yaw: number, pitch: number, cx: number, cy: number) {
	const dx = p.x - cx, dy = p.y - cy, dz = p.z
	const cyw = Math.cos(yaw), syw = Math.sin(yaw)
	const x1 = dx * cyw - dy * syw
	const y1 = dx * syw + dy * cyw
	const cp = Math.cos(pitch), sp = Math.sin(pitch)
	return { u: x1, v: y1 * sp + dz * cp, depth: y1 * cp - dz * sp }
}
export const isoR = (p: P3, yaw: number, pitch: number, cx: number, cy: number) => {
	const c = cam(p, yaw, pitch, cx, cy)
	return { u: c.u, v: c.v }
}
// Painter's-algorithm depth: larger = farther (draw first).
export const isoDepthR = (p: P3, yaw: number, pitch: number, cx: number, cy: number) =>
	cam(p, yaw, pitch, cx, cy).depth

// Center of all objects' x-y bounding box (the orbit pivot).
export function xyCenter(objects: Obj[]) {
	let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity
	const ext = (x: number, y: number) => { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y) }
	for (const o of objects) {
		if (o.type === 'prism') { ext(o.x, o.y); ext(o.x + o.w, o.y + o.d) }
		else if (o.type === 'wall') o.pts.forEach((p) => ext(p.x, p.y))
		else o.path.forEach((p) => ext(p.x, p.y))
	}
	if (minx === Infinity) return { cx: 0, cy: 0 }
	return { cx: (minx + maxx) / 2, cy: (miny + maxy) / 2 }
}

type Seg = [P3, P3]
const ringEdges = (ring: P3[]): Seg[] => ring.map((p, i) => [p, ring[(i + 1) % ring.length]])

// 3D wireframe edges of an object (for the isometric view).
function edges3d(o: Obj): Seg[] {
	if (o.type === 'prism') {
		const bot = boxFootprint(o.x, o.y, o.w, o.d, o.edges, o.z)
		const top = boxFootprint(o.x, o.y, o.w, o.d, o.edges, o.z + o.h)
		const segs: Seg[] = [...ringEdges(bot), ...ringEdges(top)]
		for (let i = 0; i < bot.length; i++) segs.push([bot[i], top[i]])
		return segs
	}
	if (o.type === 'wall') {
		const base = o.pts.map((p) => ({ x: p.x, y: p.y, z: o.z }))
		const top = o.pts.map((p) => ({ x: p.x, y: p.y, z: o.z + o.h }))
		const segs: Seg[] = []
		for (let i = 0; i < base.length - 1; i++) { segs.push([base[i], base[i + 1]]); segs.push([top[i], top[i + 1]]) }
		for (let i = 0; i < base.length; i++) segs.push([base[i], top[i]])
		return segs
	}
	// conduit: mitered tube wireframe (one ring per vertex + connectors)
	const rings = conduitRings(o)
	const segs: Seg[] = []
	for (const ring of rings) segs.push(...ringEdges(ring))
	for (let s = 0; s < rings.length - 1; s++)
		for (let i = 0; i < rings[s].length; i++) segs.push([rings[s][i], rings[s + 1][i]])
	return segs
}

// 3D faces of an object (for hidden-line / solid rendering in the iso view).
export type Face = { pts: P3[] }
export function faces3d(o: Obj): Face[] {
	if (o.type === 'prism') {
		const bot = boxFootprint(o.x, o.y, o.w, o.d, o.edges, o.z)
		const top = boxFootprint(o.x, o.y, o.w, o.d, o.edges, o.z + o.h)
		const faces: Face[] = [{ pts: bot }, { pts: [...top].reverse() }]
		for (let i = 0; i < bot.length; i++) { const j = (i + 1) % bot.length; faces.push({ pts: [bot[i], bot[j], top[j], top[i]] }) }
		return faces
	}
	if (o.type === 'wall') {
		const faces: Face[] = []
		for (let i = 0; i < o.pts.length - 1; i++) {
			const a = o.pts[i], b = o.pts[i + 1]
			faces.push({ pts: [
				{ x: a.x, y: a.y, z: o.z }, { x: b.x, y: b.y, z: o.z },
				{ x: b.x, y: b.y, z: o.z + o.h }, { x: a.x, y: a.y, z: o.z + o.h },
			] })
		}
		return faces
	}
	// conduit: mitered tube side faces (ring strips) + end caps
	const rings = conduitRings(o)
	if (!rings.length) return []
	const faces: Face[] = []
	for (let s = 0; s < rings.length - 1; s++) {
		const r1 = rings[s], r2 = rings[s + 1]
		for (let i = 0; i < r1.length; i++) { const j = (i + 1) % r1.length; faces.push({ pts: [r1[i], r1[j], r2[j], r2[i]] }) }
	}
	faces.push({ pts: [...rings[0]].reverse() })
	faces.push({ pts: rings[rings.length - 1] })
	return faces
}

// Project an object to one or more drawing-plane outlines for the direction.
// For iso, `yaw`/`cx`/`cy` orbit the model around the vertical axis.
export function project(o: Obj, dir: Dir, yaw = DEFAULT_YAW, pitch = DEFAULT_PITCH, cx = 0, cy = 0): Shape[] {
	if (dir === 'iso') {
		return edges3d(o).map((s) => ({ closed: false, pts: [isoR(s[0], yaw, pitch, cx, cy), isoR(s[1], yaw, pitch, cx, cy)] }))
	}

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
		const rings = conduitRings(o)
		const shapes: Shape[] = []
		for (let s = 0; s < rings.length - 1; s++) {
			const h = hull([...rings[s], ...rings[s + 1]].map((p) => proj(dir, p)))
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
