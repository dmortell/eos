// Hit-testing extracted from ui/Viewport.svelte (review.md §R1, step 3). The pure primitives below take
// no component state; the view-dependent functions (isFlatElev/flatXSpan/rotCenter/bbox/hitEnt/pickable)
// take a ViewCtx as their first argument instead of reading the component's closures, so everything here
// is unit-testable and shared by hit-testing, grips and the render snippets.
import type { Pt, Ent } from './geometry'
import type { ViewCtx, MLayers } from './view'
import type { Obj } from '../3dview/types'
import { flatSpan, segDist, textBox, elevU, ELEV_BASIS } from './geometry'
import { isoBounds, isoR, faces3d, isoDepthR, prismRings } from '../3dview/projection'

const PT_MM = 0.352778   // mm per typographic point → fontPt · PT_MM = paper mm (matches Viewport/geometry)
// Flat (z=0, no height) object kinds that project to an edge-on ground line in elevation.
const FLAT = new Set(['line', 'polyline', 'dim', 'rect', 'ellipse'])

/** Rotate `p` about centre `c` by `deg` degrees (CW in screen/plan space, y-down). Pure. */
export function rotatePt(p: Pt, c: Pt, deg: number): Pt {
	const a = deg * Math.PI / 180, s = Math.sin(a), co = Math.cos(a), dx = p[0] - c[0], dy = p[1] - c[1]
	return [c[0] + dx * co - dy * s, c[1] + dx * s + dy * co]
}

/** A shape counts as FILLED (pickable anywhere inside) when it has a real fill, not 'none'. */
export const isFilled = (e: Ent): boolean => !!e.fill && e.fill !== 'none'

/** Is `p` within `thr` of the rect [x0,y0]-[x1,y1]? A FILLED rect picks anywhere inside; an unfilled
 *  one picks only within `thr` of the border band (the empty interior is not a hitbox, like CAD). */
export function inBox(p: Pt, x0: number, y0: number, x1: number, y1: number, thr: number, filled: boolean): boolean {
	const outer = p[0] >= x0 - thr && p[0] <= x1 + thr && p[1] >= y0 - thr && p[1] <= y1 + thr
	if (!outer) return false
	if (filled) return true
	const inner = p[0] > x0 + thr && p[0] < x1 - thr && p[1] > y0 + thr && p[1] < y1 - thr
	return !inner   // within the border band only
}

/** Object SPACE: a 'plan'/undefined entity lives in model/plan space (projected into every elevation,
 *  layer-gated); an ElevDir entity is drawn natively in that one elevation. True for the plan-space case. */
export const onPlanPlane = (e: Ent): boolean => !e.plane || e.plane === 'plan'

// ── view-dependent hit-testing (take a ViewCtx; see ui/view.ts) ──

/** A viewport-local (view:<frameId>) annotation shows only in its own frame; a model-scoped one shows in
 *  every view. `ctx.frameId` is this viewport's id (undefined for a model-layout tab → only model-scoped). */
export const inScope = (ctx: ViewCtx, e: Ent): boolean => !e.space || e.space === 'model' || e.space === 'view:' + ctx.frameId

/** In-view = the object's DRAWING PLANE matches this view (plan projects into every elevation as a ground
 *  line; an elevation-native object shows only in that elevation) AND its scope includes this frame. */
export const inThisView = (ctx: ViewCtx, e: Ent): boolean => inScope(ctx, e) && (onPlanPlane(e) || e.plane === ctx.dir)

/** A plan-plane 2D shape shown in the 3D ISO view is PROJECTED onto the ground plane (z=0); it renders
 *  (foreshortened) but isn't interactive there (edit it in plan/elevation). */
export const groundInIso = (ctx: ViewCtx, e: Ent): boolean => ctx.isIso && onPlanPlane(e)

/** A flat (z=0) plan object collapses to the ground line in an elevation view. */
export const isFlatElev = (ctx: ViewCtx, e: Ent): boolean => ctx.isElev && FLAT.has(e.type) && onPlanPlane(e)

/** Horizontal drawing span of a flat object projected onto the ground line for the current side view. */
export function flatXSpan(ctx: ViewCtx, e: Ent): [number, number] { return flatSpan(e, ctx.elevDir, ctx.cx, ctx.cy) }

