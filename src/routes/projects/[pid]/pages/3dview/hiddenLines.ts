// HIDDEN LINES in elevations / sections (elevation-section-plan.md phase 6, Dave: "objects BEHIND walls are properly
// hidden unless seen through holes"). Exact, not painted: every object's 3D faces (walls already cut into panels around
// their openings — `faces3d(o, cuts)` → wallBoxes / segmentGaps, a box split round a hole through it — prismPanels) are
// taken into the view's own coords (u = x·t along the drawing, v = z up, d = x·n away from the viewer — any ElevFrame,
// the four dirs or an oblique one), their EDGES reduced to the lines a drawing shows, and each line clipped by every
// nearer face it passes behind. What is left is a set of 2D segments — the same for the viewport (Model3d) and the DXF.
//
// Which edges draw (per object): edges of its faces are grouped by the 3D line they lie on and split where the covering
// faces change. On a stretch, faces that share a plane on BOTH sides of the line are one continuous surface (the seam
// between a door's header panel and its jamb — no line); two coplanar faces on the SAME side are touching boxes' inner
// faces (none either). The surfaces left: one → an open edge (drawn); two → drawn if they fold by more than 30° (a
// box's corner), or the view sees them fold over (a silhouette — a round pipe's outline), else a smooth facet seam
// (not drawn); three or more → drawn.
//
// Hiding: a point is hidden by a face when it projects inside the face's drawn polygon (its outline counts — so a back
// edge right behind a front edge doesn't draw twice) and lies more than 1 mm behind the face's plane there. Each
// face / segment pair gives one interval of the segment (all constraints are linear along it); the union of them is cut
// out. Faces seen edge-on hide nothing. A uniform grid over the drawing buckets the faces, so a segment only meets the
// faces around it.
import type { Obj } from './types'
import { faces3d, objBounds, type Cut } from './projection'
import { dotT, dotN, type ElevFrame } from '../ui/geometry'

/** Does a view with this OClip look along −n of its frame? (a negative depth: the clip lies behind the line's normal) */
export const lookNegOf = (oc: { depth: number } | null | undefined): boolean => !!oc && oc.depth < 0

/** A point in the view's coords: [u along the drawing (engine x·t), v = z up, d = x·n away from the viewer]. */
type V3 = [number, number, number]
/** A visible segment in ENGINE coords (u, v up — what `project()` gives; viewMap turns it into drawing coords). */
export type HLSeg = [number, number, number, number]
/** Per input object: its visible segments + its non-edge-on faces as drawn polygons (a paper fill that keeps an
 *  underlay from showing through the model, like the old painted hidden-line render). */
export type HLObj = { segs: HLSeg[]; fills: { u: number; v: number }[][] }

const EPS_IN = 0.5          // mm: a point this close outside a face's outline still counts as behind it
const EPS_D = 1             // mm: …and must be this much farther than the face to be hidden
const CREASE = Math.cos(Math.PI / 6)   // faces folding by more than 30° draw their shared edge
const MIN_LEN = 1           // mm: shorter visible pieces are dropped (slivers where a back edge meets the outline)

