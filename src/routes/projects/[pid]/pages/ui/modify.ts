// MODIFY geometry for the command line (OFFSET / TRIM / EXTEND / BREAK / LENGTHEN) — pure, in DRAWING coords.
// Lines are 'polyline' shapes; a polyline is parametrised by its arc length `s` (0 at pts[0]). Cutting / boundary
// edges come from every other shape's outline (`outline`).
import { type Pt, type Ent, arc3, arcPts, dist } from './geometry'

const EPS = 1e-6
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]]
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
const rot = (p: Pt, c: Pt, deg: number): Pt => { const r = (deg * Math.PI) / 180, s = Math.sin(r), co = Math.cos(r), dx = p[0] - c[0], dy = p[1] - c[1]; return [c[0] + dx * co - dy * s, c[1] + dx * s + dy * co] }

// ── polyline parametrisation ──
export function cumLen(pts: Pt[]): number[] { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + dist(pts[i - 1], pts[i])); return c }
/** The nearest point of the polyline to `p`: its arc length `s` and distance `d`. */
export function project(pts: Pt[], p: Pt): { s: number; d: number } {
	const cum = cumLen(pts); let best = { s: 0, d: Infinity }
	for (let i = 0; i + 1 < pts.length; i++) {
		const a = pts[i], b = pts[i + 1], ab = sub(b, a), L2 = ab[0] ** 2 + ab[1] ** 2
		const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / L2)) : 0
		const d = dist(p, lerp(a, b, t)); if (d < best.d) best = { s: cum[i] + t * Math.sqrt(L2), d }
	}
	return best
}
export function pointAt(pts: Pt[], s: number, cum = cumLen(pts)): Pt {
	for (let i = 0; i + 1 < pts.length; i++) if (s <= cum[i + 1] + EPS) { const L = cum[i + 1] - cum[i]; return L ? lerp(pts[i], pts[i + 1], (s - cum[i]) / L) : pts[i] }
	return pts[pts.length - 1]
}
/** The part of the polyline between arc lengths s0 < s1. */
export function slice(pts: Pt[], s0: number, s1: number): Pt[] {
	const cum = cumLen(pts), out: Pt[] = [pointAt(pts, s0, cum)]
	for (let i = 1; i + 1 < pts.length; i++) if (cum[i] > s0 + EPS && cum[i] < s1 - EPS) out.push(pts[i])
	out.push(pointAt(pts, s1, cum))
	return out
}

/** Where segments a→b and c→d cross: `t` along a→b, `u` along c→d (unbounded — callers clip); null = parallel. */
export function lineX(a: Pt, b: Pt, c: Pt, d: Pt): { t: number; u: number } | null {
	const r = sub(b, a), q = sub(d, c), den = r[0] * q[1] - r[1] * q[0]
	if (Math.abs(den) < 1e-12) return null
	const ca = sub(c, a)
	return { t: (ca[0] * q[1] - ca[1] * q[0]) / den, u: (ca[0] * r[1] - ca[1] * r[0]) / den }
}

/** A shape's outline as polylines (drawing coords, its rotation applied) — the edges TRIM / EXTEND cut against. */
export function outline(e: Ent): Pt[][] {
	const R = (ps: Pt[], c: Pt) => (e.rot ? ps.map((p) => rot(p, c, e.rot!)) : ps)
	switch (e.type) {
		case 'polyline': return e.pts && e.pts.length >= 2 ? [e.pts] : []
		case 'arc': return [arcPts(e)]
		case 'dim': return [[e.a!, e.b!]]
		case 'rect': { const [ax, ay] = e.a!, [bx, by] = e.b!, c: Pt = [(ax + bx) / 2, (ay + by) / 2]; return [R([[ax, ay], [bx, ay], [bx, by], [ax, by], [ax, ay]], c)] }
		case 'ellipse': {
			const c: Pt = [(e.a![0] + e.b![0]) / 2, (e.a![1] + e.b![1]) / 2], rx = Math.abs(e.b![0] - e.a![0]) / 2, ry = Math.abs(e.b![1] - e.a![1]) / 2
			return [R(Array.from({ length: 65 }, (_, i) => { const t = (i / 64) * 2 * Math.PI; return [c[0] + rx * Math.cos(t), c[1] + ry * Math.sin(t)] as Pt }), c)]
		}
		default: return []
	}
}

