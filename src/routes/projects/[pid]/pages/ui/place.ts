// Entity / model-object BUILDERS extracted from ui/Viewport.svelte (review.md §R1, step 6). Everything here
// is PURE: a builder takes the ViewCtx + explicit arguments and RETURNS the new entity / object (or null when
// the tool / view doesn't produce one). The Viewport keeps the side effects — `on.add`, `addModelObj`, the
// guides push, toasts — and the 'Section' tool (B5: `on.section(clip)` stays with the caller until
// `sectionObj` lands). Ids come in as functions so the builders stay deterministic under test.
import type { Pt, Ent, ElevDir, DimMode } from './geometry'
import { ctxFrame, type ViewCtx } from './view'
import type { Obj, Guide, Model, Section, BoxSection, LineSection, Clip } from '../3dview/types'
import { frameAxis, frameStep, uToAlong, dist, translate } from './geometry'
import { centerCorners } from './annotations'
import { polyToGraph } from '../3dview/migrate'
import { isFlatElev } from './hit'

/** The DRAWING PLANE new 2D geometry lands in: undefined in plan (= the model/plan plane, see `onPlanPlane`),
 *  the ElevDir when drawn natively in an elevation. (Was Viewport's `drawPlane()`; iso draws nothing.) */
export const drawPlane = (ctx: ViewCtx): ElevDir | undefined => (ctx.isElev ? ctx.elevDir : undefined)

/** The model's layer id to file a new object under: `id` if the model has that layer, else its first OBJECT
 *  layer (no `group` — R5: the model's list also holds Background / annotation layers, which a wall or a
 *  desk must not fall onto), else its first layer. Undefined when the model has no layers. */
export const resolveLayer = (mdl: Model | undefined, id: string): string | undefined =>
	mdl?.layers?.find((l) => l.id === id)?.id ?? mdl?.layers?.find((l) => !l.group)?.id ?? mdl?.layers?.[0]?.id

/** The two-point DRAW tools that make a 2D entity. Rect / ellipse honour CEN (centre-out: the first point is
 *  the centre). Returns null for every other tool: 'Furniture' / 'Opening' are model prisms (see
 *  `PRISM_TOOL` + `prismObj`), 'Section' is B5's clip box, 'Text' is placed by its own editor. */
export function buildEnt(ctx: ViewCtx, tool: string, a: Pt, b: Pt, opts: { centerDraw: boolean; uid: () => string; /** the Dimension's mode (resolved: ui/dimSpec) — 'h' / 'v' stored, aligned left unset */ dimMode?: DimMode }): Ent | null {
	const plane = drawPlane(ctx)
	// R4: a 2-point polyline (the retired 'line' type's replacement). SEAM for a future command-line `LINE`
	// entry (AutoCAD-style typed command instead of a mouse click): it should build the exact same shape —
	// `{ type: 'polyline', pts: [a, b], plane }` — through this function or a shared helper, not a bespoke
	// 'line' path, so keyboard- and pointer-drawn lines stay identical entities.
	if (tool === 'Line') return { id: opts.uid(), type: 'polyline', pts: [a, b], plane }
	if (tool === 'Dimension') return { id: opts.uid(), type: 'dim', a, b, plane, ...(opts.dimMode === 'h' || opts.dimMode === 'v' ? { dimMode: opts.dimMode } : {}) }
	if (tool === 'Rectangle' || tool === 'Ellipse') {
		const [ra, rb] = opts.centerDraw ? centerCorners(a, b) : [a, b]
		return { id: opts.uid(), type: tool === 'Rectangle' ? 'rect' : 'ellipse', a: ra, b: rb, plane }
	}
	return null
}

/** The footprint-drag tools that make a model PRISM instead of an entity (plan view only): the layer it
 *  files under, its default height, and the id prefix. Openings default to a door (see `prismObj`). */
export const PRISM_TOOL: Record<string, { layer: string; h: number; tag: string }> = {
	Furniture: { layer: 'furniture', h: 750, tag: 'f' },
	Opening: { layer: 'openings', h: 2100, tag: 'o' },
}