type Face = {
	obj: number; p: V3[]; n: V3   // unit normal (view coords)
	edgeOn: boolean
	u0: number; u1: number; v0: number; v1: number; dmin: number
	hp: [number, number, number][]   // inside ⇔ mu·u + mv·v ≥ c (outline tolerance folded into c)
	dz: [number, number, number]     // the plane's depth: d = a·u + b·v + c
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

function mkFace(obj: number, p: V3[]): Face | null {
	if (p.length < 3) return null
	let nx = 0, ny = 0, nz = 0   // Newell normal; nz = 2 × the signed area drawn (u, v)
	for (let i = 0; i < p.length; i++) {
		const a = p[i], b = p[(i + 1) % p.length]
		nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1])
	}
	const L = Math.hypot(nx, ny, nz); if (L < 1e-9) return null
	const n: V3 = [nx / L, ny / L, nz / L]
	let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, dmin = Infinity
	for (const q of p) { u0 = Math.min(u0, q[0]); u1 = Math.max(u1, q[0]); v0 = Math.min(v0, q[1]); v1 = Math.max(v1, q[1]); dmin = Math.min(dmin, q[2]) }
	const edgeOn = Math.abs(nz) < 2 || Math.abs(n[2]) < 1e-6
	const hp: [number, number, number][] = []
	let dz: [number, number, number] = [0, 0, 0]
	if (!edgeOn) {
		const s = nz > 0 ? 1 : -1   // CCW (nz > 0): inside is to the left of each edge
		for (let i = 0; i < p.length; i++) {
			const a = p[i], b = p[(i + 1) % p.length], eu = b[0] - a[0], ev = b[1] - a[1], el = Math.hypot(eu, ev)
			if (el < 1e-9) continue
			const mu = (-ev / el) * s, mv = (eu / el) * s
			hp.push([mu, mv, mu * a[0] + mv * a[1] - EPS_IN])
		}
		const q = p[0]   // n·(X − q) = 0 → d = q.d − (n.u (u − q.u) + n.v (v − q.v)) / n.d
		dz = [-n[0] / n[2], -n[1] / n[2], q[2] + (n[0] * q[0] + n[1] * q[1]) / n[2]]
	}
	return { obj, p, n, edgeOn, u0, u1, v0, v1, dmin, hp, dz }
}

/** The lines one object draws (see the header): 3D segments in view coords. */
function objectEdges(fs: Face[]): [V3, V3][] {
	type It = { s0: number; s1: number; f: Face }
	const groups = new Map<string, { D: V3; P0: V3; items: It[] }>()
	const r6 = (x: number) => Math.round(x * 1e6), rh = (x: number) => Math.round(x * 2)
	for (const f of fs) for (let i = 0; i < f.p.length; i++) {
		const a = f.p[i], b = f.p[(i + 1) % f.p.length], d = sub(b, a), len = Math.hypot(...d)
		if (len < 0.01) continue
		let D: V3 = [d[0] / len, d[1] / len, d[2] / len]
		const lead = Math.abs(D[0]) > 1e-6 ? D[0] : Math.abs(D[1]) > 1e-6 ? D[1] : D[2]
		if (lead < 0) D = [-D[0], -D[1], -D[2]]
		const sa = dot(a, D), sb = dot(b, D), P0: V3 = [a[0] - sa * D[0], a[1] - sa * D[1], a[2] - sa * D[2]]
		const key = `${r6(D[0])},${r6(D[1])},${r6(D[2])}|${rh(P0[0])},${rh(P0[1])},${rh(P0[2])}`
		let g = groups.get(key); if (!g) groups.set(key, (g = { D, P0, items: [] }))
		g.items.push({ s0: Math.min(sa, sb), s1: Math.max(sa, sb), f })
	}
	const out: [V3, V3][] = []
	for (const { D, P0, items } of groups.values()) {
		if (Math.hypot(D[0], D[1]) < 1e-9) continue   // a line straight along the look: it draws as a point
		const bs = [...new Set(items.flatMap((it) => [it.s0, it.s1]))].sort((x, y) => x - y)
		const at = (s: number): V3 => [P0[0] + s * D[0], P0[1] + s * D[1], P0[2] + s * D[2]]
		let run: number | null = null, runEnd = 0
		for (let k = 0; k + 1 < bs.length; k++) {
			const lo = bs[k], hi = bs[k + 1]; if (hi - lo < 0.01) continue
			const m = (lo + hi) / 2, cov = items.filter((it) => it.s0 <= m && it.s1 >= m).map((it) => it.f)
			if (drawsEdge(cov, D, at(m))) { if (run === null || lo - runEnd > 0.01) { if (run !== null) out.push([at(run), at(runEnd)]); run = lo } runEnd = hi }
			else if (run !== null) { out.push([at(run), at(runEnd)]); run = null }
		}
		if (run !== null) out.push([at(run), at(runEnd)])
	}
	return out
}