/** Arc lengths along `pts` where it crosses any of `edges` (sorted, de-duplicated). */
export function crossings(pts: Pt[], edges: Pt[][]): number[] {
	const cum = cumLen(pts), out: number[] = []
	for (let i = 0; i + 1 < pts.length; i++) for (const ed of edges) for (let j = 0; j + 1 < ed.length; j++) {
		const x = lineX(pts[i], pts[i + 1], ed[j], ed[j + 1])
		if (x && x.t >= -EPS && x.t <= 1 + EPS && x.u >= -EPS && x.u <= 1 + EPS) out.push(cum[i] + Math.max(0, Math.min(1, x.t)) * (cum[i + 1] - cum[i]))
	}
	out.sort((a, b) => a - b)
	return out.filter((s, i) => i === 0 || s - out[i - 1] > 1e-3)
}

/** TRIM: remove the piece of the polyline around `sPick` between the nearest crossings — the pieces left (0–2);
 *  null = nothing crosses it. */
export function trim(pts: Pt[], sPick: number, cuts: number[]): Pt[][] | null {
	const L = cumLen(pts).at(-1)!, inner = cuts.filter((s) => s > 1e-3 && s < L - 1e-3)
	if (!inner.length) return null
	const lo = inner.filter((s) => s < sPick).at(-1), hi = inner.find((s) => s > sPick)
	const out: Pt[][] = []
	if (lo != null) out.push(slice(pts, 0, lo))
	if (hi != null) out.push(slice(pts, hi, L))
	return out
}

/** EXTEND the start / end of a polyline along its end segment to the nearest edge beyond it; null = none. */
export function extend(pts: Pt[], atStart: boolean, edges: Pt[][]): Pt[] | null {
	if (pts.length < 2) return null
	const [q, e] = atStart ? [pts[1], pts[0]] : [pts[pts.length - 2], pts[pts.length - 1]]
	let best = Infinity
	for (const ed of edges) for (let j = 0; j + 1 < ed.length; j++) {
		const x = lineX(q, e, ed[j], ed[j + 1])
		if (x && x.t > 1 + 1e-6 && x.u >= -EPS && x.u <= 1 + EPS && x.t < best) best = x.t
	}
	if (!isFinite(best)) return null
	const np = lerp(q, e, best)
	return atStart ? [np, ...pts.slice(1)] : [...pts.slice(0, -1), np]
}

/** BREAK between arc lengths s1 and s2 (either order); equal = split at that point. The pieces (1–2). */
export function breakAt(pts: Pt[], s1: number, s2: number): Pt[][] {
	const L = cumLen(pts).at(-1)!, a = Math.max(0, Math.min(s1, s2)), b = Math.min(L, Math.max(s1, s2))
	const out: Pt[][] = []
	if (a > 1e-3) out.push(slice(pts, 0, a))
	if (b < L - 1e-3) out.push(slice(pts, b, L))
	return out
}

/** LENGTHEN: the polyline with its start / end moved so the total length is `len` (> 0). Longer = the end
 *  segment extends; shorter = it is cut back (across vertices if needed). */
export function setLength(pts: Pt[], atStart: boolean, len: number): Pt[] | null {
	const L = cumLen(pts).at(-1)!; if (!(len > 1e-6) || pts.length < 2 || !L) return null
	if (len <= L) return atStart ? slice(pts, L - len, L) : slice(pts, 0, len)
	const [q, e] = atStart ? [pts[1], pts[0]] : [pts[pts.length - 2], pts[pts.length - 1]], k = (dist(q, e) + len - L) / (dist(q, e) || 1)
	const np = lerp(q, e, k)
	return atStart ? [np, ...pts.slice(1)] : [...pts.slice(0, -1), np]
}
export const polyLength = (pts: Pt[]) => cumLen(pts).at(-1) ?? 0