/** Drop the zero-length tail a double-click / Enter leaves on a polyline draft (repeated last point). Pure —
 *  returns a new array; the input is untouched. */
export function trimTail(pts: Pt[]): Pt[] {
	let out = pts
	while (out.length >= 2 && dist(out[out.length - 1], out[out.length - 2]) < 0.01) out = out.slice(0, -1)
	return out
}

/** A finished Line-tool draft → a polyline entity (points copied), or null with fewer than 2 distinct
 *  points. The caller decides the tool gate (Line → this; Wall/Trunk/Pipe → `graphObj`). */
export function polylineEnt(ctx: ViewCtx, pts: Pt[], uid: () => string): Ent | null {
	const p = trimTail(pts)
	if (p.length < 2) return null
	return { id: uid(), type: 'polyline', pts: p.map((q) => [q[0], q[1]] as Pt), plane: drawPlane(ctx) }
}

/** The graph tools (Wall / Trunk / Pipe) and their default profiles + id prefixes. */
export const GRAPH_TOOL: Record<string, { kind: 'wall' | 'conduit'; layer: string; tag: string; profile: Record<string, number> }> = {
	Wall: { kind: 'wall', layer: 'walls', tag: 'w', profile: { h: 2800, thickness: 100 } },
	Trunk: { kind: 'conduit', layer: 'trunks', tag: 't', profile: { w: 300, h: 150, edges: 4 } },
	Pipe: { kind: 'conduit', layer: 'trunks', tag: 'p', profile: { w: 80, h: 80, edges: 16 } },
}

export type GraphOpts = {
	/** The SELECTED plan guide that fixes the off-axis depth when drawing in an elevation (null = none). */
	guide: Guide | null
	/** Elevation depth-snap: the off-axis coord a drawn point snaps onto (a nearby wall/conduit), or null.
	 *  Only consulted in an elevation with no guide. */
	depthSnap: (p: Pt) => number | null
	/** Id minter, called with the tool's prefix ('w' / 't' / 'p'). */
	uid: (prefix: string) => string
	/** F1: the conduit's profile + plan node height from the spec bar (ui/trunkSpec); unset = the tool's default. */
	profile?: { w: number; h: number; edges: number; z: number }
	/** Layer resolver (defaults to `resolveLayer(ctx.mdl, …)`). */
	layerId?: (id: string) => string | undefined
}

/** A clicked run of drawing points → a wall or conduit graph object with the tool's default profile, or
 *  null (unknown tool / fewer than 2 points). In PLAN the points are x/y at the tool's default height
 *  (walls on the floor, trunks/pipes at the model's ceiling-tile level, default 2600). In an ELEVATION the
 *  drawn point gives the on-axis coord (the view frame's `uToAlong`) and z (`ground − y`, clamped ≥ 0) — so a vertical run
 *  can be drawn — and the DEPTH (off-axis coord) comes from the selected plan guide, else the depth-snap,
 *  else the plan centre. The "no depth guide" toast and `addModelObj` stay with the caller. */
