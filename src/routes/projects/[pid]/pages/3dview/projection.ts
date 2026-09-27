// Ported verbatim from sheets/tools/model3d (the mature 3D engine) for the Pages 3D model — see model-plan.md.
import type { Axis, Clip, Conduit, Dir, Obj, OClip, Prism, Wall } from './types'
import { runs as graphRuns, nodeMap } from './graph'
import { frameOf, frameOnLine, dotT, dotN, frameShift, rectPts, type ElevDir, type ElevFrame } from '../ui/geometry'

// A projected outline in drawing-plane coords (u right, v up).
export type Shape = { pts: { u: number; v: number }[]; closed: boolean }

type P3 = { x: number; y: number; z: number }

// Decompose a swept primitive's graph into ordered point runs (chains). Each run
// feeds the existing per-path sweep; junctions/profile changes break runs (butt
// joints). A closed run repeats its first point at the end so the sweep closes.
const ptOf = (nm: Map<string, { x: number; y: number; z: number }>, id: string): P3 => { const n = nm.get(id); return n ? { x: n.x, y: n.y, z: n.z } : { x: 0, y: 0, z: 0 } }
// Drop consecutive coincident points so a zero-length segment doesn't produce a
// degenerate (triangular) box or corrupt its neighbour's miter.
const dedupe = (pts: P3[]): P3[] => pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y || p.z !== pts[i - 1].z)

// Profile-aware runs: a run breaks at junctions AND profile changes, so each run
// sweeps with one uniform profile (per-segment overrides fall back to the object
// default). Junctions/profile boundaries butt-join.
function wallRuns(o: Wall): { points: P3[]; thickness: number; h: number }[] {
	if (!o.nodes || !o.segments) return []
	const nm = nodeMap(o.nodes)
	const byId = new Map(o.segments.map((s) => [s.id, s]))
	const key = (id: string) => { const s = byId.get(id); return `${s?.thickness ?? o.thickness}|${s?.h ?? o.h}` }
	return graphRuns(o.nodes, o.segments, key).map((r) => {
		const s0 = byId.get(r.segIds[0])
		return { points: dedupe(r.nodeIds.map((id) => ptOf(nm, id))), thickness: s0?.thickness ?? o.thickness, h: s0?.h ?? o.h }
	}).filter((r) => r.points.length >= 2)
}
// Round a run's corners: at each INTERIOR node with a bend radius, replace the sharp corner with a short
// quadratic-bezier fillet (trimmed along both segments, curving through the corner). Reshapes the path so
// the swept tube rounds in EVERY view. `bends[i]` = node i's effective radius (its own, else the default).
function roundPath(pts: P3[], bends: number[]): P3[] {
	if (pts.length < 3) return pts
	const out: P3[] = [pts[0]]
	for (let i = 1; i < pts.length - 1; i++) {
		const r = bends[i] ?? 0, a = pts[i - 1], c = pts[i], b = pts[i + 1]
		const din = vsub(c, a), dout = vsub(b, c), t = Math.min(r, 0.45 * vlen(din), 0.45 * vlen(dout))
		if (t <= 1e-3) { out.push(c); continue }
		const A = vadd(c, vscale(vnorm(din), -t)), B = vadd(c, vscale(vnorm(dout), t)), N = 6
		for (let k = 0; k <= N; k++) { const u = k / N, w0 = (1 - u) * (1 - u), w1 = 2 * (1 - u) * u, w2 = u * u
			out.push({ x: w0 * A.x + w1 * c.x + w2 * B.x, y: w0 * A.y + w1 * c.y + w2 * B.y, z: w0 * A.z + w1 * c.z + w2 * B.z }) }
	}
	out.push(pts[pts.length - 1])
	return out
}
function conduitRuns(o: Conduit): { points: P3[]; w: number; h: number; edges: number }[] {
	if (!o.nodes || !o.segments) return []
	const nm = nodeMap(o.nodes)
	const byId = new Map(o.segments.map((s) => [s.id, s]))
	const key = (id: string) => { const s = byId.get(id); return `${s?.w ?? o.w}|${s?.h ?? o.h}|${s?.edges ?? o.edges}` }
	return graphRuns(o.nodes, o.segments, key).map((r) => {
		const s0 = byId.get(r.segIds[0])
		const pts = r.nodeIds.map((id) => ptOf(nm, id))
		const bends = r.nodeIds.map((id) => nm.get(id)?.bend ?? o.bend ?? 0)
		return { points: roundPath(pts, bends), w: s0?.w ?? o.w, h: s0?.h ?? o.h, edges: s0?.edges ?? o.edges }
	})
}
// Per-run mitered tube rings for a conduit (rings only connect within a run).
function conduitRunsRings(o: Conduit): P3[][][] {
	return conduitRuns(o).map((run) => conduitRings({ w: run.w, h: run.h, edges: run.edges, path: run.points }))
}
// Per-segment wall boxes across all runs.
function wallRunBoxes(o: Wall, cuts: Cut[] = []) {
	return wallRuns(o).flatMap((run) => wallBoxes({ z: run.points[0]?.z ?? 0, h: run.h, thickness: run.thickness, pts: run.points }, cuts))
}

/** A projection: 'plan' / 'iso' / one of the four ElevDirs, or an explicit elevation VIEW FRAME — an oblique section /
 *  elevation (elevation-section-plan.md phase 2). Everything that projects an elevation (`project`, `viewMap`,
 *  `projectPt`) takes either; an ElevDir is its axis-aligned `frameOf` (so the four views keep their numbers). */
export type ProjDir = Dir | ElevFrame
/** The elevation frame a projection stands for (only meaningful for an elevation: not 'plan' / 'iso'). */
export const projFrame = (d: ProjDir, cx?: number, cy?: number): ElevFrame => (typeof d === 'object' ? d : frameOf(d as ElevDir, cx, cy))
// Plan: (x, y). Elevation: the view frame's origin-free horizontal x·t (= the old BASIS hs · p[h]) and z up.
const proj = (dir: ProjDir, p: P3) => dir === 'plan' ? { u: p.x, v: p.y } : { u: dotT(projFrame(dir), p.x, p.y), v: p.z }
/** One model point in ENGINE coords (u right, v up) for a plan / elevation projection (iso: `isoR`). */
export const projectPt = (dir: ProjDir, p: P3): { u: number; v: number } => proj(dir, p)