/** An arc's length, and the arc re-made with length `len` from its start (atStart = false) or end. */
export function arcLength(e: Ent): number { const p = e.pts ?? [], g = p.length === 3 ? arc3(p[0], p[1], p[2]) : null; return g ? g.r * Math.abs(g.sweep) : 0 }
export function setArcLength(e: Ent, atStart: boolean, len: number): Ent | null {
	const p = e.pts ?? [], g = p.length === 3 ? arc3(p[0], p[1], p[2]) : null
	if (!g || !(len > 0)) return null
	const sw = Math.sign(g.sweep) * Math.min(len / g.r, 2 * Math.PI - 1e-3)
	const at = (a: number): Pt => [g.c[0] + g.r * Math.cos(a), g.c[1] + g.r * Math.sin(a)]
	const aEnd = g.a0 + g.sweep, a0 = atStart ? aEnd - sw : g.a0, a1 = atStart ? aEnd : g.a0 + sw
	return { ...e, pts: [at(a0), at((a0 + a1) / 2), at(a1)] }
}

/** STRETCH: `e` with the parts inside the crossing window `box` [x0, y0, x1, y1] moved by (dx, dy); null = untouched.
 *  Points (polyline / arc / dimension) inside move; a rect / ellipse moves each edge with a corner inside (all four
 *  = the whole shape moves); a text / block / image moves when its anchor is inside; a rotated rect / ellipse only
 *  when wholly inside. */
export function stretchEnt(e: Ent, box: [number, number, number, number], dx: number, dy: number): Ent | null {
	const [x0, y0, x1, y1] = box, inside = (p?: Pt) => !!p && p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1
	const mv = (p: Pt): Pt => [p[0] + dx, p[1] + dy]
	if (e.pts) {
		if (!e.pts.some(inside)) return null
		return { ...e, pts: e.pts.map((p) => (inside(p) ? mv(p) : p)) }
	}
	if (e.type === 'dim') {
		const ia = inside(e.a), ib = inside(e.b); if (!ia && !ib) return null
		return { ...e, a: ia ? mv(e.a!) : e.a, b: ib ? mv(e.b!) : e.b }
	}
	if ((e.type === 'rect' || e.type === 'ellipse') && e.a && e.b) {
		const lx = Math.min(e.a[0], e.b[0]), hx = Math.max(e.a[0], e.b[0]), ly = Math.min(e.a[1], e.b[1]), hy = Math.max(e.a[1], e.b[1])
		const cs: Pt[] = [[lx, ly], [hx, ly], [hx, hy], [lx, hy]], inn = cs.map((p) => inside(p))
		if (!inn.some(Boolean)) return null
		if (e.rot && !inn.every(Boolean)) return null
		const L = inn[0] || inn[3], R = inn[1] || inn[2], T = inn[0] || inn[1], B = inn[2] || inn[3]
		return { ...e, a: [lx + (L ? dx : 0), ly + (T ? dy : 0)], b: [hx + (R ? dx : 0), hy + (B ? dy : 0)], ...(e.leader ? { leader: inside(e.leader) ? mv(e.leader) : e.leader } : {}) }
	}
	if (e.a && inside(e.a)) return { ...e, a: mv(e.a), ...(e.b ? { b: mv(e.b) } : {}), ...(e.leader && inside(e.leader) ? { leader: mv(e.leader) } : {}) }
	if (e.type === 'text' && e.leader && inside(e.leader)) return { ...e, leader: mv(e.leader) }   // just the leader tip
	return null
}

/** JOIN: chains of polylines meeting end to end (within `tol`, either direction) → each chain as one point list
 *  (the indices it used, in order). Singletons are left out. A chain that closes repeats its first point. */