export function graphObj(ctx: ViewCtx, tool: string, pts: Pt[], opts: GraphOpts): Obj | null {
	const spec = GRAPH_TOOL[tool]
	if (!spec || pts.length < 2) return null
	const layerId = opts.layerId ?? ((id: string) => resolveLayer(ctx.mdl, id))
	const nodesZ = tool === 'Wall' ? 0 : (opts.profile?.z ?? ctx.mdl?.levels?.ceilingTile ?? 2600)
	const f = ctxFrame(ctx), ax = ctx.isElev ? frameAxis(f) : 0
	const toNode = (p: Pt) => {
		if (!ctx.isElev) return { x: Math.round(p[0]), y: Math.round(p[1]), z: nodesZ }
		const onAxis = Math.round(uToAlong(f, p[0])), z = Math.max(0, Math.round(ctx.ground - p[1]))
		// oblique: phase 5 — the depth is an axis-aligned model coord (a plan guide's y / x, the depth-snap's off-axis
		// coord, else the plan centre); an oblique view would place at frameInv(u, depth). (Not reached: an oblique view
		// doesn't draw walls / trunks until then — vpInteraction gates the graph tools.)
		const off = opts.guide ? opts.guide.pos : (opts.depthSnap(p) ?? (ax === 0 ? ctx.cy : ctx.cx))
		return ax === 0 ? { x: onAxis, y: off, z } : { x: off, y: onAxis, z }
	}
	const { nodes, segments } = polyToGraph(pts.map(toNode))
	const common = { nodes, segments, layer: layerId(spec.layer), id: opts.uid(spec.tag) }
	if (spec.kind === 'wall') return { type: 'wall', h: spec.profile.h, thickness: spec.profile.thickness, ...common }
	const pr = opts.profile ?? spec.profile
	return { type: 'conduit', w: pr.w, h: pr.h, edges: pr.edges, ...common }
}

/** A footprint drag (plan a→b) → a prism on `layer` with height `h` (whole mm, at least 1×1). An
 *  'openings' prism defaults to a DOOR (leaf + swing, h 2100) — the most common; change it in Properties.
 *  `extra` is spread last so a caller can override any field. `uid` is pre-bound with the id prefix. */
export function prismObj(ctx: ViewCtx, a: Pt, b: Pt, layer: string, h: number, uid: () => string, extra: Partial<Obj> = {}): Obj {
	const x = Math.round(Math.min(a[0], b[0])), y = Math.round(Math.min(a[1], b[1]))
	const w = Math.max(1, Math.round(Math.abs(b[0] - a[0]))), d = Math.max(1, Math.round(Math.abs(b[1] - a[1])))
	const opening = layer === 'openings' ? { open: 'door' as const, z: 0, h: 2100 } : {}
	return { type: 'prism', x, y, z: 0, w, d, h, edges: 4, layer: resolveLayer(ctx.mdl, layer), id: uid(), ...opening, ...extra } as Obj
}

/** The Section tool's cut box from a plan drag a→b (B5): a whole-mm, normalised clip spanning the floor to
 *  the model's ceiling slab (default 3200), sighted FRONT by default; re-aim it from the marker toolbar.
 *  Plan only — null elsewhere. The caller pushes it into `mdl.sections` as one model edit. */
export function sectionObj(ctx: ViewCtx, a: Pt, b: Pt, id: string, name: string): BoxSection | null {
	if (!ctx.isPlan) return null
	const clip: Clip = { x0: Math.round(Math.min(a[0], b[0])), y0: Math.round(Math.min(a[1], b[1])), z0: 0,
		x1: Math.round(Math.max(a[0], b[0])), y1: Math.round(Math.max(a[1], b[1])), z1: ctx.mdl?.levels?.ceilingSlab ?? 3200 }
	return { id, clip, dir: 'front', name }
}

/** The Section tool's LINE form (elevation-section-plan.md phase 3): the cut line a → b dragged / clicked on the plan
 *  (whole mm), looking to its left as drawn (ui/sectionLine.ts), `depth` mm deep, every height (no z band until set).
 *  Plan only, and not a zero-length line — null otherwise. `name` is the bare letter ("A" → labels A / A′). */
export function sectionLineObj(ctx: ViewCtx, a: Pt, b: Pt, id: string, name: string, depth: number): LineSection | null {
	if (!ctx.isPlan) return null
	const ra: [number, number] = [Math.round(a[0]), Math.round(a[1])], rb: [number, number] = [Math.round(b[0]), Math.round(b[1])]
	if (Math.hypot(rb[0] - ra[0], rb[1] - ra[1]) < 1) return null
	return { id, kind: 'line', a: ra, b: rb, depth: Math.max(1, Math.round(depth)), name }
}

/** The first letter A…Z no section of the model uses yet — a box's 'Section B' and a line's bare 'B' both count, so
 *  the two kinds share one sequence (deleting B and cutting again gives B back); past Z, a number. */