const clampEdges = (e: number) => Math.max(3, Math.min(24, Math.round(e)))

// n-gon footprint inscribed in the w×d box [x..x+w]×[y..y+d] at height z.
// Normalized so its bounding box exactly fills the box for any edge count —
// so 4 edges reproduce the rectangle, higher counts fill it like an ellipse.
export function boxFootprint(x: number, y: number, w: number, d: number, edges: number, z: number, rot = 0): P3[] {
	const n = clampEdges(edges)
	const cx = x + w / 2, cy = y + d / 2
	const angs = Array.from({ length: n }, (_, k) => Math.PI / n + (k * 2 * Math.PI) / n)
	const rawX = angs.map((a) => Math.cos(a)), rawY = angs.map((a) => Math.sin(a))
	// Normalise by the polygon's ACTUAL per-axis min/max (translate + scale to the box) — B21: the old
	// max|cos|/max|sin| normalisation only fills the box for a POINT-SYMMETRIC polygon (every vertex has a
	// partner exactly π away — true for an even edge count). An odd n-gon (e.g. a triangle) has no such
	// partner, so dividing by a single max under-fills the opposite side (a 3-gon on a 400-wide box only
	// reached x 0..300). Min/max-normalising fills the box for ANY n, and is numerically identical to the
	// old formula whenever the polygon IS point-symmetric (even n: min = −max on each axis).
	const minX = Math.min(...rawX), maxX = Math.max(...rawX), minY = Math.min(...rawY), maxY = Math.max(...rawY)
	const sx = w / (maxX - minX || 1), sy = d / (maxY - minY || 1)
	const r = (rot * Math.PI) / 180, cr = Math.cos(r), sr = Math.sin(r)
	return angs.map((_, i) => {
		const px = x + (rawX[i] - minX) * sx, py = y + (rawY[i] - minY) * sy
		if (!rot) return { x: px, y: py, z }
		return { x: cx + (px - cx) * cr - (py - cy) * sr, y: cy + (px - cx) * sr + (py - cy) * cr, z } // rotate about z (footprint centre)
	})
}

// Tilt a point about (cx,cy,cz): rotate about the model x-axis by rx°, then the y-axis by ry° (degrees).
// The prism's z-rotation stays folded into boxFootprint's `rot`, so this only adds the out-of-plane tilt.
function tilt(p: P3, cx: number, cy: number, cz: number, rx: number, ry: number): P3 {
	let dx = p.x - cx, dy = p.y - cy, dz = p.z - cz
	if (rx) { const a = (rx * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), ny = dy * c - dz * s, nz = dy * s + dz * c; dy = ny; dz = nz }
	if (ry) { const a = (ry * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), nx = dx * c + dz * s, nz = -dx * s + dz * c; dx = nx; dz = nz }
	return { x: cx + dx, y: cy + dy, z: cz + dz }
}

// Bottom + top rings of a prism as 3D points, with the full rotation applied: z about the vertical
// (via boxFootprint's `rot`), then the x/y tilt about the box centre. Shared by edges3d / faces3d / project
// so the tilt shows in every view. Untilted prisms return the plain flat rings (byte-identical to before).
export function prismRings(o: Prism): { bot: P3[]; top: P3[] } {
	const bot = boxFootprint(o.x, o.y, o.w, o.d, o.edges, o.z, o.rot)
	const top = boxFootprint(o.x, o.y, o.w, o.d, o.edges, o.z + o.h, o.rot)
	const rx = o.rotX ?? 0, ry = o.rotY ?? 0
	if (!rx && !ry) return { bot, top }
	const cx = o.x + o.w / 2, cy = o.y + o.d / 2, cz = o.z + o.h / 2
	return { bot: bot.map((p) => tilt(p, cx, cy, cz, rx, ry)), top: top.map((p) => tilt(p, cx, cy, cz, rx, ry)) }
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
/** A PERSPECTIVE camera for the orbit view: it looks at `at` (the content centre) from `d` mm away. null = parallel
 *  (the classic iso). Points nearer than the camera's near limit are clamped so nothing flips. */
export type Persp = { d: number; at: P3 } | null
/** The perspective camera for a set of objects: aimed at their bounds' centre, 1.6 × their diagonal away. */
export function perspCam(objects: Obj[], visible?: (o: Obj) => boolean): Persp {
	let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity
	for (const o of objects) { if (visible && !visible(o)) continue; const b = objBounds(o); x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); z0 = Math.min(z0, b.z0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); z1 = Math.max(z1, b.z1) }
	if (!isFinite(x0)) return null
	const diag = Math.hypot(x1 - x0, y1 - y0, z1 - z0) || 1000
	return { d: diag * 1.6, at: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 } }
}
function cam(p: P3, yaw: number, pitch: number, cx: number, cy: number, persp: Persp = null) {
	const c = camPar(p, yaw, pitch, cx, cy)
	if (!persp) return c
	const t = camPar(persp.at, yaw, pitch, cx, cy), s = persp.d / Math.max(persp.d * 0.05, persp.d + c.depth - t.depth)
	return { u: t.u + (c.u - t.u) * s, v: t.v + (c.v - t.v) * s, depth: c.depth }
}
function camPar(p: P3, yaw: number, pitch: number, cx: number, cy: number) {
	// Pages plan is y-DOWN (small y = top/back of the plan); model3d's native iso treats +y as up/back,
	// which would place plan-top at the iso FRONT (the two conventions disagree on y). cam is used only
	// by the iso projection, so negate dy here to make iso consistent with Pages' y-down plan (a matching
	// flip — Pages' plan is itself y-flipped from model3d — so the result is a correct, non-mirrored iso).
	const dx = p.x - cx, dy = -(p.y - cy), dz = p.z
	const cyw = Math.cos(yaw), syw = Math.sin(yaw)
	const x1 = dx * cyw - dy * syw
	const y1 = dx * syw + dy * cyw
	const cp = Math.cos(pitch), sp = Math.sin(pitch)
	return { u: x1, v: y1 * sp + dz * cp, depth: y1 * cp - dz * sp }
}
export const isoR = (p: P3, yaw: number, pitch: number, cx: number, cy: number, persp: Persp = null) => {
	const c = cam(p, yaw, pitch, cx, cy, persp)
	return { u: c.u, v: c.v }
}
// Painter's-algorithm depth: larger = farther (draw first).
export const isoDepthR = (p: P3, yaw: number, pitch: number, cx: number, cy: number, persp: Persp = null) =>
	cam(p, yaw, pitch, cx, cy, persp).depth