export function joinChains(lines: Pt[][], tol = 1): { idx: number[]; pts: Pt[] }[] {
	const used = new Set<number>(), out: { idx: number[]; pts: Pt[] }[] = []
	const near = (a: Pt, b: Pt) => dist(a, b) <= tol
	for (let i = 0; i < lines.length; i++) {
		if (used.has(i)) continue
		used.add(i); let pts = [...lines[i]]; const idx = [i]
		for (let grew = true; grew; ) {
			grew = false
			for (let j = 0; j < lines.length; j++) {
				if (used.has(j)) continue
				const l = lines[j], s = pts[0], e = pts[pts.length - 1]
				if (near(e, l[0])) pts = [...pts, ...l.slice(1)]
				else if (near(e, l[l.length - 1])) pts = [...pts, ...[...l].reverse().slice(1)]
				else if (near(s, l[l.length - 1])) pts = [...l.slice(0, -1), ...pts]
				else if (near(s, l[0])) pts = [...[...l].reverse().slice(0, -1), ...pts]
				else continue
				used.add(j); idx.push(j); grew = true
			}
		}
		if (idx.length > 1) { if (near(pts[0], pts[pts.length - 1])) pts[pts.length - 1] = pts[0]; out.push({ idx, pts }) }
	}
	return out
}

/** FILLET / CHAMFER two lines (a→b each), picked at `p1` / `p2` (the kept side). radius 0 = a clean corner; `r` > 0 =
 *  a tangent arc (its 3 points); `chamfer` [d1, d2] = a bevel line. The trimmed / extended lines, or null (parallel /
 *  too short). */
export function corner(l1: [Pt, Pt], p1: Pt, l2: [Pt, Pt], p2: Pt, o: { r?: number; chamfer?: [number, number] }):
	{ a: [Pt, Pt]; b: [Pt, Pt]; arc?: [Pt, Pt, Pt]; bevel?: [Pt, Pt] } | null {
	const x = lineX(l1[0], l1[1], l2[0], l2[1]); if (!x) return null
	const X = lerp(l1[0], l1[1], x.t)
	// each line keeps the end on the picked side of the corner
	const keep = (l: [Pt, Pt], p: Pt): Pt => {
		const d = sub(l[1], l[0]), s = (p[0] - X[0]) * d[0] + (p[1] - X[1]) * d[1]
		const e0 = (l[0][0] - X[0]) * d[0] + (l[0][1] - X[1]) * d[1], e1 = (l[1][0] - X[0]) * d[0] + (l[1][1] - X[1]) * d[1]
		// the end farthest from the corner on the picked side (both ends may lie on it when the lines don't meet)
		const score = (e: number) => (Math.sign(e) === Math.sign(s) ? Math.abs(e) : -Math.abs(e))
		return score(e1) >= score(e0) ? l[1] : l[0]
	}
	const k1 = keep(l1, p1), k2 = keep(l2, p2), L1 = dist(k1, X), L2 = dist(k2, X)
	if (!L1 || !L2) return null
	const u1: Pt = [(k1[0] - X[0]) / L1, (k1[1] - X[1]) / L1], u2: Pt = [(k2[0] - X[0]) / L2, (k2[1] - X[1]) / L2]
	const at = (u: Pt, t: number): Pt => [X[0] + u[0] * t, X[1] + u[1] * t]
	if (o.chamfer) {
		const [d1, d2] = o.chamfer; if (d1 > L1 || d2 > L2) return null
		const t1 = at(u1, d1), t2 = at(u2, d2)
		return { a: [k1, t1], b: [k2, t2], bevel: d1 || d2 ? [t1, t2] : undefined }
	}
	const r = o.r ?? 0
	if (!r) return { a: [k1, X], b: [k2, X] }
	const th = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])))   // the angle between the kept legs
	if (th < 1e-6 || Math.PI - th < 1e-6) return null
	const t = r / Math.tan(th / 2); if (t > L1 || t > L2) return null
	const t1 = at(u1, t), t2 = at(u2, t)
	const bis: Pt = [u1[0] + u2[0], u1[1] + u2[1]], bl = Math.hypot(bis[0], bis[1]), h = r / Math.sin(th / 2)
	const C: Pt = [X[0] + (bis[0] / bl) * h, X[1] + (bis[1] / bl) * h], M: Pt = [C[0] - (bis[0] / bl) * r, C[1] - (bis[1] / bl) * r]
	return { a: [k1, t1], b: [k2, t2], arc: [t1, M, t2] }
}

/** FILLET / CHAMFER ONE CORNER of a polyline (vertex `i`, not an end): the vertex becomes the two trim points, with
 *  the fillet arc sampled in between (so it stays one polyline); null when it doesn't fit. */
