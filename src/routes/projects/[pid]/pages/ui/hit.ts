// Hit-testing extracted from ui/Viewport.svelte (review.md §R1, step 3). The pure primitives below take
// no component state; the view-dependent functions (isFlatElev/flatXSpan/rotCenter/bbox/hitEnt/pickable)
// take a ViewCtx as their first argument instead of reading the component's closures, so everything here
// is unit-testable and shared by hit-testing, grips and the render snippets.
import type { Pt, Ent } from './geometry'
import type { ViewCtx } from './view'
import { flatSpan, segDist, textBox } from './geometry'

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
