// Snapping for the Pages tool (review.md §R1, step 5): grid snap, entity snap points, and the object-snap
// search (findSnap) + the draw-point resolver (drawPoint). No component state: the snappers RETURN the
// snap mark ({ p, type } | null) and the Viewport assigns its `snapMark` from that. The mapper (one per
// pass, P1) and the drafting flags come in as arguments. Node/depth snapping follows in later slices.
import type { Pt, Ent } from './geometry'
import type { ViewCtx } from './view'
import type { Mapper } from './mapper'
import { bbox } from './hit'
import { orthoPt, constrainPt } from './annotations'

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

/** A found object snap: the snapped point + its marker kind (□ end · △ mid · ○ center). */
export type SnapHit = { p: Pt; type: string }

export type SnapOpts = {
	/** The entity being dragged — its own snap points are skipped (a shape can't snap to itself). */
	exclude?: string
	/** The text entity being edited inline — skipped too. */
	editingId?: string
	/** Search radius in SCREEN px (default 11). */
	radiusPx?: number
}

/** The nearest object-snap point (of any entity) within `radiusPx` of the pointer, or null. Distances are
 *  measured in screen px via ONE mapper for the whole pass (P1: one layout read, not one per point). The
 *  caller gates on the OSNAP toggle. */
export function findSnap(ctx: ViewCtx, m: Mapper, ents: Ent[], clientX: number, clientY: number, opts: SnapOpts = {}): SnapHit | null {
	const r = opts.radiusPx ?? 11
	let best: { p: Pt; type: string; d: number } | null = null
	for (const e of ents) {
		if (e.id === opts.exclude || e.id === opts.editingId) continue
		for (const s of entSnaps(ctx, e)) {
			const sp = m.toClient(s.point[0], s.point[1])
			const d = Math.hypot(sp.x - clientX, sp.y - clientY)
			if (d < r && (!best || d < best.d)) best = { p: s.point, type: s.type, d }
		}
	}
	return best ? { p: best.p, type: best.type } : null
}

/** What drawPoint reads: the OSNAP / SNAP / ORTHO toggles, the active tool, the entities to snap to, and
 *  the inline-edited text id (skipped). */
export type DrawInputs = { osnap: boolean; snap: boolean; ortho: boolean; tool: string; ents: Ent[]; editingId?: string }

/** The point a draw/place should use, plus the snap mark to show. Object snap wins outright; otherwise
 *  the pointer point, Shift-constrained (square / 15°, per tool) or ORTHO-locked (H/V, Line + Dimension
 *  only) relative to `base`, then grid-snapped when SNAP is on. `mark` is null unless an object snap hit. */
export function drawPoint(ctx: ViewCtx, m: Mapper, inp: DrawInputs, clientX: number, clientY: number, base?: Pt, shift = false): { p: Pt; mark: SnapHit | null } {
	const hit = inp.osnap ? findSnap(ctx, m, inp.ents, clientX, clientY, { editingId: inp.editingId }) : null
	if (hit) return { p: hit.p, mark: hit }   // object snap wins over grid snap
	let p = m.toModel(clientX, clientY)
	if (base) {
		if (shift) p = constrainPt(inp.tool, base, p, true)                                       // Shift: 15° / square
		else if (inp.ortho && (inp.tool === 'Line' || inp.tool === 'Dimension')) p = orthoPt(base, p)   // ORTHO: H/V
	}
	if (inp.snap) p = snapToGrid(p)   // grid snap
	return { p, mark: null }
}
