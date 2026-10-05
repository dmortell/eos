// Object snaps on a level's plan (ADR 0005: OSNAP + grid for now): path nodes, segment midpoints, outlet and rack
// centres. A snap onto an outlet or rack also says what a new path node should ATTACH to (it then follows it).
import type { Id, Pt } from '../domain/types'
import type { ProjectIndex } from '../domain/project'
import type { Prim } from '../views/display'
import type { Shape } from '../domain/shapes'

export type SnapKind = 'node' | 'mid' | 'centre' | 'outlet' | 'rack' | 'grid'
export interface Snap { p: Pt; kind: SnapKind; z?: number; attach?: Id }

export const GRID_MM = 10

/** `noGrid` = no grid point (Alt, or SNAP off); `grid` = the grid step (mm; default 10); `noObjects` = OSNAP off. */
export interface SnapOpts { skip?: Id | Id[]; noGrid?: boolean; grid?: number; noObjects?: boolean }

export function gridSnap(p: Pt, step = GRID_MM): Pt {
	return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step }
}

/**
 * Snaps in any view, from what is DRAWN: line vertices and circle centres of the display list (an elevation's run
 * ends, rack corners, outlet faceplates), else the grid. No attach — attaching is done in plan.
 */
export function snapToPrims(prims: Prim[], p: Pt, tol: number, opts: SnapOpts = {}): Snap {
	const skips = new Set(Array.isArray(opts.skip) ? opts.skip : opts.skip ? [opts.skip] : [])
	let best: Snap | undefined, bestD = opts.noObjects ? -1 : tol
	const offer = (q: Pt) => { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d <= bestD) { best = { p: q, kind: 'node' }; bestD = d } }
	for (const pr of prims) {
		if (!pr.src || skips.has(pr.src)) continue
		if (pr.k === 'line') pr.pts.forEach(offer)
		else if (pr.k === 'circle') offer(pr.c)
	}
	return best ?? (opts.noGrid || opts.grid === 0 ? { p, kind: 'grid' } : { p: gridSnap(p, opts.grid || GRID_MM), kind: 'grid' })
}

/** A shape's centre point, if it has one (a polygon: the average of its corners). */
export function centreOf(g: Shape['geom']): Pt | null {
	switch (g.kind) {
		case 'circle': case 'arc': case 'rect': case 'image': return g.centre
		case 'insert': return g.at
		case 'polygon': return g.pts.length ? { x: g.pts.reduce((a, q) => a + q.x, 0) / g.pts.length, y: g.pts.reduce((a, q) => a + q.y, 0) / g.pts.length } : null
		default: return null
	}
}

/** The nearest object snap within `tol`, else the grid point. `skip` excludes a shape (the one being edited). */
export function snapAt(ix: ProjectIndex, levelId: Id, p: Pt, tol: number, opts: SnapOpts = {}): Snap {
	const skips = new Set(Array.isArray(opts.skip) ? opts.skip : opts.skip ? [opts.skip] : [])
	let best: Snap | undefined, bestD = opts.noObjects ? -1 : tol
	const offer = (s: Snap) => {
		const d = Math.hypot(s.p.x - p.x, s.p.y - p.y)
		if (d <= bestD) { best = s; bestD = d }
	}
	for (const o of ix.outlets) if (o.levelId === levelId && o.at) offer({ p: o.at, kind: 'outlet', attach: o.id })
	for (const r of ix.racks) if (r.levelId === levelId && r.at) offer({ p: r.at, kind: 'rack', attach: r.id })
	for (const s of ix.shapes) {
		if (s.levelId !== levelId || skips.has(s.id)) continue
		// the CENTRE of a circle / arc / box / polygon, and a block's insertion point (backlog "Centre snap")
		const c = centreOf(s.geom)
		if (c) offer({ p: c, kind: 'centre' })
		if (s.geom.kind !== 'path') continue
		const nodes = new Map(s.geom.nodes.map((n) => [n.id, n]))
		for (const n of s.geom.nodes) offer({ p: n, kind: 'node', z: n.z })
		for (const g of s.geom.segs) {
			const a = nodes.get(g.a), b = nodes.get(g.b)
			if (a && b && (a.x !== b.x || a.y !== b.y)) offer({ p: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, kind: 'mid' })
		}
	}
	return best ?? (opts.noGrid || opts.grid === 0 ? { p, kind: 'grid' } : { p: gridSnap(p, opts.grid || GRID_MM), kind: 'grid' })
}