/** Does a stretch of line (direction D through X) covered by faces `cov` draw? (the header's rule) */
function drawsEdge(cov: Face[], D: V3, X: V3): boolean {
	if (cov.length === 1) return true
	// coplanar classes (every face contains the line, so parallel normals = one plane), each face on one side of it
	const cls: { n: V3; q: V3; pos: Face[]; neg: Face[] }[] = []
	for (const f of cov) {
		let c = cls.find((k) => Math.abs(dot(k.n, f.n)) > 1 - 1e-6)
		if (!c) cls.push((c = { n: f.n, q: cross(f.n, D), pos: [], neg: [] }))
		let best = 0; for (const p of f.p) { const s = dot(sub(p, X), c.q); if (Math.abs(s) > Math.abs(best)) best = s }
		;(best >= 0 ? c.pos : c.neg).push(f)
	}
	const surf: Face[] = []
	for (const c of cls) if (c.pos.length + c.neg.length === 1) surf.push(c.pos[0] ?? c.neg[0])   // both sides = continuous; 2+ on one side = inner faces
	if (surf.length !== 2) return surf.length > 0
	const [f1, f2] = surf
	if (f1.edgeOn || f2.edgeOn || Math.abs(dot(f1.n, f2.n)) < CREASE) return true
	// a smooth fold: drawn only where the view sees both faces on one side of it (a silhouette)
	const side = (f: Face) => { let best = 0; for (const p of f.p) { const s = D[0] * (p[1] - X[1]) - D[1] * (p[0] - X[0]); if (Math.abs(s) > Math.abs(best)) best = s }; return Math.sign(best) }
	return side(f1) === side(f2)
}

/** Hidden-line segments of `objs` (already trimmed to the view's clip, openings left out) seen through frame `f`;
 *  `cuts` = the model's opening holes (openingCuts), so walls are panels with real holes. One result per object.
 *  `lookNeg`: the viewer looks along −n, not +n — a section line's / elevation marker's view (its OClip has a NEGATIVE
 *  depth: the region lies on the −n side of the cut line, `lookNegOf`); nearer then means a LARGER x·n. */
