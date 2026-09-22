// Snapping for the Pages tool (review.md §R1, step 5): grid snap, entity snap points, and the object-snap
// search (findSnap) + the draw-point resolver (drawPoint). No component state: the snappers RETURN the
// snap mark ({ p, type } | null) and the Viewport assigns its `snapMark` from that. The mapper (one per
// pass, P1) and the drafting flags come in as arguments. Graph-node snapping (snapNode/graphNodeApply)
// and the elevation depth snap (elevDepthSnap) take the tolerances in model mm + the model-layer preds.
import type { Pt, Ent } from './geometry'
import type { ViewCtx, MLayers } from './view'
import type { Mapper } from './mapper'
import { ELEV_BASIS, elevUInv } from './geometry'
import { bbox, graphNodeDraw, type GN } from './hit'
import { orthoPt, constrainPt } from './annotations'

export const SNAP_STEP = 100   // grid snap spacing (mm)

/** Round a point to the grid (`step` mm; defaults to SNAP_STEP). */
export const snapToGrid = (p: Pt, step = SNAP_STEP): Pt => [Math.round(p[0] / step) * step, Math.round(p[1] / step) * step]

/** Round one coordinate to the grid step, or leave it when `step` is 0 (SNAP off). */
export const rndTo = (v: number, step: number): number => (step ? Math.round(v / step) * step : v)

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

// ── graph-node snapping (wall / conduit vertices) ──

/** The nearest OTHER visible wall/conduit node's drawn position within `thrMm` of p (for node-drag
 *  snapping), else null. Snapping coincides the coords so runs join. `origin` (the drag's start position)
 *  lets a node be pulled OFF a partner it started coincident with — DISCONNECT: candidates within `brkMm`
 *  of the origin are skipped, so re-snapping only grabs a genuinely new target. */
export function snapNode(ctx: ViewCtx, p: Pt, exclude: GN, thrMm: number, brkMm: number, ml: MLayers, origin?: Pt): Pt | null {
	const mdl = ctx.mdl; if (!mdl) return null
	let best: Pt | null = null, bestD = thrMm
	for (const o of mdl.objects) {
		if ((o.type !== 'wall' && o.type !== 'conduit') || !ml.visible(o)) continue
		for (const nn of o.nodes as GN[]) {
			if (nn === exclude) continue
			const d = graphNodeDraw(ctx, nn)
			if (origin && Math.hypot(d[0] - origin[0], d[1] - origin[1]) < brkMm) continue   // don't re-grab the node we're leaving
			const dd = Math.hypot(d[0] - p[0], d[1] - p[1])
			if (dd < bestD) { bestD = dd; best = d }
		}
	}
	return best
}

/** Move graph node `n` to drawn point p, IN PLACE (store mutation, like the grips): first snap onto a
 *  nearby node via `opts.snapNode` so runs join, then grid-round each coord via `opts.rnd`. In an
 *  elevation the drawn point sets the on-axis coord (via elevUInv) + z (GROUND − y); in plan, x/y.
 *  Returns the snap mark to show — null unless a node snap happened. */
export function graphNodeApply(ctx: ViewCtx, n: GN, p: Pt, opts: { snapNode: (p: Pt, exclude: GN, origin?: Pt) => Pt | null; rnd: (v: number) => number }, origin?: Pt): SnapHit | null {
	const q = opts.snapNode(p, n, origin) ?? p   // snap to a nearby node so runs join
	if (ctx.isElev) {
		const u = opts.rnd(elevUInv(ctx.elevDir, q[0], ctx.cx, ctx.cy))
		if (ELEV_BASIS[ctx.elevDir].axis === 0) n.x = u; else n.y = u
		n.z = Math.max(0, opts.rnd(ctx.ground - q[1]))
	} else { n.x = opts.rnd(q[0]); n.y = opts.rnd(q[1]) }
	return q === p ? null : { p: q, type: 'end' }
}

// ── elevation depth snap ──

/** A depth-snap hit: the off-axis (DEPTH) coord to use + the matched segment's projected endpoints (for
 *  the amber marker). */
export type DepthSnap = { off: number; a: Pt; b: Pt }

/** In an elevation, the visible wall/conduit SEGMENT whose projected line the drawn point p is nearest
 *  (within `tolMm`), giving the off-axis (DEPTH) coord there — so a conduit point can SNAP ONTO a wall's
 *  depth instead of the plan-centre default. Null in plan/iso or when nothing is within tolerance.
 *  (front/rear: on-axis = x, depth = y; left/right: on-axis = y, depth = x.) The match is done in MODEL
 *  space (on-axis coord + z), so it can't drift from how the model is rendered. */
export function elevDepthSnap(ctx: ViewCtx, p: Pt, tolMm: number, ml: MLayers): DepthSnap | null {
	const mdl = ctx.mdl; if (!ctx.isElev || !mdl) return null
	const ax = ELEV_BASIS[ctx.elevDir].axis
	const onC = (n: GN) => (ax === 0 ? n.x : n.y), offC = (n: GN) => (ax === 0 ? n.y : n.x)
	const pu = elevUInv(ctx.elevDir, p[0], ctx.cx, ctx.cy), pz = ctx.ground - p[1]   // the drawn point's model on-axis + z
	let best: DepthSnap | null = null, bestD = tolMm
	for (const o of mdl.objects) {
		if ((o.type !== 'wall' && o.type !== 'conduit') || !o.id || !ml.visible(o)) continue
		const nm = new Map((o.nodes as GN[]).map((n) => [n.id, n]))
		for (const s of o.segments as { a: string; b: string }[]) {
			const a = nm.get(s.a), b = nm.get(s.b); if (!a || !b) continue
			const a1 = onC(a), z1 = a.z, dx = onC(b) - a1, dz = b.z - z1, L2 = dx * dx + dz * dz || 1
			const t = Math.max(0, Math.min(1, ((pu - a1) * dx + (pz - z1) * dz) / L2))
			const d = Math.hypot(pu - (a1 + dx * t), pz - (z1 + dz * t))
			if (d < bestD) { bestD = d; best = { off: Math.round(offC(a) * (1 - t) + offC(b) * t), a: graphNodeDraw(ctx, a), b: graphNodeDraw(ctx, b) } }
		}
	}
	return best
}