// ── R7 (review.md §R7): ONE projection path for render and edit ──
// `project()` / `isoR()` produce engine coords (u right, v UP). Pages draws in model mm with y DOWN,
// elevations standing on GROUND and re-centred on the plan centre, iso centred on its own content box.
// That engine→drawing affine used to be written three times (Model3d's group transform, and by hand in
// hit/grips/snap/Viewport with comments promising they "match"). `viewMap` is the one definition: Model3d
// renders through `xform`, everything that picks / grips / snaps goes through `toDraw` / `uvToDraw`.
export type ViewMap = {
	/** Engine (u, v-up) → drawing [x, y-down]. For shapes from `project()` / `isoR()`. */
	uvToDraw(q: { u: number; v: number }): [number, number]
	/** A model point → drawing [x, y] in this view. */
	toDraw(p: P3): [number, number]
	/** The same mapping as an SVG transform, for Model3d's `<g>` around engine coords. */
	xform: string
}
/** The drawing-space mapping of view `dir`. `cx`/`cy` = the plan centre (elevation / iso pivot), `ground` =
 *  the elevation ground line (drawing y of z = 0). Iso also needs the camera (`yaw`/`pitch`) and the content
 *  box it is centred on (`isoBounds(…)`; null = no content → pivot at the centre). An explicit ElevFrame (an oblique
 *  view) carries its own origin — `cx` / `cy` are then unused. */
export function viewMap(dir: ProjDir, cx: number, cy: number, ground: number, yaw = DEFAULT_YAW, pitch = DEFAULT_PITCH,
	isoBox: { icx: number; icy: number } | null = null, persp: Persp = null): ViewMap {
	if (dir === 'plan') return { uvToDraw: (q) => [q.u, q.v], toDraw: (p) => [p.x, p.y], xform: '' }
	if (dir === 'iso') {
		const ix = cx - (isoBox?.icx ?? 0), iy = cy + (isoBox?.icy ?? 0)   // centre the content box on (cx, cy)
		const uvToDraw = (q: { u: number; v: number }): [number, number] => [q.u + ix, iy - q.v]
		return { uvToDraw, toDraw: (p) => uvToDraw(isoR(p, yaw, pitch, cx, cy, persp)), xform: `translate(${ix} ${iy}) scale(1 -1)` }
	}
	const f = projFrame(dir, cx, cy)
	const ox = frameShift(f)   // re-centre the engine horizontal about the frame origin (= geometry.frameU)
	const uvToDraw = (q: { u: number; v: number }): [number, number] => [q.u + ox, ground - q.v]
	return { uvToDraw, toDraw: (p) => uvToDraw({ u: dotT(f, p.x, p.y), v: p.z }), xform: `translate(${ox} ${ground}) scale(1 -1)` }
}

// Axis-aligned model bounds of an object.
export function objBounds(o: Obj): Clip {
	if (o.type === 'prism') return { x0: o.x, x1: o.x + o.w, y0: o.y, y1: o.y + o.d, z0: o.z, z1: o.z + o.h }
	const xs = o.nodes.map((p) => p.x), ys = o.nodes.map((p) => p.y), zs = o.nodes.map((p) => p.z)
	if (o.type === 'wall') return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), z0: Math.min(...zs), z1: Math.max(...zs) + o.h }
	return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), z0: Math.min(...zs), z1: Math.max(...zs) }
}

// Trim an object to a section clip box. Prisms pass through whole (returns null
// if outside). Walls/conduits keep only segments that intersect the box (and the
// nodes they use) — so a section elevation shows just the cut run, not the whole
// perimeter. `h` (wall height) is carried so the z-extent test still works.
const ptIn = (p: P3, c: Clip) => p.x >= c.x0 && p.x <= c.x1 && p.y >= c.y0 && p.y <= c.y1 && p.z >= c.z0 && p.z <= c.z1
function segIn(a: P3, b: P3, c: Clip): boolean {
	if (ptIn(a, c) || ptIn(b, c)) return true
	let t0 = 0, t1 = 1 // slab clip of the 3D segment against the AABB
	for (const k of ['x', 'y', 'z'] as const) {
		const lo = c[`${k}0`] as number, hi = c[`${k}1`] as number, d = b[k] - a[k]
		if (Math.abs(d) < 1e-9) { if (a[k] < lo || a[k] > hi) return false }
		else { let ta = (lo - a[k]) / d, tb = (hi - a[k]) / d; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return false }
	}
	return true
}
// 2D (x,y-only) segment-vs-AABB overlap — the XY half of trimToClip's wall "extruded quad" test (B20).
function segInXY(a: { x: number; y: number }, b: { x: number; y: number }, c: Clip): boolean {
	const inXY = (p: { x: number; y: number }) => p.x >= c.x0 && p.x <= c.x1 && p.y >= c.y0 && p.y <= c.y1
	if (inXY(a) || inXY(b)) return true
	let t0 = 0, t1 = 1
	for (const k of ['x', 'y'] as const) {
		const lo = c[`${k}0`] as number, hi = c[`${k}1`] as number, d = b[k] - a[k]
		if (Math.abs(d) < 1e-9) { if (a[k] < lo || a[k] > hi) return false }
		else { let ta = (lo - a[k]) / d, tb = (hi - a[k]) / d; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return false }
	}
	return true
}
export function trimToClip(o: Obj, c: Clip): Obj | null {
	if (o.type === 'prism') return inClip(o, c) ? o : null
	return trimSegs(o, nodeMap(o.nodes), c)
}
/** The segment trim of `trimToClip`, over node positions `nm` (the model's own, or an OClip's local coords) tested
 *  against the box `c` in the same coords. */
