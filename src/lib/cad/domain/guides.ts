// GUIDES (User 2026-10-14 todo): horizontal / vertical construction lines per view, placed with the Guide tool. They
// are a drawing aid on YOUR screen: kept per view in this browser (not in the drawing, never printed). Points snap onto
// a guide and onto where two guides cross. Pure; tested in guides.test.ts.
import type { Pt } from './types'

/** `axis` 'v' = a vertical line at x = `at`; 'h' = a horizontal one at y = `at` (view mm). */
export interface Guide { id: string; axis: 'h' | 'v'; at: number }

const dist = (g: Guide, p: Pt) => Math.abs(g.axis === 'v' ? p.x - g.at : p.y - g.at)

/** The guide nearest `p` within `tol` (for moving / deleting it). */
export function guideAt(gs: readonly Guide[], p: Pt, tol: number): Guide | undefined {
	let best: Guide | undefined, d = tol
	for (const g of gs) { const e = dist(g, p); if (e <= d) { best = g; d = e } }
	return best
}

/** Where `p` snaps on the guides: a crossing of a vertical and a horizontal one within `tol` (both near), else the
 *  nearest guide within `tol` (the point moved square onto it), else null. */
export function guideSnap(gs: readonly Guide[], p: Pt, tol: number): Pt | null {
	const near = (axis: Guide['axis']) => gs.filter((g) => g.axis === axis && dist(g, p) <= tol).sort((a, b) => dist(a, p) - dist(b, p))[0]
	const v = near('v'), h = near('h')
	if (v && h) return { x: v.at, y: h.at }
	if (v) return { x: v.at, y: p.y }
	if (h) return { x: p.x, y: h.at }
	return null
}

/** The guides through `p`: a vertical one, a horizontal one, or both (a cross). One already there isn't doubled. */
export function addGuides(gs: readonly Guide[], p: Pt, axis: Guide['axis'] | 'both', id: () => string): Guide[] {
	const want = (axis === 'both' ? ['v', 'h'] : [axis]) as Guide['axis'][]
	const out = [...gs]
	for (const a of want) {
		const at = Math.round((a === 'v' ? p.x : p.y) * 100) / 100
		if (!out.some((g) => g.axis === a && Math.abs(g.at - at) < 1e-6)) out.push({ id: id(), axis: a, at })
	}
	return out
}
