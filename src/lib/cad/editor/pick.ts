// Picking against the display list — the same prims that are drawn, so what you see is what you click.
import type { Id, Pt } from '../domain/types'
import { primBounds, type Prim, type Bounds } from '../views/display'

export function segDist(p: Pt, a: Pt, b: Pt): number {
	const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy
	const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0
	return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

export function inPolygon(p: Pt, pts: Pt[]): boolean {
	let inside = false
	for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
		const a = pts[i], b = pts[j]
		if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
	}
	return inside
}

/** How far `p` is from a prim (0 = on / inside it). Images are never picked by their area (they'd cover everything). */
export function primDist(prim: Prim, p: Pt): number {
	switch (prim.k) {
		case 'line': {
			const half = (prim.w ?? 0) / 2
			if (prim.closed && prim.fill && inPolygon(p, prim.pts)) return 0
			let d = Infinity
			const n = prim.pts.length, last = prim.closed ? n : n - 1
			for (let i = 0; i < last; i++) d = Math.min(d, segDist(p, prim.pts[i], prim.pts[(i + 1) % n]))
			return Math.max(0, d - half)
		}
		case 'circle': {
			const d = Math.hypot(p.x - prim.c.x, p.y - prim.c.y)
			return prim.fill || d <= prim.r ? Math.max(0, d - prim.r) : Math.abs(d - prim.r)
		}
		case 'text': {
			const b = primBounds(prim)
			return Math.hypot(Math.max(b.x0 - p.x, 0, p.x - b.x1), Math.max(b.y0 - p.y, 0, p.y - b.y1))
		}
		case 'image': return Infinity
	}
}

/** The entity under `p`: the TOPMOST prim within `tol` (later prims draw on top). */
export function pickAt(prims: Prim[], p: Pt, tol: number, skip?: (src: Id) => boolean): Id | undefined {
	return pickPrim(prims, p, tol, skip)?.src
}

/** Every entity under `p`, topmost first — clicking the same spot again steps down through them. */
export function pickStack(prims: Prim[], p: Pt, tol: number): Id[] {
	const out: Id[] = []
	for (let i = prims.length - 1; i >= 0; i--) {
		const pr = prims[i]
		if (pr.src && !out.includes(pr.src) && primDist(pr, p) <= tol) out.push(pr.src)
	}
	return out
}

/** The topmost prim under `p` with a source — for its `sub` (a port number on a device …). */
export function pickPrim(prims: Prim[], p: Pt, tol: number, skip?: (src: Id) => boolean): Prim | undefined {
	for (let i = prims.length - 1; i >= 0; i--) {
		const pr = prims[i]
		if (!pr.src || skip?.(pr.src)) continue
		if (primDist(pr, p) <= tol) return pr
	}
	return undefined
}

/** Does the segment a–b touch the box (an end inside, or it crosses an edge)? */
function segTouches(a: Pt, b: Pt, r: Bounds): boolean {
	const inside = (p: Pt) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1
	if (inside(a) || inside(b)) return true
	const c = [{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }]
	const cross = (p: Pt, q: Pt, s: Pt) => (q.x - p.x) * (s.y - p.y) - (q.y - p.y) * (s.x - p.x)
	return c.some((p, i) => { const q = c[(i + 1) % 4]; return cross(a, b, p) * cross(a, b, q) <= 0 && cross(p, q, a) * cross(p, q, b) <= 0 })
}
/** Does a prim touch the box (crossing selection)? A filled shape also when the box is inside it. */
function touches(pr: Prim, r: Bounds): boolean {
	const b = primBounds(pr)
	if (b.x1 < r.x0 || b.x0 > r.x1 || b.y1 < r.y0 || b.y0 > r.y1) return false
	if (pr.k === 'line') {
		const n = pr.pts.length, last = pr.closed ? n : n - 1
		for (let i = 0; i < last; i++) if (segTouches(pr.pts[i], pr.pts[(i + 1) % n], r)) return true
		return !!(pr.closed && pr.fill && inPolygon({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 }, pr.pts))
	}
	if (pr.k === 'circle') {
		const dx = Math.max(r.x0 - pr.c.x, 0, pr.c.x - r.x1), dy = Math.max(r.y0 - pr.c.y, 0, pr.c.y - r.y1)
		return Math.hypot(dx, dy) <= pr.r
	}
	return true   // text: its box overlaps
}

/** Crossing selection (a box dragged right → left): entities any part of whose drawing the box touches. Labels count
 *  only for things that are only text (as in the window). */
export function pickTouching(prims: Prim[], box: Bounds): Id[] {
	const shape = new Set<Id>(), text = new Set<Id>(), hasShape = new Set<Id>()
	for (const pr of prims) {
		if (!pr.src || pr.k === 'image') continue
		if (pr.k !== 'text') hasShape.add(pr.src)
		if (touches(pr, box)) (pr.k === 'text' ? text : shape).add(pr.src)
	}
	return [...new Set([...shape, ...[...text].filter((id) => !hasShape.has(id))])]
}

/** Entities whose drawing lies inside the box (window selection). Their LABELS don't count (a trunk's riser label
 *  sticks out past its line, so a window round the trunk missed it) — unless the thing is only text (a note). */
export function pickInside(prims: Prim[], box: Bounds): Id[] {
	const shape = new Map<Id, boolean>(), text = new Map<Id, boolean>()
	for (const pr of prims) {
		if (!pr.src || pr.k === 'image') continue
		const b = primBounds(pr), m = pr.k === 'text' ? text : shape
		const inside = b.x0 >= box.x0 && b.y0 >= box.y0 && b.x1 <= box.x1 && b.y1 <= box.y1
		m.set(pr.src, (m.get(pr.src) ?? true) && inside)
	}
	const ids = new Set([...shape.keys(), ...text.keys()])
	return [...ids].filter((id) => (shape.has(id) ? shape.get(id) : text.get(id)))
}
