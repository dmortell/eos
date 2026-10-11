// RUN OUTLINES (backlog "Trunk drawing style", G048 / G187): joined runs drawn as ONE outline — the legacy outlets
// tool's trunk polygons (routes/projects/[pid]/outlets/trunks/geometry.ts): every segment a band of its width, the
// bands walked as a graph (half-edges, neighbours by angle) so each loop of the outline comes out once with mitred
// joins — then its corners rounded. Segments of different runs that meet at the same point join into one outline.
// Pure; tested in runOutline.test.ts.
import type { Pt } from './types'

/** One band: a segment (plan mm) and its width. */
export interface OutlineEdge { a: Pt; b: Pt; w: number }

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y })
const scale = (v: Pt, s: number): Pt => ({ x: v.x * s, y: v.y * s })
const vlen = (v: Pt): number => Math.hypot(v.x, v.y)
const norm = (v: Pt): Pt => { const l = vlen(v); return l ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 } }
const perp = (v: Pt): Pt => ({ x: -v.y, y: v.x })
const cross = (a: Pt, b: Pt): number => a.x * b.y - a.y * b.x
/** Points this close (mm) are one node: runs drawn to the same point join. */
const key = (p: Pt) => `${Math.round(p.x * 2)},${Math.round(p.y * 2)}`
const MITER_LIMIT = 4

/** The outline loops of some bands (each loop a closed polygon; a ring of runs gives its outside and its hole). */
export function outlineLoops(edges: OutlineEdge[]): Pt[][] {
	type Adj = { to: string; w: number; angle: number }
	const nodes = new Map<string, { p: Pt; adj: Adj[] }>()
	const node = (p: Pt) => { const k = key(p); if (!nodes.has(k)) nodes.set(k, { p, adj: [] }); return k }
	const seen = new Set<string>()
	for (const e of edges) {
		const a = node(e.a), b = node(e.b), id = a < b ? `${a}|${b}` : `${b}|${a}`
		if (a === b || seen.has(id)) continue   // a zero-length segment, or a second run along the same one
		seen.add(id)
		nodes.get(a)!.adj.push({ to: b, w: e.w, angle: 0 })
		nodes.get(b)!.adj.push({ to: a, w: e.w, angle: 0 })
	}
	for (const n of nodes.values()) {
		for (const x of n.adj) { const t = nodes.get(x.to)!.p; x.angle = Math.atan2(t.y - n.p.y, t.x - n.p.x) }
		n.adj.sort((x, y) => x.angle - y.angle)
	}
	const loops: Pt[][] = [], visited = new Set<string>()
	const maxSteps = edges.length * 4 + 10
	for (const [startId, start] of nodes) {
		for (const first of start.adj) {
			if (visited.has(`${startId}|${first.to}`)) continue
			const poly: Pt[] = []
			let cur = startId, next = first.to, steps = 0
			while (!visited.has(`${cur}|${next}`) && steps++ < maxSteps) {
				visited.add(`${cur}|${next}`)
				const prev = nodes.get(cur)!, here = nodes.get(next)!
				const arrival = here.adj.findIndex((x) => x.to === cur)
				if (arrival < 0) break
				const out = here.adj[(arrival - 1 + here.adj.length) % here.adj.length]
				const upcoming = nodes.get(out.to)!
				const dirIn = norm(sub(here.p, prev.p)), dirOut = norm(sub(upcoming.p, here.p))
				const r1 = here.adj[arrival].w / 2, r2 = out.w / 2
				const p1 = add(here.p, scale(perp(dirIn), r1)), p2 = add(here.p, scale(perp(dirOut), r2))
				if (cur === out.to) poly.push(p1, p2)                       // a dead end: its square end
				else {
					const det = cross(dirIn, dirOut)
					if (Math.abs(det) < 1e-5) poly.push(p1)                 // straight on
					else {
						const t = cross(sub(p2, p1), dirOut) / det, x = add(p1, scale(dirIn, t))
						if (vlen(sub(x, here.p)) > Math.min(r1, r2) * 2 * MITER_LIMIT) poly.push(p1, p2)   // too sharp: bevel
						else poly.push(x)                                    // mitre
					}
				}
				cur = next
				next = out.to
			}
			if (poly.length >= 3) loops.push(poly)
		}
	}
	return loops
}