/** An entity's UNrotated view-bbox (drawing units). Handles elevation ground-line collapse, image crop
 *  windows, polyline extents and the text box; the a/b default covers line/rect/ellipse. */
export function bbox(ctx: ViewCtx, e: Ent): [number, number, number, number] {
	if (isFlatElev(ctx, e)) { const [x0, x1] = flatXSpan(ctx, e); return [x0, ctx.ground - 2, x1, ctx.ground + 2] }
	if (e.type === 'polyline') { const pts = e.pts ?? []; const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }
	if (e.type === 'text') return textBox(e, PT_MM * ctx.paperMm)
	if (e.type === 'image' && e.crop) {   // the VISIBLE extent is the crop window, not the full placement
		const rx = Math.min(e.a![0], e.b![0]), ry = Math.min(e.a![1], e.b![1]), rw = Math.abs(e.b![0] - e.a![0]), rh = Math.abs(e.b![1] - e.a![1])
		return [rx + e.crop.x * rw, ry + e.crop.y * rh, rx + (e.crop.x + e.crop.w) * rw, ry + (e.crop.y + e.crop.h) * rh]
	}
	const xs = [e.a![0], e.b![0]], ys = [e.a![1], e.b![1]]
	return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

/** Rotation pivot = the UNrotated bbox centre (render, hit and grips all rotate about it). */
export const rotCenter = (ctx: ViewCtx, e: Ent): Pt => { const [x0, y0, x1, y1] = bbox(ctx, e); return [(x0 + x1) / 2, (y0 + y1) / 2] }

/** Is point `p` within `thr` (drawing units) of entity `e`? Tests in the entity's un-rotated frame; a
 *  closed unfilled shape hits on its outline only, a filled one anywhere inside. */
export function hitEnt(ctx: ViewCtx, e: Ent, p: Pt, thr: number): boolean {
	if (e.rot) p = rotatePt(p, rotCenter(ctx, e), -e.rot)   // test in the entity's un-rotated frame
	if (isFlatElev(ctx, e)) { const [x0, x1] = flatXSpan(ctx, e); return segDist(p, [x0, ctx.ground], [x1, ctx.ground]) < thr }
	if (e.type === 'polyline') { const pts = e.pts ?? []; for (let i = 0; i + 1 < pts.length; i++) if (segDist(p, pts[i], pts[i + 1]) < thr) return true; return false }
	if (e.type === 'line' || e.type === 'dim') return segDist(p, e.a!, e.b!) < thr
	if (e.type === 'image') { const [x0, y0, x1, y1] = bbox(ctx, e); return inBox(p, x0, y0, x1, y1, thr, true) }   // pick anywhere inside the VISIBLE (crop-window) extent
	if (e.type === 'rect') { const x0 = Math.min(e.a![0], e.b![0]), y0 = Math.min(e.a![1], e.b![1]), x1 = Math.max(e.a![0], e.b![0]), y1 = Math.max(e.a![1], e.b![1]); return inBox(p, x0, y0, x1, y1, thr, isFilled(e)) }
	if (e.type === 'ellipse') {
		const cx = (e.a![0] + e.b![0]) / 2, cy = (e.a![1] + e.b![1]) / 2
		const hx = Math.abs(e.b![0] - e.a![0]) / 2, hy = Math.abs(e.b![1] - e.a![1]) / 2
		const outer = ((p[0] - cx) / ((hx + thr) || 1)) ** 2 + ((p[1] - cy) / ((hy + thr) || 1)) ** 2 <= 1
		if (!outer) return false
		if (isFilled(e)) return true
		const inner = ((p[0] - cx) / ((hx - thr) || 1)) ** 2 + ((p[1] - cy) / ((hy - thr) || 1)) ** 2 < 1
		return !inner   // ring band around the outline only
	}
	if (e.type === 'text') { const [x0, y0, x1, y1] = bbox(ctx, e); return p[0] >= x0 - thr && p[0] <= x1 + thr && p[1] >= y0 - thr && p[1] <= y1 + thr }
	return false
}

/** A pickable entity: in this view, on a shown+unlocked layer, and not an ISO ground projection. `layers`
 *  supplies the project-layer visibility/lock predicates (from layers.svelte today; from the model after R5). */
export function pickable(ctx: ViewCtx, e: Ent, layers: { hidden(id?: string): boolean; locked(id?: string): boolean }): boolean {
	return inThisView(ctx, e) && !layers.hidden(e.layer) && !layers.locked(e.layer) && !groundInIso(ctx, e)
}

// ── model-object hit-testing (prisms + wall/conduit graphs) ──
// These pick MODEL objects (Obj), not annotation Ents. `ml` carries the model-layer visibility/lock
// predicates. projU/projUInv (the elevation horizontal projection) are inlined from ctx via elevU.

/** A wall/conduit vertex in model space. */
export type GN = { id: string; x: number; y: number; z: number }

/** A prism's drawing-space AABB in the CURRENT view: plan = footprint [x..x+w]×[y..y+d]; elevation =
 *  silhouette face (on-axis extent via elevU, standing on GROUND from z to z+h). null off-view/non-prism. */
export function prismRect(ctx: ViewCtx, o: Obj): { x0: number; y0: number; x1: number; y1: number } | null {
	if (o.type !== 'prism') return null
	if (ctx.isElev) {
		const ax = ELEV_BASIS[ctx.elevDir].axis
		const lo = ax === 0 ? o.x : o.y, hi = lo + (ax === 0 ? o.w : o.d)
		const u0 = elevU(ctx.elevDir, lo, ctx.cx, ctx.cy), u1 = elevU(ctx.elevDir, hi, ctx.cx, ctx.cy), base = ctx.ground - o.z
		return { x0: Math.min(u0, u1), y0: base - o.h, x1: Math.max(u0, u1), y1: base }
	}
	if (ctx.isPlan) return { x0: o.x, y0: o.y, x1: o.x + o.w, y1: o.y + o.d }
	return null
}

/** Is a prism tilted out of the vertical (rotX/rotY)? Its silhouette is then a leaning hull (B10). */
export const prismTilted = (o: Obj): boolean => o.type === 'prism' && !!((o.rotX ?? 0) || (o.rotY ?? 0))

/** A tilted prism's silhouette in the CURRENT view's drawing coords (convex hull of the projected 3D
 *  corners) — matches what project()/Model3d draw, so pick + grips sit on the shape. */
export function prismOutline(ctx: ViewCtx, o: Extract<Obj, { type: 'prism' }>): Pt[] {
	const { bot, top } = prismRings(o)
	const ax = ctx.isElev ? ELEV_BASIS[ctx.elevDir].axis : 0
	const pts: Pt[] = [...bot, ...top].map((c) => ctx.isElev ? [elevU(ctx.elevDir, ax === 0 ? c.x : c.y, ctx.cx, ctx.cy), ctx.ground - c.z] : [c.x, c.y])
	return convexHull(pts)
}

/** Convex hull (monotone chain) of drawing-coord points — the silhouette outline. */
function convexHull(pts: Pt[]): Pt[] {
	const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
	if (p.length < 3) return p
	const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
	const lo: Pt[] = []; for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q) }
	const up: Pt[] = []; for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q) }
	lo.pop(); up.pop(); return lo.concat(up)
}