function trimSegs(o: Extract<Obj, { type: 'wall' | 'conduit' }>, nm: Map<string, P3>, c: Clip): Obj | null {
	const top = o.type === 'wall' ? o.h : 0
	const keep = o.segments.filter((s) => {
		const a = nm.get(s.a), b = nm.get(s.b); if (!a || !b) return false
		if (top > 0) {
			// WALL (B20): the segment's z-extruded FACE is a vertical rectangle whose XY footprint is the
			// segment itself and whose z-band doesn't depend on where along the segment you are (a flat
			// wall has a.z === b.z), so the face crosses the clip box iff its XY projection crosses the
			// clip's XY rectangle AND that z-band overlaps [c.z0, c.z1] — this also catches a clip box that
			// sits strictly between the wall's base and top, which probing only the base/top LINES missed.
			// (A sloped wall, a.z !== b.z, over-approximates slightly — safe, only ever adds a match near
			// the sloped ends, never drops a real one.)
			const z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z) + top
			return segInXY(a, b, c) && z1 >= c.z0 && z0 <= c.z1
		}
		return segIn(a, b, c)   // CONDUIT: no extrusion — test the real (possibly z-sloped) 3D segment exactly
	})
	if (!keep.length) return null
	const used = new Set(keep.flatMap((s) => [s.a, s.b]))
	return { ...o, nodes: o.nodes.filter((n) => used.has(n.id)), segments: keep } as Obj
}

// Does an object overlap a clip box? (Order-independent in each axis.)
export function inClip(o: Obj, c: Clip): boolean {
	const b = objBounds(o)
	const ov = (a0: number, a1: number, b0: number, b1: number) =>
		Math.max(a0, a1) >= Math.min(b0, b1) && Math.min(a0, a1) <= Math.max(b0, b1)
	return ov(b.x0, b.x1, c.x0, c.x1) && ov(b.y0, b.y1, c.y0, c.y1) && ov(b.z0, b.z1, c.z0, c.z1)
}

// ── ORIENTED clips (elevation-section-plan.md §3.2 — a section at any angle) ──
// An OClip is a rectangle in plan standing on its cut line a→b, reaching `depth` along the view's look direction n
// (frameOnLine(a, b).n), over z0..z1. Its LOCAL coords: s = (p − a)·t along the line, d = (p − a)·n behind it — the
// clip is then the axis box [0, |b − a|] × [0, depth] × [z0, z1] in (s, d, z), so the oriented trim is today's
// axis trim on transformed nodes (`trimSegs`) and a box's overlap is a separating-axis test. For an axis-aligned
// Clip converted with `oclipOf` (the four dirs) the transform is exact (±1 / 0 components), so the result equals
// `trimToClip` (the elevFrame tests pin it); existing views still call `trimToClip` itself.
/** An axis-aligned Clip seen through view frame `f` → the OClip covering it: the frame-aligned bounds of its four
 *  plan corners, the cut line on the near side (min depth) running along t. For the four dirs it IS the clip (front:
 *  a = (x0, y0) → b = (x1, y0), depth y1 − y0); for an oblique frame, the smallest frame-aligned rect around it. */
export function oclipOf(c: Clip, f: ElevFrame): OClip {
	let s0 = Infinity, s1 = -Infinity, d0 = Infinity, d1 = -Infinity
	for (const [x, y] of rectPts(c.x0, c.y0, c.x1, c.y1)) { const s = dotT(f, x, y), d = dotN(f, x, y); s0 = Math.min(s0, s); s1 = Math.max(s1, s); d0 = Math.min(d0, d); d1 = Math.max(d1, d) }
	const at = (s: number, d: number): [number, number] => [s * f.t[0] + d * f.n[0], s * f.t[1] + d * f.n[1]]   // (s, d) in the origin-free basis → plan
	return { a: at(s0, d0), b: at(s1, d0), depth: d1 - d0, z0: c.z0, z1: c.z1 }
}
/** The view frame an OClip looks through (its cut line's frame), about `o` (default its start a). */
export const oclipFrame = (oc: OClip, o?: [number, number]): ElevFrame => frameOnLine(oc.a, oc.b, o ?? oc.a)
/** The clip's width along its cut line (= the elevation's drawn width). */
export const oclipWidth = (oc: OClip): number => Math.hypot(oc.b[0] - oc.a[0], oc.b[1] - oc.a[1])
/** Plan point → the clip's local (s along the cut line from a, d behind it) — `x` / `y` so the axis helpers take it. */
function oclipLocal(oc: OClip): (x: number, y: number) => { x: number; y: number } {
	const { t, n } = frameOnLine(oc.a, oc.b), ax = oc.a[0], ay = oc.a[1]
	return (x, y) => { const dx = x - ax, dy = y - ay; return { x: dx * t[0] + dy * t[1], y: dx * n[0] + dy * n[1] } }
}
/** The OClip as an axis box in its local coords (a negative depth reaches in front of the line). */
const oclipBox = (oc: OClip): Clip => ({ x0: 0, x1: oclipWidth(oc), y0: Math.min(0, oc.depth), y1: Math.max(0, oc.depth), z0: oc.z0, z1: oc.z1 })
/** Do two convex plan polygons overlap (touching counts)? Separating-axis test over both polygons' edge normals. */
function convexOverlap(A: { x: number; y: number }[], B: { x: number; y: number }[]): boolean {
	for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
		const p = P[i], q = P[(i + 1) % P.length], nx = p.y - q.y, ny = q.x - p.x
		if (!nx && !ny) continue
		let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity
		for (const v of A) { const k = v.x * nx + v.y * ny; a0 = Math.min(a0, k); a1 = Math.max(a1, k) }
		for (const v of B) { const k = v.x * nx + v.y * ny; b0 = Math.min(b0, k); b1 = Math.max(b1, k) }
		if (a1 < b0 || b1 < a0) return false
	}
	return true
}
/** Does an object overlap an oriented clip? A BOX by its true (rotated) footprint rectangle against the clip's rect
 *  (+ the z band) — `inClip` for the four dirs, where the axes coincide; a wall / conduit when any segment is kept. */
