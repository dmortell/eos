// Picking against the display list — the same prims that are drawn, so what you see is what you click.
import type { Id, Pt } from '../domain/types'
import { primBounds, type Prim, type Bounds } from '../views/display'
import { segDist, inPolygon, primDist } from '../views/primGeom'

export { segDist, inPolygon, primDist }

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
export function pickPrim(prims: Prim[], p: Pt, tol: number, skip?: (src: Id) => boolean, prefer?: (src: Id) => boolean): Prim | undefined {
	return exactPort(prims, pickNear(prims, p, tol, skip, prefer), p)
}
/** A port cell picked within the tolerance, while the point is INSIDE another port cell: that one (Round 9: the tip
 *  said PP1 port 1, the click took port 3 — the tolerance reaches over the next tiny cell, drawn later). */
function exactPort(prims: Prim[], hit: Prim | undefined, p: Pt): Prim | undefined {
	// (a port's LABEL too: drawn at a minimum on-screen size, it spills over the next cell and took the click)
	if (!hit || hit.k === 'image' || !hit.sub || !/^port\b/.test(hit.cls) || (hit.k === 'line' && hit.closed && inPolygon(p, hit.pts))) return hit
	for (let i = prims.length - 1; i >= 0; i--) {
		const pr = prims[i]
		if (pr.k === 'line' && pr.src && pr.sub && pr.closed && /^port\b/.test(pr.cls) && inPolygon(p, pr.pts)) return pr
	}
	return hit
}
function pickNear(prims: Prim[], p: Pt, tol: number, skip?: (src: Id) => boolean, prefer?: (src: Id) => boolean): Prim | undefined {
	// what's preferred under the point wins over what's drawn on top of it (R7-23: an outlet on a desk — the desk's fill
	// is drawn over it, so a click took the desk)
	if (prefer) for (let i = prims.length - 1; i >= 0; i--) {
		const pr = prims[i]
		if (pr.src && !skip?.(pr.src) && prefer(pr.src) && primDist(pr, p) <= tol) return pr
	}
	for (let i = prims.length - 1; i >= 0; i--) {
		const pr = prims[i]
		if (!pr.src || skip?.(pr.src)) continue
		if (primDist(pr, p) <= tol) return pr
	}
	return undefined
}

/** A rack view's click on a patch CORD where it crosses a port cell takes the PORT (W15 / B54: cords drawn over a
 *  panel's lower row hid its ports; patching more meant hiding the cords layer). Off the ports the cord is picked. */
export function preferPort(prims: Prim[], hit: Prim | undefined, p: Pt): Prim | undefined {
	if (!hit || hit.k !== 'line' || !/^cord\b/.test(hit.cls)) return hit
	for (let i = prims.length - 1; i >= 0; i--) {
		const pr = prims[i]
		if (pr.k === 'line' && pr.src && pr.sub && /^port\b/.test(pr.cls) && pr.closed && inPolygon(p, pr.pts)) return pr
	}
	return hit
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