/** Point-in-polygon (ray cast), drawing coords. */
function inPoly(pt: Pt, poly: Pt[]): boolean {
	let c = false
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c }
	return c
}

/** A graph node (wall/conduit vertex) → drawing coords for the current view (plan x/y; elevation on-axis
 *  via elevU + GROUND−z). */
export function graphNodeDraw(ctx: ViewCtx, n: GN): Pt {
	if (ctx.isElev) { const ax = ELEV_BASIS[ctx.elevDir].axis; return [elevU(ctx.elevDir, ax === 0 ? n.x : n.y, ctx.cx, ctx.cy), ctx.ground - n.z] }
	return [n.x, n.y]
}

/** Any wall/conduit segment under p (drawing coords): distance to the drawn centreline within thr + half
 *  the profile width, so clicking anywhere on the ribbon selects. */
export function graphHit(ctx: ViewCtx, o: Extract<Obj, { type: 'wall' | 'conduit' }>, p: Pt, thr: number): boolean {
	const nm = new Map((o.nodes as GN[]).map((n) => [n.id, n]))
	const half = ((o.type === 'wall' ? o.thickness : o.w) ?? 0) / 2
	for (const s of o.segments as { a: string; b: string }[]) {
		const a = nm.get(s.a), b = nm.get(s.b); if (!a || !b) continue
		if (segDist(p, graphNodeDraw(ctx, a), graphNodeDraw(ctx, b)) < thr + half) return true
	}
	return false
}