export function inOClip(o: Obj, oc: OClip): boolean {
	if (o.type !== 'prism') return trimToOClip(o, oc) !== null
	const b = objBounds(o)
	if (Math.max(b.z0, b.z1) < Math.min(oc.z0, oc.z1) || Math.min(b.z0, b.z1) > Math.max(oc.z0, oc.z1)) return false
	const L = oclipLocal(oc), c = oclipBox(oc), cx = o.x + o.w / 2, cy = o.y + o.d / 2
	const r = ((o.rot ?? 0) * Math.PI) / 180, co = Math.cos(r), si = Math.sin(r)
	const foot = rectPts(o.x, o.y, o.x + o.w, o.y + o.d).map(([x, y]) => (o.rot ? L(cx + (x - cx) * co - (y - cy) * si, cy + (x - cx) * si + (y - cy) * co) : L(x, y)))
	return convexOverlap(foot, rectPts(c.x0, c.y0, c.x1, c.y1).map(([x, y]) => ({ x, y })))
}
/** `trimToClip` for an ORIENTED clip: a box passes whole when it overlaps the clip's rect (`inOClip`); a wall /
 *  conduit keeps the segments that cross it (the same test as the axis trim, on nodes in the clip's local coords). */
export function trimToOClip(o: Obj, oc: OClip): Obj | null {
	if (o.type === 'prism') return inOClip(o, oc) ? o : null
	const L = oclipLocal(oc)
	return trimSegs(o, new Map(o.nodes.map((n) => [n.id, { ...L(n.x, n.y), z: n.z }])), oclipBox(oc))
}

// Full model z-range (for defaulting a section's vertical extent).
export function modelZRange(objects: Obj[]) {
	let z0 = Infinity, z1 = -Infinity
	for (const o of objects) { const b = objBounds(o); z0 = Math.min(z0, b.z0); z1 = Math.max(z1, b.z1) }
	return z0 === Infinity ? { z0: 0, z1: 1000 } : { z0, z1 }
}

// Overall xyz bounds of a model (null if empty).
export function modelBounds(objects: Obj[]): Clip | null {
	let r: Clip | null = null
	for (const o of objects) {
		const b = objBounds(o)
		if (!r) r = { ...b }
		else { r.x0 = Math.min(r.x0, b.x0); r.x1 = Math.max(r.x1, b.x1); r.y0 = Math.min(r.y0, b.y0); r.y1 = Math.max(r.y1, b.y1); r.z0 = Math.min(r.z0, b.z0); r.z1 = Math.max(r.z1, b.z1) }
	}
	return r
}

// Center of all objects' x-y bounding box (the orbit pivot).
export function xyCenter(objects: Obj[]) {
	let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity
	const ext = (x: number, y: number) => { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y) }
	for (const o of objects) {
		if (o.type === 'prism') { ext(o.x, o.y); ext(o.x + o.w, o.y + o.d) }
		else o.nodes.forEach((p) => ext(p.x, p.y))
	}
	if (minx === Infinity) return { cx: 0, cy: 0 }
	return { cx: (minx + maxx) / 2, cy: (miny + maxy) / 2 }
}

type Seg = [P3, P3]
export type Face = { pts: P3[] }
const ringEdges = (ring: P3[]): Seg[] => ring.map((p, i) => [p, ring[(i + 1) % ring.length]])

// Mitred ±t/2 offset points along a wall centerline (one per pts index). At
// interior/closed corners the offset is the bisector intersection, so adjacent
// segments share exact corner points and join cleanly (no overlap).
type V2 = { x: number; y: number }
function wallOffsets(pts: V2[], t: number): { left: V2[]; right: V2[] } {
	const n = pts.length
	const closed = n > 2 && pts[0].x === pts[n - 1].x && pts[0].y === pts[n - 1].y
	const V = closed ? pts.slice(0, n - 1) : pts // unique vertices
	const m = V.length
	const half = t / 2
	const norm = (x: number, y: number) => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l } }
	const dir = (i: number, j: number) => norm(V[j].x - V[i].x, V[j].y - V[i].y)

	const L: V2[] = [], R: V2[] = []
	for (let i = 0; i < m; i++) {
		const din = closed || i > 0 ? dir((i - 1 + m) % m, i) : null
		const dout = closed || i < m - 1 ? dir(i, (i + 1) % m) : null
		let mx: number, my: number, len = half
		if (din && dout) {
			const nIn = { x: -din.y, y: din.x }, nOut = { x: -dout.y, y: dout.x }
			let bx = nIn.x + nOut.x, by = nIn.y + nOut.y
			const bl = Math.hypot(bx, by)
			if (bl < 1e-6) { mx = nIn.x; my = nIn.y } // straight / reversal
			else { bx /= bl; by /= bl; mx = bx; my = by; len = half / Math.max(0.2, bx * nIn.x + by * nIn.y) }
		} else {
			const d = (din ?? dout)!
			mx = -d.y; my = d.x
		}
		L.push({ x: V[i].x + mx * len, y: V[i].y + my * len })
		R.push({ x: V[i].x - mx * len, y: V[i].y - my * len })
	}
	// Re-align to the original pts indices (closed loop repeats vertex 0 at the end).
	const left = pts.map((_, i) => L[i % m])
	const right = pts.map((_, i) => R[i % m])
	return { left, right }
}
// Wireframe edges of a prism (bottom ring + top ring + verticals).
const ringSolidEdges = (bot: P3[], top: P3[]): Seg[] => {
	const segs: Seg[] = [...ringEdges(bot), ...ringEdges(top)]
	for (let i = 0; i < bot.length; i++) segs.push([bot[i], top[i]])
	return segs
}
// Faces of a prism (bottom, top, and one quad per side).
const ringSolidFaces = (bot: P3[], top: P3[]): Face[] => {
	const faces: Face[] = [{ pts: bot }, { pts: [...top].reverse() }]
	for (let i = 0; i < bot.length; i++) { const j = (i + 1) % bot.length; faces.push({ pts: [bot[i], bot[j], top[j], top[i]] }) }
	return faces
}
// Per-segment box rings (bot/top) for a thick wall, with mitred corners.
function wallBoxes(o: { z: number; h: number; thickness: number; pts: V2[] }, cuts: Cut[] = []) {
	const { left, right } = wallOffsets(o.pts, o.thickness)
	const boxes: { bot: P3[]; top: P3[] }[] = []
	const box = (q: V2[], z0: number, z1: number) => { if (z1 - z0 >= 1) boxes.push({ bot: q.map((p) => ({ x: p.x, y: p.y, z: z0 })), top: q.map((p) => ({ x: p.x, y: p.y, z: z1 })) }) }
	for (let i = 0; i < o.pts.length - 1; i++) {
		const q = [left[i], left[i + 1], right[i + 1], right[i]] // mitred segment footprint
		const gaps = cuts.length ? segmentGaps(o.pts[i], o.pts[i + 1], o.thickness / 2, o.z, o.z + o.h, cuts) : []
		if (!gaps.length) { box(q, o.z, o.z + o.h); continue }
		// OPENINGS (after OpenCad's wall builder): the segment becomes solid panels around each hole — full-height
		// jambs between them, a header above and a sill below — so a door / window is a real hole in 3D, its
		// reveals the panels' side faces. A jamb at the segment's own end keeps the mitred corner.
		const P = o.pts[i], Q = o.pts[i + 1], len = Math.hypot(Q.x - P.x, Q.y - P.y) || 1, ux = (Q.x - P.x) / len, uy = (Q.y - P.y) / len
		const perp = (c: V2) => { const dx = c.x - P.x, dy = c.y - P.y, a = dx * ux + dy * uy; return { x: dx - a * ux, y: dy - a * uy } }
		const nl = perp(left[i]), nr = perp(right[i])   // the two faces' offsets from the centreline
		const at = (s: number, side: V2): V2 => ({ x: P.x + ux * s + side.x, y: P.y + uy * s + side.y })
		const quad = (s0: number, s1: number): V2[] => [s0 <= 0 ? left[i] : at(s0, nl), s1 >= len ? left[i + 1] : at(s1, nl), s1 >= len ? right[i + 1] : at(s1, nr), s0 <= 0 ? right[i] : at(s0, nr)]
		let cur = 0
		for (const g of gaps) {
			if (g.s0 > cur) box(quad(cur, g.s0), o.z, o.z + o.h)
			box(quad(g.s0, g.s1), g.z1, o.z + o.h)   // header
			box(quad(g.s0, g.s1), o.z, g.z0)         // sill (a door has none: its z0 is the floor)
			cur = Math.max(cur, g.s1)
		}
		if (cur < len) box(quad(cur, len), o.z, o.z + o.h)
	}
	return boxes
}
/** HOLES IN FURNITURE: a plain upright rectangular box (4 edges, no rotation / tilt) with openings running right
 *  THROUGH it — across its full depth (a hole along x) or full width (along y) — split into solid sub-boxes: full
 *  pieces between the holes, and above / below each (the same panel idea as a wall). E.g. a desk box with the space
 *  between its legs cut out. null = nothing cuts it (draw the box itself). Only the first axis with through-holes is
 *  used; a pocket that doesn't go right through is ignored. */