export function cornerInPolyline(pts: Pt[], i: number, o: { r?: number; chamfer?: [number, number] }): Pt[] | null {
	if (i < 1 || i > pts.length - 2) return null
	const r = corner([pts[i - 1], pts[i]], pts[i - 1], [pts[i], pts[i + 1]], pts[i + 1], o); if (!r) return null
	const mid: Pt[] = r.arc ? arcPts({ id: '', type: 'arc', pts: r.arc }, 8) : [r.a[1], r.b[1]]
	return [...pts.slice(0, i), ...mid, ...pts.slice(i + 1)]
}

/** OFFSET a polyline by `d` (positive = the left of its direction, in drawing coords): each segment shifts along
 *  its normal; neighbours meet at their intersection (mitred). A closed one (first = last) wraps. */
export function offsetPolyline(pts: Pt[], d: number): Pt[] {
	const n = pts.length; if (n < 2) return pts
	const closed = n > 3 && dist(pts[0], pts[n - 1]) < 1e-6
	const segs: [Pt, Pt][] = []
	for (let i = 0; i + 1 < n; i++) {
		const a = pts[i], b = pts[i + 1], L = dist(a, b) || 1, nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L
		segs.push([[a[0] + nx * d, a[1] + ny * d], [b[0] + nx * d, b[1] + ny * d]])
	}
	const join = (s: [Pt, Pt], t: [Pt, Pt]): Pt => { const x = lineX(s[0], s[1], t[0], t[1]); return x ? lerp(s[0], s[1], x.t) : s[1] }
	const out: Pt[] = [closed ? join(segs[segs.length - 1], segs[0]) : segs[0][0]]
	for (let i = 0; i + 1 < segs.length; i++) out.push(join(segs[i], segs[i + 1]))
	out.push(closed ? out[0] : segs[segs.length - 1][1])
	return out
}

/** OFFSET a shape by distance `d` toward the side point `side`: a polyline (left / right), a rect or ellipse
 *  (grow outward / shrink inward), an arc (radius ± d). null = unsupported / it would collapse. */
export function offsetEnt(e: Ent, d: number, side: Pt): Ent | null {
	if (e.type === 'polyline' && e.pts && e.pts.length >= 2) {
		const pts = e.pts, cum = cumLen(pts), pr = project(pts, side)
		let i = 0; while (i + 2 < pts.length && cum[i + 1] < pr.s) i++
		const a = pts[i], b = pts[i + 1], cross = (b[0] - a[0]) * (side[1] - a[1]) - (b[1] - a[1]) * (side[0] - a[0])
		return { ...e, pts: offsetPolyline(pts, cross >= 0 ? d : -d) }
	}
	if (e.type === 'rect' || e.type === 'ellipse') {
		const x0 = Math.min(e.a![0], e.b![0]), y0 = Math.min(e.a![1], e.b![1]), x1 = Math.max(e.a![0], e.b![0]), y1 = Math.max(e.a![1], e.b![1])
		const c: Pt = [(x0 + x1) / 2, (y0 + y1) / 2], sp = e.rot ? rot(side, c, -e.rot) : side
		const inside = e.type === 'rect' ? sp[0] > x0 && sp[0] < x1 && sp[1] > y0 && sp[1] < y1
			: ((sp[0] - c[0]) / ((x1 - x0) / 2 || 1)) ** 2 + ((sp[1] - c[1]) / ((y1 - y0) / 2 || 1)) ** 2 < 1
		const k = inside ? -d : d
		if (x1 - x0 + 2 * k <= 0 || y1 - y0 + 2 * k <= 0) return null
		return { ...e, a: [x0 - k, y0 - k], b: [x1 + k, y1 + k] }
	}
	if (e.type === 'arc' && e.pts?.length === 3) {
		const g = arc3(e.pts[0], e.pts[1], e.pts[2]); if (!g) return null
		const r = dist(side, g.c) > g.r ? g.r + d : g.r - d; if (r <= 0) return null
		return { ...e, pts: e.pts.map((p) => [g.c[0] + ((p[0] - g.c[0]) * r) / g.r, g.c[1] + ((p[1] - g.c[1]) * r) / g.r] as Pt) }
	}
	return null
}