export function hiddenLines(objs: Obj[], f: ElevFrame, cuts: Cut[] = [], lookNeg = false): HLObj[] {
	const sd = lookNeg ? -1 : 1
	const P = (p: { x: number; y: number; z: number }): V3 => [dotT(f, p.x, p.y), p.z, sd * dotN(f, p.x, p.y)]
	// each object gets only the cuts near it (faces3d tests every cut against every panel / box — the bulk of the time)
	const cb = cuts.map((c) => { let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const p of c.pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y) } return { c, x0, x1, y0, y1 } })
	const near = (o: Obj): Cut[] => {
		if (!cb.length) return cuts
		const b = objBounds(o), pad = o.type === 'wall' ? Math.max(o.thickness, ...o.segments.map((s) => s.thickness ?? 0)) : 0   // (a wall's bounds are its centreline's)
		return cb.filter((k) => k.x1 >= b.x0 - pad && k.x0 <= b.x1 + pad && k.y1 >= b.y0 - pad && k.y0 <= b.y1 + pad).map((k) => k.c)
	}
	const perObj: Face[][] = objs.map((o, i) => faces3d(o, near(o)).map((fc) => mkFace(i, fc.pts.map(P))).filter((x): x is Face => !!x))
	const occ = perObj.flat().filter((x) => !x.edgeOn).sort((p, q) => p.dmin - q.dmin)   // nearest first: a line hidden whole stops early
	// a uniform grid over the occluders' drawn extent, cells about square (≈ 2 faces a cell)
	let U0 = Infinity, U1 = -Infinity, W0 = Infinity, W1 = -Infinity
	for (const x of occ) { U0 = Math.min(U0, x.u0); U1 = Math.max(U1, x.u1); W0 = Math.min(W0, x.v0); W1 = Math.max(W1, x.v1) }
	const nc = Math.max(1, occ.length / 2), asp = (U1 - U0) / (W1 - W0 || 1) || 1
	const GU = Math.max(1, Math.min(256, Math.round(Math.sqrt(nc * asp)))), GV = Math.max(1, Math.min(256, Math.round(nc / GU)))
	const cu = (U1 - U0) / GU || 1, cv = (W1 - W0) / GV || 1
	const cellU = (x: number) => Math.max(0, Math.min(GU - 1, Math.floor((x - U0) / cu))), cellV = (x: number) => Math.max(0, Math.min(GV - 1, Math.floor((x - W0) / cv)))
	const grid: number[][] = Array.from({ length: GU * GV }, () => [])
	occ.forEach((x, k) => { for (let i = cellU(x.u0 - EPS_IN); i <= cellU(x.u1 + EPS_IN); i++) for (let j = cellV(x.v0 - EPS_IN); j <= cellV(x.v1 + EPS_IN); j++) grid[i * GV + j].push(k) })
	const stamp = new Int32Array(occ.length).fill(-1)
	let seq = 0

	const visible = (A: V3, B: V3): [number, number][] => {
		const du = B[0] - A[0], dv = B[1] - A[1], dd = B[2] - A[2], len = Math.hypot(du, dv)
		if (len < MIN_LEN) return []
		const su0 = Math.min(A[0], B[0]), su1 = Math.max(A[0], B[0]), sv0 = Math.min(A[1], B[1]), sv1 = Math.max(A[1], B[1]), sd1 = Math.max(A[2], B[2])
		const hid: [number, number][] = [], id = seq++
		if (occ.length && su1 >= U0 - EPS_IN && su0 <= U1 + EPS_IN && sv1 >= W0 - EPS_IN && sv0 <= W1 + EPS_IN)
			for (let i = cellU(su0); i <= cellU(su1); i++) for (let j = cellV(sv0); j <= cellV(sv1); j++) for (const k of grid[i * GV + j]) {
				if (stamp[k] === id) continue; stamp[k] = id
				const F = occ[k]
				if (F.u1 < su0 - EPS_IN || F.u0 > su1 + EPS_IN || F.v1 < sv0 - EPS_IN || F.v0 > sv1 + EPS_IN || F.dmin >= sd1 - EPS_D) continue
				let lo = 0, hi = 1
				const cut = (f0: number, f1: number) => {   // keep s where f0 + s·f1 ≥ 0
					if (Math.abs(f1) < 1e-12) { if (f0 < 0) hi = -1; return }
					const r = -f0 / f1; if (f1 > 0) lo = Math.max(lo, r); else hi = Math.min(hi, r)
				}
				for (const [mu, mv, c] of F.hp) { cut(mu * A[0] + mv * A[1] - c, mu * du + mv * dv); if (lo >= hi) break }
				if (lo >= hi) continue
				// behind the plane: d(s) − plane(s) > EPS_D + the plane's rise over the outline tolerance (so the plane
				// extended into that ½ mm band doesn't clip the end of a line meeting the face at a corner)
				const [a, b, c] = F.dz, slack = EPS_D + EPS_IN * Math.hypot(a, b)
				cut(A[2] - (a * A[0] + b * A[1] + c) - slack, dd - (a * du + b * dv))
				if (hi - lo > 1e-9) { if (lo <= 0 && hi >= 1) return []; hid.push([lo, hi]) }   // hidden whole: done
			}
		hid.sort((x, y) => x[0] - y[0])
		const out: [number, number][] = [], minS = MIN_LEN / len
		let cur = 0
		for (const [lo, hi] of hid) { if (lo - cur > minS) out.push([cur, lo]); cur = Math.max(cur, hi); if (cur >= 1) break }
		if (1 - cur > minS) out.push([cur, 1])
		return out
	}

	return perObj.map((fs) => {
		const segs: HLSeg[] = [], seen = new Set<string>()
		for (const [A, B] of objectEdges(fs)) for (const [s0, s1] of visible(A, B)) {
			const s: HLSeg = [A[0] + (B[0] - A[0]) * s0, A[1] + (B[1] - A[1]) * s0, A[0] + (B[0] - A[0]) * s1, A[1] + (B[1] - A[1]) * s1]
			const k = s.map((x) => Math.round(x * 10)).join(',')
			if (!seen.has(k)) { seen.add(k); segs.push(s) }
		}
		const fills = fs.filter((x) => !x.edgeOn).map((x) => { const pts = x.p.map((q) => ({ u: q[0], v: q[1] })); return x.n[2] < 0 ? pts.reverse() : pts })
		return { segs, fills }
	})
}