export function prismPanels(o: Obj, cuts: Cut[]): Prism[] | null {
	if (o.type !== 'prism' || !cuts.length || (o.edges ?? 4) !== 4 || o.rot || o.rotX || o.rotY) return null
	const bb = (c: Cut) => ({ x0: Math.min(...c.pts.map((p) => p.x)), x1: Math.max(...c.pts.map((p) => p.x)), y0: Math.min(...c.pts.map((p) => p.y)), y1: Math.max(...c.pts.map((p) => p.y)) })
	const top = o.z + o.h
	for (const axis of ['x', 'y'] as const) {
		const lo = axis === 'x' ? o.x : o.y, len = axis === 'x' ? o.w : o.d
		const gaps: { s0: number; s1: number; z0: number; z1: number }[] = []
		for (const c of cuts) {
			const b = bb(c), z0 = Math.max(o.z, c.z0), z1 = Math.min(top, c.z1)
			if (z1 - z0 < 1) continue
			const through = axis === 'x' ? b.y0 <= o.y + 0.5 && b.y1 >= o.y + o.d - 0.5 : b.x0 <= o.x + 0.5 && b.x1 >= o.x + o.w - 0.5
			const a0 = (axis === 'x' ? b.x0 : b.y0) - lo, a1 = (axis === 'x' ? b.x1 : b.y1) - lo
			if (!through || a1 <= 0 || a0 >= len) continue
			gaps.push({ s0: Math.max(0, a0), s1: Math.min(len, a1), z0, z1 })
		}
		if (!gaps.length) continue
		gaps.sort((p, q) => p.s0 - q.s0)
		const out: Prism[] = [], part = (s0: number, s1: number, z0: number, z1: number) => {
			if (s1 - s0 < 1 || z1 - z0 < 1) return
			out.push({ ...(o as Prism), ...(axis === 'x' ? { x: o.x + s0, w: s1 - s0 } : { y: o.y + s0, d: s1 - s0 }), z: z0, h: z1 - z0 })
		}
		let cur = 0
		for (const g of gaps) { part(cur, g.s0, o.z, top); part(g.s0, g.s1, g.z1, top); part(g.s0, g.s1, o.z, g.z0); cur = Math.max(cur, g.s1) }
		part(cur, len, o.z, top)
		return out
	}
	return null
}
/** Does this cut cross any wall of `objs`? (An opening that doesn't — e.g. the leg space of a desk — isn't drawn as a
 *  masked wall hole.) */
export function cutsAWall(c: Cut, objs: Obj[]): boolean {
	for (const o of objs) {
		if (o.type !== 'wall') continue
		for (const run of wallRuns(o)) for (let i = 0; i + 1 < run.points.length; i++)
			if (segmentGaps(run.points[i], run.points[i + 1], run.thickness / 2, run.points[i].z ?? 0, (run.points[i].z ?? 0) + run.h, [c]).length) return true
	}
	return false
}
/** A hole an OPENING box cuts (plan footprint corners + its height range). */
export type Cut = { pts: V2[]; z0: number; z1: number }
/** The cuts of the model's opening objects (boxes on an "opening" layer). */
export function openingCuts(objs: Obj[], isOpening: (o: Obj) => boolean): Cut[] {
	const out: Cut[] = []
	for (const o of objs) if (o.type === 'prism' && isOpening(o)) out.push({ pts: boxFootprint(o.x, o.y, o.w, o.d, 4, 0, o.rot), z0: o.z, z1: o.z + o.h })
	return out
}
/** Where cuts cross a wall segment P→Q (half thickness `half`, height z0..z1): each hole's span along the centreline
 *  (s0..s1, clamped to the segment) and its height range (clamped to the wall), sorted along the segment. A cut counts
 *  when its footprint overlaps the wall's band. */