/** Topmost model object under p (drawing coords): a prism (footprint/face AABB, rot-aware in plan, or the
 *  tilted silhouette) or a wall/conduit graph. `thrMm` = pick tolerance in unscaled model mm. */
export function hitModel(ctx: ViewCtx, p: Pt, thrMm: number, ml: MLayers): string | null {
	const mdl = ctx.mdl
	if (!(ctx.isPlan || ctx.isElev) || !mdl) return null
	const thr = thrMm
	for (let i = mdl.objects.length - 1; i >= 0; i--) {
		const o = mdl.objects[i]
		if (!o.id || !ml.visible(o) || ml.locked(o)) continue
		if (o.type === 'wall' || o.type === 'conduit') { if (graphHit(ctx, o, p, thr)) return o.id; continue }
		if (o.type !== 'prism') continue
		if (prismTilted(o)) { if (inPoly(p, prismOutline(ctx, o))) return o.id; continue }   // tilted → true silhouette (B10)
		if (ctx.isPlan && o.rot) {
			const cx = o.x + o.w / 2, cy = o.y + o.d / 2, q = rotatePt(p, [cx, cy], -o.rot)
			if (q[0] >= o.x - thr && q[0] <= o.x + o.w + thr && q[1] >= o.y - thr && q[1] <= o.y + o.d + thr) return o.id
			continue
		}
		const r = prismRect(ctx, o); if (!r) continue
		if (p[0] >= r.x0 - thr && p[0] <= r.x1 + thr && p[1] >= r.y0 - thr && p[1] <= r.y1 + thr) return o.id
	}
	return null
}

/** 3D (iso) PICK: the frontmost object whose projected 3D face contains p — reproduces Model3d's iso
 *  projection (isoR + the centring xform) and picks the smallest camera depth AT the click point. */
export function hitModelIso(ctx: ViewCtx, p: Pt, ml: MLayers): string | null {
	const mdl = ctx.mdl
	if (!mdl) return null
	const b = isoBounds(mdl.objects, ctx.yaw, ctx.pitch, ctx.cx, ctx.cy, ml.visible); if (!b) return null
	const D = (v: { x: number; y: number; z: number }): Pt => { const q = isoR(v, ctx.yaw, ctx.pitch, ctx.cx, ctx.cy); return [q.u + ctx.cx - b.icx, -q.v + ctx.cy + b.icy] }
	let best: string | null = null, bestDepth = Infinity
	for (const o of mdl.objects) {
		if (!o.id || !ml.visible(o) || ml.locked(o)) continue
		for (const f of faces3d(o)) {
			if (f.pts.length < 3) continue
			const D3 = f.pts.map(D)
			if (!inPoly(p, D3)) continue
			// True depth AT the click point (depth is affine in the projected plane): interpolate from the
			// first 3 verts so a big face no longer beats a nearer small one.
			const d0 = D3[0], d1 = D3[1], d2 = D3[2]
			const v0x = d1[0] - d0[0], v0y = d1[1] - d0[1], v1x = d2[0] - d0[0], v1y = d2[1] - d0[1]
			const den = v0x * v1y - v1x * v0y; if (Math.abs(den) < 1e-6) continue
			const v2x = p[0] - d0[0], v2y = p[1] - d0[1]
			const bb = (v2x * v1y - v1x * v2y) / den, cc = (v0x * v2y - v2x * v0y) / den
			const z0 = isoDepthR(f.pts[0], ctx.yaw, ctx.pitch, ctx.cx, ctx.cy), z1 = isoDepthR(f.pts[1], ctx.yaw, ctx.pitch, ctx.cx, ctx.cy), z2 = isoDepthR(f.pts[2], ctx.yaw, ctx.pitch, ctx.cx, ctx.cy)
			const depth = (1 - bb - cc) * z0 + bb * z1 + cc * z2
			if (depth < bestDepth) { bestDepth = depth; best = o.id }
		}
	}
	return best
}