export function sectionLetter(existing: Section[]): string {
	const used = new Set(existing.flatMap((s) => (s.name ? [s.name, s.name.replace(/^Section /, '')] : [])))
	for (let i = 0; i < 26; i++) { const l = String.fromCharCode(65 + i); if (!used.has(l)) return l }
	return String(existing.length + 1)
}
/** 'Section A', 'Section B', … — a BOX section's name (`sectionLetter`). */
export const sectionName = (existing: Section[]): string => `Section ${sectionLetter(existing)}`

/** A guide dropped at `p` in this view: horizontal (constant y) or vertical (constant x), on the view's
 *  drawing plane ('plan' or the ElevDir). Null in iso (no drawing plane). */
export function guideObj(ctx: ViewCtx, p: Pt, vertical: boolean, id: string): Guide | null {
	const plane = ctx.isPlan ? 'plan' : ctx.isElev ? ctx.elevDir : null
	if (!plane) return null
	const orient = vertical ? 'v' : 'h'
	return { id, plane, orient, pos: Math.round(orient === 'h' ? p[1] : p[0]) }
}

/** IMAGE calibration — ORIGIN: the clicked point as a normalised (0..1) anchor inside the placement rect.
 *  Non-image entities come back unchanged. */
export function imageWithOrigin(img: Ent, p: Pt): Ent {
	if (img.type !== 'image' || !img.a || !img.b) return img
	const rx = Math.min(img.a[0], img.b[0]), ry = Math.min(img.a[1], img.b[1])
	const rw = Math.abs(img.b[0] - img.a[0]) || 1, rh = Math.abs(img.b[1] - img.a[1]) || 1
	const c01 = (v: number) => Math.max(0, Math.min(1, v))
	return { ...img, origin: { x: c01((p[0] - rx) / rw), y: c01((p[1] - ry) / rh) } }
}

/** IMAGE calibration — SCALE: resize the placement (a→b) by `real / measured` about the origin anchor (or
 *  the rect centre when none), so a measured distance reads `real` model mm; the anchor stays fixed.
 *  Unchanged when either distance is not > 0 or the entity is not an image. */
export function imageScaled(img: Ent, measured: number, real: number): Ent {
	if (img.type !== 'image' || !img.a || !img.b || !(real > 0) || !(measured > 0)) return img
	const f = real / measured
	const rx = Math.min(img.a[0], img.b[0]), ry = Math.min(img.a[1], img.b[1]), rw = Math.abs(img.b[0] - img.a[0]), rh = Math.abs(img.b[1] - img.a[1])
	const ax = img.origin ? rx + img.origin.x * rw : rx + rw / 2, ay = img.origin ? ry + img.origin.y * rh : ry + rh / 2
	const na: Pt = [ax + (img.a[0] - ax) * f, ay + (img.a[1] - ay) * f]
	const nb: Pt = [ax + (img.b[0] - ax) * f, ay + (img.b[1] - ay) * f]
	return { ...img, a: na, b: nb }
}

/** Move an entity by a drawing-space delta. In an ELEVATION the horizontal drag of a FLAT kind maps to the
 *  view's footprint axis (x for front/rear, y for left/right, mirrored by the dir's sign) and the vertical
 *  drag is dropped (a ground-line flat has no height to move). Everything else translates normally.
 *  (Ported as-is: the flat test is by KIND only, not `isFlatElev`, so a rect drawn natively in an elevation
 *  also takes this branch — see the pinned test.) */
export function moveEnt(ctx: ViewCtx, en: Ent, dx: number, dy: number): Ent {
	if (isFlatElev(ctx, en)) {   // B24: only a PLAN-plane flat is edge-on here; an elevation-native shape translates freely
		const [sx, sy] = frameStep(ctxFrame(ctx), dx)   // the drag along the view's horizontal, as a plan step
		return translate(en, sx, sy)
	}
	return translate(en, dx, dy)
}
