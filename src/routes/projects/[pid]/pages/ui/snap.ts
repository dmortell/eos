// Snapping for the Pages tool (review.md §R1, step 5). This first slice is the PURE snap geometry —
// grid snap + entity snap points — with no component state. The object/node/depth snappers that write
// `snapMark` (findSnap/snapNode/graphNodeApply/elevDepthSnap) follow in later slices; they'll return the
// mark so the Viewport assigns it.
import type { Pt, Ent } from './geometry'
import type { ViewCtx } from './view'
import { bbox } from './hit'

export const SNAP_STEP = 100   // grid snap spacing (mm)

/** Round a point to the grid (`step` mm; defaults to SNAP_STEP). */
export const snapToGrid = (p: Pt, step = SNAP_STEP): Pt => [Math.round(p[0] / step) * step, Math.round(p[1] / step) * step]

/** Grid-snap a MOVE delta so the entity's defining point (a / centre / first vertex) lands on the grid,
 *  keeping its shape. `step` = grid spacing, or 0 to disable (SNAP off). */
export function snapDelta(dx: number, dy: number, base: Ent, step: number): [number, number] {
	if (!step) return [dx, dy]
	const A = base.a ?? base.pts?.[0]
	if (!A) return [Math.round(dx / step) * step, Math.round(dy / step) * step]
	const g = snapToGrid([A[0] + dx, A[1] + dy], step)
	return [g[0] - A[0], g[1] - A[1]]
}

/** An object-snap candidate: a point + its kind (end / mid / center). */
export type EntSnap = { point: Pt; type: string }

/** The object-snap points of an entity: endpoints + midpoints (+ centre / bbox corners for closed shapes,
 *  via hit.bbox). */
export function entSnaps(ctx: ViewCtx, e: Ent): EntSnap[] {
	const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
	if (e.type === 'polyline') { const pts = e.pts ?? []; const out = pts.map((p) => ({ point: p, type: 'end' })); for (let i = 0; i + 1 < pts.length; i++) out.push({ point: mid(pts[i], pts[i + 1]), type: 'mid' }); return out }
	if (e.type === 'line' || e.type === 'dim') return [{ point: e.a!, type: 'end' }, { point: e.b!, type: 'end' }, { point: mid(e.a!, e.b!), type: 'mid' }]
	if (e.type === 'rect' || e.type === 'ellipse' || e.type === 'image') {
		const [x0, y0, x1, y1] = bbox(ctx, e)
		const c: Pt[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
		return [...c.map((p) => ({ point: p, type: 'end' })),
			{ point: mid(c[0], c[1]), type: 'mid' }, { point: mid(c[1], c[2]), type: 'mid' }, { point: mid(c[2], c[3]), type: 'mid' }, { point: mid(c[3], c[0]), type: 'mid' },
			{ point: [(x0 + x1) / 2, (y0 + y1) / 2] as Pt, type: 'center' }]
	}
	if (e.type === 'text') return [{ point: e.a!, type: 'end' }]
	return []
}