export function segmentGaps(P: V2, Q: V2, half: number, z0: number, z1: number, cuts: Cut[]): { s0: number; s1: number; z0: number; z1: number }[] {
	const len = Math.hypot(Q.x - P.x, Q.y - P.y); if (len < 1) return []
	const ux = (Q.x - P.x) / len, uy = (Q.y - P.y) / len, out: { s0: number; s1: number; z0: number; z1: number }[] = []
	for (const c of cuts) {
		const zz0 = Math.max(z0, c.z0), zz1 = Math.min(z1, c.z1); if (zz1 - zz0 < 1) continue
		let a0 = Infinity, a1 = -Infinity, p0 = Infinity, p1 = -Infinity
		for (const p of c.pts) { const dx = p.x - P.x, dy = p.y - P.y, a = dx * ux + dy * uy, n = -dx * uy + dy * ux; a0 = Math.min(a0, a); a1 = Math.max(a1, a); p0 = Math.min(p0, n); p1 = Math.max(p1, n) }
		if (p1 < -half || p0 > half || a1 <= 0 || a0 >= len) continue
		out.push({ s0: Math.max(0, a0), s1: Math.min(len, a1), z0: zz0, z1: zz1 })
	}
	return out.sort((a, b) => a.s0 - b.s0)
}

// 3D wireframe edges of an object (for the isometric view).
function edges3d(o: Obj): Seg[] {
	if (o.type === 'prism') {
		const { bot, top } = prismRings(o)
		return ringSolidEdges(bot, top)
	}
	if (o.type === 'wall') {
		return wallRunBoxes(o).flatMap((b) => ringSolidEdges(b.bot, b.top))
	}
	// conduit: mitered tube wireframe per run (one ring per vertex + connectors)
	const segs: Seg[] = []
	for (const rings of conduitRunsRings(o)) {
		for (const ring of rings) segs.push(...ringEdges(ring))
		for (let s = 0; s < rings.length - 1; s++)
			for (let i = 0; i < rings[s].length; i++) segs.push([rings[s][i], rings[s + 1][i]])
	}
	return segs
}

// 3D faces of an object (for hidden-line / solid rendering in the iso view).
/** `cuts` = the model's opening holes (openingCuts): a wall is built with them as real holes. */
export function faces3d(o: Obj, cuts: Cut[] = []): Face[] {
	if (o.type === 'prism') {
		const parts = prismPanels(o, cuts); if (parts) return parts.flatMap((p) => faces3d(p))   // holes through a box (a desk's leg space)
		const { bot, top } = prismRings(o)
		return ringSolidFaces(bot, top)
	}
	if (o.type === 'wall') {
		return wallRunBoxes(o, cuts).flatMap((b) => ringSolidFaces(b.bot, b.top))
	}
	// conduit: mitered tube side faces (ring strips) + end caps, per run
	const faces: Face[] = []
	for (const rings of conduitRunsRings(o)) {
		if (!rings.length) continue
		for (let s = 0; s < rings.length - 1; s++) {
			const r1 = rings[s], r2 = rings[s + 1]
			for (let i = 0; i < r1.length; i++) { const j = (i + 1) % r1.length; faces.push({ pts: [r1[i], r1[j], r2[j], r2[i]] }) }
		}
		faces.push({ pts: [...rings[0]].reverse() })
		faces.push({ pts: rings[rings.length - 1] })
	}
	return faces
}

// The ISO view's centring pivot — Model3d centres the oblique model on it, and every hit-test / grip / fit
// reproduces the same projection through it. It is the projection of the content's 3D CENTRE (the centre of the
// visible objects' model bounds), a FIXED point: orbiting turns the model about it without drifting. (It used to
// be the centre of the projected 2D box, which moves as the box's silhouette changes with the angle — the model
// wobbled while orbiting.) `visible` skips hidden-layer objects so the pivot matches what's drawn.
export function isoBounds(objects: Obj[], yaw: number, pitch: number, cx: number, cy: number, visible?: (o: Obj) => boolean, persp: Persp = null) {
	const c = contentCentre(objects, visible); if (!c) return null
	const q = isoR(c, yaw, pitch, cx, cy, persp)
	return { icx: q.u, icy: q.v }
}
/** The centre of the visible objects' 3D model bounds (null = none). */
export function contentCentre(objects: Obj[], visible?: (o: Obj) => boolean): P3 | null {
	let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity
	for (const o of objects) { if (visible && !visible(o)) continue; const b = objBounds(o); x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); z0 = Math.min(z0, b.z0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); z1 = Math.max(z1, b.z1) }
	return isFinite(x0) ? { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 } : null
}
/** ORBIT about a point: the drawing-coord offset (from the iso pivot) of the point `rel` (a drawing offset from the
 *  pivot at yaw0 / pitch0, taken on the pivot's horizontal plane) after the camera turns to yaw1 / pitch1. The caller
 *  pans by the difference so what was at the middle of the view stays there (parallel camera; close enough in
 *  perspective). */
export function orbitShift(rel: [number, number], yaw0: number, pitch0: number, yaw1: number, pitch1: number): [number, number] {
	// drawing offset → engine (u, v up) → the camera-rotated (x1, y1) on the pivot plane → model (dx, dy') → new angles
	const du = rel[0], dv = -rel[1], sp0 = Math.sin(pitch0) || 1e-6
	const x1 = du, y1 = dv / sp0
	const c0 = Math.cos(yaw0), s0 = Math.sin(yaw0), dx = x1 * c0 + y1 * s0, dy = -x1 * s0 + y1 * c0
	const c1 = Math.cos(yaw1), s1 = Math.sin(yaw1), nx1 = dx * c1 - dy * s1, ny1 = dx * s1 + dy * c1
	return [nx1, -(ny1 * Math.sin(pitch1))]
}

// Door swing geometry in the PLAN (model x/y): the hinge at one JAMB on the wall centreline, the unit
// vector along the wall toward the far jamb (u), the unit vector the leaf swings toward (v, perpendicular
// into the room), and the door width L (= radius). `flip` picks the hinge side. Shared by the Model3d
// render (leaf + arc) and the Viewport swing grip so they never disagree. The leaf tip at angle a is
// `hinge + L·(cos a·u + sin a·v)` — a=0 closed (along the wall), a=90° open (perpendicular).
export function doorGeom(o: Prism) {
	const alongX = o.w >= o.d, s = o.flip ? -1 : 1
	if (alongX) return { hx: o.flip ? o.x + o.w : o.x, hy: o.y + o.d / 2, ux: s, uy: 0, vx: 0, vy: -1, L: o.w }
	return { hx: o.x + o.w / 2, hy: o.flip ? o.y + o.d : o.y, ux: 0, uy: s, vx: -1, vy: 0, L: o.d }
}

