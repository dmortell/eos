// Hit-testing extracted from ui/Viewport.svelte (review.md §R1, step 3). The pure primitives below take
// no component state; the view-dependent functions (isFlatElev/flatXSpan/rotCenter/bbox/hitEnt/pickable)
// take a ViewCtx as their first argument instead of reading the component's closures, so everything here
// is unit-testable and shared by hit-testing, grips and the render snippets.
import type { Pt, Ent } from './geometry'
import { insertBounds } from './blocks'
import type { ViewCtx, MLayers } from './view'
import type { Obj, Clip, Guide } from '../3dview/types'
import { flatSpan, segDist, textBox } from './geometry'
import { isoBounds, faces3d, isoDepthR, project, viewMap, type ViewMap } from '../3dview/projection'
import { PT_MM } from '../constants'

// Flat (z=0, no height) object kinds that project to an edge-on ground line in elevation. Exported so
// place.ts (moveEnt) shares this one definition instead of keeping a private copy. (R4: 'line' retired —
// a straight entity is a 2-point 'polyline' now, already covered by the 'polyline' entry below.)
export const FLAT = new Set(['polyline', 'dim', 'rect', 'ellipse'])
export const isFlat = (e: Ent): boolean => FLAT.has(e.type)

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
	&& !(e.type === 'insert' && ctx.isElev && onPlanPlane(e))   // plan block symbols (outlets) aren't drawn in elevations

/** A plan-plane 2D shape shown in the 3D ISO view is PROJECTED onto the ground plane (z=0); it renders
 *  (foreshortened) but isn't interactive there (edit it in plan/elevation). */
export const groundInIso = (ctx: ViewCtx, e: Ent): boolean => ctx.isIso && onPlanPlane(e)

/** A flat (z=0) plan object collapses to the ground line in an elevation view. */
export const isFlatElev = (ctx: ViewCtx, e: Ent): boolean => ctx.isElev && FLAT.has(e.type) && onPlanPlane(e)

/** Horizontal drawing span of a flat object projected onto the ground line for the current side view. */
export function flatXSpan(ctx: ViewCtx, e: Ent): [number, number] { return flatSpan(e, ctx.elevDir, ctx.cx, ctx.cy) }

/** An entity's UNrotated view-bbox (drawing units). Handles elevation ground-line collapse, image crop
 *  windows, polyline extents and the text box; the a/b default covers dim/rect/ellipse/image. */
export function bbox(ctx: ViewCtx, e: Ent): [number, number, number, number] {
	if (isFlatElev(ctx, e)) { const [x0, x1] = flatXSpan(ctx, e); return [x0, ctx.ground - 2, x1, ctx.ground + 2] }
	if (e.type === 'polyline') { const pts = e.pts ?? []; const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }
	if (e.type === 'text') return textBox(e, PT_MM * ctx.paperMm)
	if (e.type === 'insert') return insertBounds(e, ctx.paperMm, ctx.mdl)   // its block's extent, scaled (an annotative one × N), at the insertion point
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
	if (e.type === 'dim') return segDist(p, e.a!, e.b!) < thr
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
	if (e.type === 'insert') { const [x0, y0, x1, y1] = bbox(ctx, e); return inBox(p, x0, y0, x1, y1, thr, true) }   // pick anywhere on the symbol
	return false
}

/** A pickable entity: in this view, on a shown+unlocked layer, and not an ISO ground projection. `layers`
 *  supplies the project-layer visibility/lock predicates (from layers.svelte today; from the model after R5). */
export function pickable(ctx: ViewCtx, e: Ent, layers: { hidden(id?: string): boolean; locked(id?: string): boolean }): boolean {
	return inThisView(ctx, e) && !layers.hidden(e.layer) && !layers.locked(e.layer) && !groundInIso(ctx, e)
}

// ── model-object hit-testing (prisms + wall/conduit graphs) ──
// These pick MODEL objects (Obj), not annotation Ents. `ml` carries the model-layer visibility/lock
// predicates. R7: every model point -> drawing mapping goes through `viewMapOf(ctx)` — the SAME
// `projection.viewMap` Model3d renders with — and picking tests the `project()` outline Model3d draws.

/** This view's model -> drawing mapping (R7). Iso needs the content box it is centred on (`isoBounds`). */
export const viewMapOf = (ctx: ViewCtx, isoBox: { icx: number; icy: number } | null = null): ViewMap =>
	viewMap(ctx.dir, ctx.cx, ctx.cy, ctx.ground, ctx.yaw, ctx.pitch, isoBox)

/** A wall/conduit vertex in model space. */
export type GN = { id: string; x: number; y: number; z: number }

/** A prism's drawing-space AABB in the CURRENT view — the box its EDIT grips sit on (unrotated: the
 *  x/y/w/d/z/h it edits): plan = footprint [x..x+w]×[y..y+d]; elevation = its on-axis extent standing
 *  from z to z+h, via the view's `viewMap` (R7). null off-view/non-prism. (Picking uses the DRAWN
 *  outline instead — see `hitModel`.) */
