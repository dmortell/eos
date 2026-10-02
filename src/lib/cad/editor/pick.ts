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
	for (let i = prims.length - 1; i >= 0; i--) {
		const pr = prims[i]
		if (!pr.src || skip?.(pr.src)) continue
		if (primDist(pr, p) <= tol) return pr.src
	}
	return undefined
}

/** Entities whose every prim lies inside the box (window selection). */
export function pickInside(prims: Prim[], box: Bounds): Id[] {
	const ok = new Map<Id, boolean>()
	for (const pr of prims) {
		if (!pr.src || pr.k === 'image') continue
		const b = primBounds(pr)
		const inside = b.x0 >= box.x0 && b.y0 >= box.y0 && b.x1 <= box.x1 && b.y1 <= box.y1
		ok.set(pr.src, (ok.get(pr.src) ?? true) && inside)
	}
	return [...ok].filter(([, v]) => v).map(([id]) => id)
}