// Project an object to one or more drawing-plane outlines for the direction.
// For iso, `yaw`/`cx`/`cy` orbit the model around the vertical axis.
/** A RACK in plan, like OpenCad's: its footprint, an X corner to corner, and a FRONT line (60 % of the width) just
 *  outside the front face — the −y side of the unrotated box, the face the Front elevation sees — RACK_FRONT_GAP mm
 *  off it (OpenCad puts it ⅛ of the depth out; Dave: closer). Rotates with the rack. Plan points (x, y, z). */
export const RACK_FRONT_GAP = 40
export function rackPlan(o: Extract<Obj, { type: 'prism' }>): { closed: boolean; pts: P3[] }[] {
	const cx = o.x + o.w / 2, cy = o.y + o.d / 2, a = ((o.rot ?? 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
	const at = (u: number, v: number): P3 => ({ x: cx + u * c - v * s, y: cy + u * s + v * c, z: o.z })   // box-local (u across, v back) → plan
	const hw = o.w / 2, hd = o.d / 2, fy = -hd - RACK_FRONT_GAP
	return [
		{ closed: true, pts: [at(-hw, -hd), at(hw, -hd), at(hw, hd), at(-hw, hd)] },
		{ closed: false, pts: [at(-hw, -hd), at(hw, hd)] },
		{ closed: false, pts: [at(hw, -hd), at(-hw, hd)] },
		{ closed: false, pts: [at(-o.w * 0.3, fy), at(o.w * 0.3, fy)] },
	]
}

/** `dir` may be an explicit ElevFrame (an oblique elevation): the same outlines, through its t. A vertical prism / wall
 *  box still stands as an upright rectangle (its silhouette's u-range × z-range), whatever the angle. */
export function project(o: Obj, dir: ProjDir, yaw = DEFAULT_YAW, pitch = DEFAULT_PITCH, cx = 0, cy = 0, persp: Persp = null): Shape[] {
	if (dir === 'iso') {
		return edges3d(o).map((s) => ({ closed: false, pts: [isoR(s[0], yaw, pitch, cx, cy, persp), isoR(s[1], yaw, pitch, cx, cy, persp)] }))
	}

	if (o.type === 'prism') {
		const tilted = (o.rotX ?? 0) !== 0 || (o.rotY ?? 0) !== 0
		if (dir === 'plan') {
			if (!tilted && o.rack) return rackPlan(o).map((s) => ({ ...s, pts: s.pts.map((p) => proj(dir, p)) }))
			if (!tilted) return [{ closed: true, pts: boxFootprint(o.x, o.y, o.w, o.d, o.edges, o.z, o.rot).map((p) => proj(dir, p)) }]
			// Tilted: outline (convex hull) of all projected corners — the silhouette from above.
			const { bot, top } = prismRings(o)
			return [{ closed: true, pts: hull([...bot, ...top].map((p) => proj(dir, p))) }]
		}
		// Elevation: silhouette of the extruded footprint — an axis-aligned rectangle when upright,
		// the projected-corner hull when tilted (so the leaning box reads as a leaning silhouette).
		if (!tilted) {
			const all = [
				...boxFootprint(o.x, o.y, o.w, o.d, o.edges, o.z, o.rot),
				...boxFootprint(o.x, o.y, o.w, o.d, o.edges, o.z + o.h, o.rot),
			]
			return [bboxRect(all.map((p) => proj(dir, p)))]
		}
		const { bot, top } = prismRings(o)
		return [{ closed: true, pts: hull([...bot, ...top].map((p) => proj(dir, p))) }]
	}

	if (o.type === 'conduit') {
		const shapes: Shape[] = []
		for (const rings of conduitRunsRings(o)) {
			for (let s = 0; s < rings.length - 1; s++) {
				const h = hull([...rings[s], ...rings[s + 1]].map((p) => proj(dir, p)))
				if (h.length >= 2) shapes.push({ closed: true, pts: h })
			}
		}
		return shapes
	}

	// wall (thick): one box per segment across all runs.
	return wallRunBoxes(o).map((b) =>
		dir === 'plan'
			? { closed: true, pts: b.bot.map((p) => proj(dir, p)) }
			: bboxRect([...b.bot, ...b.top].map((p) => proj(dir, p))),
	)
}

// ---- Axis accessors (for editing in the projected plane) ---------------
// Object's position/size along a model axis. Prisms size = w/d/h; walls have
// no single box size (handled per-handle), so size returns 0.
export const posAlong = (o: Obj, a: Axis): number => {
	if (o.type === 'prism') return o[a]
	if (o.type === 'wall') return a === 'z' ? (o.nodes[0]?.z ?? 0) : 0
	return o.nodes[0]?.[a] ?? 0 // conduit
}

export const sizeAlong = (o: Obj, a: Axis): number =>
	o.type === 'prism' ? ({ x: o.w, y: o.d, z: o.h }[a]) : 0

// Snap all coordinates to whole millimetres (real-world units).
export function roundObj(o: Obj) {
	const R = Math.round
	if (o.type === 'wall') {
		o.h = R(o.h); o.thickness = R(o.thickness)
		o.nodes.forEach((p) => { p.x = R(p.x); p.y = R(p.y); p.z = R(p.z) })
	} else if (o.type === 'conduit') {
		o.w = R(o.w); o.h = R(o.h)
		o.nodes.forEach((p) => { p.x = R(p.x); p.y = R(p.y); p.z = R(p.z) })
	} else {
		o.x = R(o.x); o.y = R(o.y); o.z = R(o.z); o.w = R(o.w); o.h = R(o.h); o.d = R(o.d)
	}
}

// Translate an object along a model axis by `d` mm.
export function moveAlong(o: Obj, a: Axis, d: number) {
	if (o.type === 'wall' || o.type === 'conduit') {
		o.nodes.forEach((p) => (p[a] += d))
	} else {
		o[a] += d
	}
}