export function prismRect(ctx: ViewCtx, o: Obj): { x0: number; y0: number; x1: number; y1: number } | null {
	if (o.type !== 'prism') return null
	if (ctx.isElev) {
		const vm = viewMapOf(ctx)
		const [u0, y1] = vm.toDraw({ x: o.x, y: o.y, z: o.z }), [u1, y0] = vm.toDraw({ x: o.x + o.w, y: o.y + o.d, z: o.z + o.h })
		return { x0: Math.min(u0, u1), y0, x1: Math.max(u0, u1), y1 }
	}
	if (ctx.isPlan) return { x0: o.x, y0: o.y, x1: o.x + o.w, y1: o.y + o.d }
	return null
}

/** Is a prism tilted out of the vertical (rotX/rotY)? Its silhouette is then a leaning hull (B10). */
export const prismTilted = (o: Obj): boolean => o.type === 'prism' && !!((o.rotX ?? 0) || (o.rotY ?? 0))

/** A prism's silhouette in the CURRENT view's drawing coords — the outline `project()` gives Model3d
 *  (the footprint polygon in plan, rot-aware; the face box when upright in an elevation; the leaning hull
 *  when tilted, B10), mapped through the view's `viewMap` (R7). Plan / elevation only. */
export function prismOutline(ctx: ViewCtx, o: Extract<Obj, { type: 'prism' }>): Pt[] {
	const vm = viewMapOf(ctx)
	return convexHull(project(o, ctx.dir).flatMap((sh) => sh.pts.map((q) => vm.uvToDraw(q) as Pt)))
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
/** Inside the polygon, or within `thr` of its outline (so a thin or edge-on shape stays pickable). */
function nearPoly(pt: Pt, poly: Pt[], thr: number): boolean {
	if (poly.length >= 3 && inPoly(pt, poly)) return true
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if (segDist(pt, poly[j], poly[i]) <= thr) return true
	return false
}

/** A graph node (wall/conduit vertex) → drawing coords for the current view (plan x/y; elevation the
 *  re-centred on-axis coord + GROUND − z) — through the view's `viewMap` (R7). Plan / elevation only. */
export function graphNodeDraw(ctx: ViewCtx, n: GN): Pt {
	return viewMapOf(ctx).toDraw(n)
}

/** Any wall/conduit segment under p (drawing coords). In PLAN: distance to the drawn centreline within
 *  thr + half the profile width, so clicking anywhere on the ribbon selects. In an ELEVATION (B23) the
 *  drawn FACE picks: p inside any segment's projected box (the same `project()` outline Model3d draws,
 *  mapped v-up → ground − v with the elevU centring), so a 2800-tall wall is selectable anywhere on its
 *  face — the centreline test stays as the fallback for edge-on / thin runs. */
export function graphHit(ctx: ViewCtx, o: Extract<Obj, { type: 'wall' | 'conduit' }>, p: Pt, thr: number): boolean {
	if (ctx.isElev) {
		const vm = viewMapOf(ctx)   // R7: the same engine -> drawing mapping Model3d renders with
		for (const sh of project(o, ctx.elevDir)) {
			if (sh.closed && sh.pts.length >= 3 && inPoly(p, sh.pts.map((q) => vm.uvToDraw(q) as Pt))) return true
		}
	}
	const nm = new Map((o.nodes as GN[]).map((n) => [n.id, n]))
	const half = ((o.type === 'wall' ? o.thickness : o.w) ?? 0) / 2
	for (const s of o.segments as { a: string; b: string }[]) {
		const a = nm.get(s.a), b = nm.get(s.b); if (!a || !b) continue
		if (segDist(p, graphNodeDraw(ctx, a), graphNodeDraw(ctx, b)) < thr + half) return true
	}
	return false
}

/** Topmost model object under p (drawing coords): a prism whose DRAWN outline (`prismOutline` — the
 *  `project()` shape Model3d paints, so rotation, tilt and odd edge counts come for free, R7) contains p
 *  or lies within `thrMm` of it, or a wall/conduit graph. `thrMm` = pick tolerance in unscaled model mm. */
export function hitModel(ctx: ViewCtx, p: Pt, thrMm: number, ml: MLayers): string | null {
	const mdl = ctx.mdl
	if (!(ctx.isPlan || ctx.isElev) || !mdl) return null
	const thr = thrMm
	for (let i = mdl.objects.length - 1; i >= 0; i--) {
		const o = mdl.objects[i]
		if (!o.id || !ml.visible(o) || ml.locked(o)) continue
		if (o.type === 'wall' || o.type === 'conduit') { if (graphHit(ctx, o, p, thr)) return o.id; continue }
		if (o.type !== 'prism') continue
		if (nearPoly(p, prismOutline(ctx, o), thr)) return o.id
	}
	return null
}

/** One pickable iso face: its object, its drawing-space polygon and its mean camera depth — the key
 *  Model3d paints by (farthest first), so the face drawn on top is the one with the smallest depth. */
export type IsoPickFace = { id: string; pts: Pt[]; depth: number }

/** Every pickable (visible, unlocked) object's 3D faces, projected with Model3d's iso mapping (R7
 *  `viewMapOf` — camera + content-box centring). P4: the Viewport computes this ONCE per model / orbit /
 *  layer change (a `$derived`) instead of re-projecting every face of every object on each click. */
export function isoPickFaces(ctx: ViewCtx, ml: MLayers): IsoPickFace[] {
	const mdl = ctx.mdl
	if (!mdl) return []
	const b = isoBounds(mdl.objects, ctx.yaw, ctx.pitch, ctx.cx, ctx.cy, ml.visible); if (!b) return []
	const vm = viewMapOf(ctx, b)
	const depth = (v: { x: number; y: number; z: number }) => isoDepthR(v, ctx.yaw, ctx.pitch, ctx.cx, ctx.cy)
	const out: IsoPickFace[] = []
	for (const o of mdl.objects) {
		if (!o.id || !ml.visible(o) || ml.locked(o)) continue
		for (const f of faces3d(o)) {
			if (f.pts.length < 3) continue
			out.push({ id: o.id, pts: f.pts.map((v) => vm.toDraw(v)), depth: f.pts.reduce((s, v) => s + depth(v), 0) / f.pts.length })
		}
	}
	return out
}

/** 3D (iso) PICK over precomputed faces: the object whose face is PAINTED ON TOP at p — the same mean-depth
 *  order Model3d's painter's algorithm draws in, so a click selects what you see. (Was the true depth at
 *  the click point, which let an enclosing box — a rack cabinet — win over the device slabs drawn over
 *  it, so the devices could never be picked in 3D.) */
export function hitIsoFaces(faces: IsoPickFace[], p: Pt): string | null {
	let best: string | null = null, bestDepth = Infinity
	for (const f of faces) {
		if (f.depth >= bestDepth || !inPoly(p, f.pts)) continue
		bestDepth = f.depth; best = f.id
	}
	return best
}

/** 3D (iso) PICK in one call — `isoPickFaces` + `hitIsoFaces` (tests / one-off callers; the Viewport keeps
 *  the faces in a `$derived`). */
export function hitModelIso(ctx: ViewCtx, p: Pt, ml: MLayers): string | null {
	return hitIsoFaces(isoPickFaces(ctx, ml), p)
}

// ── section markers, guides, marquee ──

/** A section clip's 4 corners in drawing coords, order tl,tr,br,bl (normalised min→max). */
export function sectionCorners(c: Clip): Pt[] {
	const x0 = Math.min(c.x0, c.x1), x1 = Math.max(c.x0, c.x1), y0 = Math.min(c.y0, c.y1), y1 = Math.max(c.y0, c.y1)
	return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
}

/** What hitSection needs of a section marker (kept minimal so it is testable with a literal list). */
export type SectionLike = { id: string; clip: Clip }

/** A section marker under p (plan only): its box BORDER within thrMm (the interior stays free for model/
 *  entity picks). Returns the section id, topmost (last-drawn) first. */
export function hitSection(ctx: ViewCtx, sections: SectionLike[], p: Pt, thrMm: number): string | null {
	if (!ctx.isPlan || !sections.length) return null
	for (let i = sections.length - 1; i >= 0; i--) {
		const c = sections[i].clip
		const corners: Pt[] = [[c.x0, c.y0], [c.x1, c.y0], [c.x1, c.y1], [c.x0, c.y1]]
		for (let k = 0; k < 4; k++) if (segDist(p, corners[k], corners[(k + 1) % 4]) < thrMm) return sections[i].id
	}
	return null
}

/** A guide under p: within thrMm of its line (h → compare y, v → compare x). Topmost first. */
export function hitGuide(guides: Guide[], p: Pt, thrMm: number): string | null {
	for (let i = guides.length - 1; i >= 0; i--) { const g = guides[i]; if (Math.abs((g.orient === 'h' ? p[1] : p[0]) - g.pos) < thrMm) return g.id }
	return null
}

/** Marquee selection ids: the a→b box selects entities. A right→left drag (b[0] < a[0]) is CROSSING
 *  (any intersection); left→right is WINDOW (fully enclosed). `isPickable` gates on layer/view (the
 *  Viewport's pickable). Group expansion stays with the caller. */
export function marqueeSelect(ctx: ViewCtx, ents: Ent[], a: Pt, b: Pt, isPickable: (e: Ent) => boolean): string[] {
	const x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]), x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1])
	const crossing = b[0] < a[0]
	return ents.filter((en) => {
		if (!isPickable(en)) return false
		const [bx0, by0, bx1, by1] = bbox(ctx, en)
		return crossing ? bx0 <= x1 && bx1 >= x0 && by0 <= y1 && by1 >= y0 : bx0 >= x0 && bx1 <= x1 && by0 >= y0 && by1 <= y1
	}).map((en) => en.id)
}