/** A loop with its corners rounded to `r` (less where the sides are short); corners where `sharp` says so stay (a
 *  run's square ends). Arcs as `steps` points. */
export function roundCorners(poly: Pt[], r: number, sharp: (p: Pt) => boolean = () => false, steps = 4): Pt[] {
	if (r <= 0 || poly.length < 3) return poly
	const out: Pt[] = []
	for (let i = 0; i < poly.length; i++) {
		const prev = poly[(i - 1 + poly.length) % poly.length], cur = poly[i], next = poly[(i + 1) % poly.length]
		const vin = sub(prev, cur), vout = sub(next, cur), lin = vlen(vin), lout = vlen(vout)
		if (sharp(cur) || lin < 1e-6 || lout < 1e-6) { out.push(cur); continue }
		const u1 = scale(vin, 1 / lin), u2 = scale(vout, 1 / lout)
		const angle = Math.acos(Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y)))
		if (angle < 1e-3 || Math.abs(Math.PI - angle) < 1e-3) { out.push(cur); continue }
		const off = Math.min(r / Math.tan(angle / 2), Math.min(lin, lout) * 0.5)
		const rr = off * Math.tan(angle / 2), bis = norm(add(u1, u2)), c = add(cur, scale(bis, rr / Math.sin(angle / 2)))
		const t1 = add(cur, scale(u1, off)), t2 = add(cur, scale(u2, off))
		const a1 = Math.atan2(t1.y - c.y, t1.x - c.x)
		let da = Math.atan2(t2.y - c.y, t2.x - c.x) - a1
		while (da > Math.PI) da -= 2 * Math.PI
		while (da < -Math.PI) da += 2 * Math.PI
		for (let s = 0; s <= steps; s++) out.push({ x: c.x + rr * Math.cos(a1 + (da * s) / steps), y: c.y + rr * Math.sin(a1 + (da * s) / steps) })
	}
	return out
}

/** The square ends of some bands: a point on the outline within half a width of an end node (a node one band only
 *  reaches) is one of its corners. */
export function endCorners(edges: OutlineEdge[]): (p: Pt) => boolean {
	const deg = new Map<string, { p: Pt; n: number; w: number }>()
	for (const e of edges) for (const p of [e.a, e.b]) { const k = key(p), d = deg.get(k); deg.set(k, { p, n: (d?.n ?? 0) + 1, w: Math.max(d?.w ?? 0, e.w) }) }
	const ends = [...deg.values()].filter((d) => d.n === 1)
	return (p) => ends.some((d) => vlen(sub(p, d.p)) <= d.w / 2 + 1)
}

const area = (poly: Pt[]): number => poly.reduce((s, p, i) => s + cross(p, poly[(i + 1) % poly.length]), 0) / 2
const inside = (p: Pt, poly: Pt[]): boolean => {
	let on = false
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const a = poly[i], b = poly[j]
		if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) on = !on
	}
	return on
}
/** Loops sorted into outsides and their holes: a loop inside an odd number of others is a hole of the smallest loop
 *  round it (a ring of runs: its inside edge). */
export function nestLoops(loops: Pt[][]): { outer: Pt[]; holes: Pt[][] }[] {
	const big = loops.map((l) => ({ l, a: Math.abs(area(l)) })).sort((x, y) => y.a - x.a)
	const within = big.map(({ l }, i) => big.slice(0, i).filter((o) => inside(l[0], o.l)).map((o) => o.l))
	const out = new Map<Pt[], Pt[][]>()
	big.forEach(({ l }, i) => { if (within[i].length % 2 === 0) out.set(l, []) })
	big.forEach(({ l }, i) => { if (within[i].length % 2) out.get(within[i].at(-1)!)?.push(l) })
	return [...out].map(([outer, holes]) => ({ outer, holes }))
}
