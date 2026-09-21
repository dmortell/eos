// Pure geometry for the Pages tool — no component state, so it's unit-testable and shared by
// Viewport.svelte and PropertiesPanel.svelte (see review.md §4.1/§5). The view-dependent helpers
// (hit-testing, grips, bbox per projection) stay in Viewport because they read the viewport `kind`.

export type Pt = [number, number]
// 'box' = a mock 3D cuboid: a,b = plan footprint · h = height · z0 = base elevation (height off the
// ground). In elevation the box is placed by x (from the footprint) + z0/h, so its plan DEPTH
// (footprint y) is independent of its elevation position.
export type TextAlign = 'left' | 'center' | 'right'
// Style props mirror the Sheets annotation model (fontPt/align/color/fill/weight) so an object can
// match Sheets' defaults; all optional → unset falls back to the tool defaults (see STYLE_DEFAULTS).
export type VAlign = 'top' | 'middle' | 'bottom'
export type Ent = { id: string; type: 'line' | 'rect' | 'circle' | 'ellipse' | 'dim' | 'text' | 'box' | 'polyline' | 'image'; a?: Pt; b?: Pt; c?: Pt; r?: number; h?: number; z0?: number; text?: string; pts?: Pt[]; groupId?: string;
	color?: string; fill?: string; weight?: number; fontPt?: number; align?: TextAlign; valign?: VAlign; layer?: string; rot?: number;
	// 'image' entity (imported background): src = image URL / data-URL placed in the a→b rect (origin +
	// scale). `crop` = the visible sub-rectangle of the SOURCE image, normalized 0..1 (x,y = top-left,
	// w,h = size); undefined = whole image. `opacity` 0..1 for tracing. Firestore-stable field names.
	src?: string; opacity?: number; crop?: { x: number; y: number; w: number; h: number };
	// `origin` = a reference POINT inside the image (normalized 0..1 of the placement rect), like the
	// Uploads tool — the anchor that scale calibration keeps fixed, and the point to align a re-imported
	// (differently-cropped) new version by. Undefined → the rect centre.
	origin?: { x: number; y: number };
	// DRAWING PLANE — which projection plane the object's coordinates live in: undefined/'plan' = the
	// model/plan plane (projected into every elevation as a ground line, layer-gated); an ElevDir = drawn
	// natively in that elevation plane (a wall/rack label, a leader, a 2D shape/image on an elevation).
	plane?: 'plan' | ElevDir;
	// SCOPE (orthogonal to plane, DXF-style): 'model'/undefined = belongs to the model, shown in every
	// view of it (layer-gated); 'view:<frameId>' = a viewport-local annotation, shown only in that frame.
	// Firestore-stable field names ({plane, space}) — see [[project_pages_firestore_schema]].
	space?: 'model' | string }
export type View = { zoom: number; x: number; y: number }

// Default object style — matched to the Sheets tool (annotations.svelte.ts: text fontPt 8 / align
// left; strokeWidth ?? 0.5; fill ?? 'none'). `color` unset = ByLayer/ink (resolved by the renderer).
export const STYLE_DEFAULTS = { fontPt: 8, align: 'left' as TextAlign, weight: 1.2, fill: 'none' }
export const PT = 96.25   // model mm per point (1.375 × MMPU) — keeps text proportional in mm space

// Model space is REAL MILLIMETRES. The demo plan is ~28 m × 17.5 m, so a realistic scale like 1:100
// fills the view (the whole tool's constants + mock content are sized in mm; MMPU below converts the
// legacy abstract backdrop). 1 model unit = 1 mm.
export const DEFAULT_BOX_H = 3150   // mock cuboid height (mm) — ~3.15 m
// Elevation ground line (mm, model space); a box with z0=0 stands on it. Set ~1500 below the plan
// centre (PLAN_CY 8750) so a typical ~3 m building's vertical MIDDLE sits on the viewBox centre — then
// an elevation shows centred (like the plan/iso) instead of dropping off the bottom of the screen.
export const GROUND = 10250
export const ISO = 0.6             // oblique (cabinet) projection offset factor for the model view
export const PLAN_CX = 14000, PLAN_CY = 8750   // plan centre (mm) — the viewBox centre + scale pivot
export const MMPU = 70             // mm per legacy abstract unit (scales the decorative backdrop to mm)

// ── Orthographic elevation projection (KestrelCad2 camera / Sheets model3d BASIS convention) ──
// Each side view maps one footprint axis to the drawing's HORIZONTAL (u); the VERTICAL is always z
// (height), so a flat z=0 object collapses to the ground line. The sign mirrors rear-from-front and
// left-from-right. Concretely: front screenX=+x · rear=-x · right screenX=+y · left=-y (all screenY=-z).
// FORWARD-COMPAT: this table is the DISCRETE form of a yaw/pitch orbit camera (KestrelCad2 math.js
// `Camera.setView`). A future free 3D view (orbit/walk-through) replaces elevU with a full
// (x,y,z)→screen camera projection; at the named-view yaw/pitch presets it yields exactly these
// mappings, so the orthographic views stay identical when the camera lands. Entities already carry
// enough 3D (box = footprint x/y + base z0 + height h; flats = z0-plane), so no data change is needed.
export type ElevDir = 'front' | 'rear' | 'left' | 'right'
export const ELEV_BASIS: Record<ElevDir, { axis: 0 | 1; sign: 1 | -1 }> = {
	front: { axis: 0, sign:  1 },
	rear:  { axis: 0, sign: -1 },
	right: { axis: 1, sign:  1 },
	left:  { axis: 1, sign: -1 },
}
// Project a scalar footprint coordinate (along the dir's axis) to the elevation's horizontal drawing
// coord, mirrored per dir and re-centred about the plan centre so every view sits centred in the viewBox.
export function elevU(dir: ElevDir, coord: number, cx = PLAN_CX, cy = PLAN_CY): number {
	const { axis, sign } = ELEV_BASIS[dir]
	return cx + sign * (coord - (axis === 0 ? cx : cy))
}
// Inverse of elevU (own inverse up to the axis centre): drawing horizontal u → model coord along the axis.
export function elevUInv(dir: ElevDir, u: number, cx = PLAN_CX, cy = PLAN_CY): number {
	const { axis, sign } = ELEV_BASIS[dir]
	return (axis === 0 ? cx : cy) + sign * (u - cx)
}
// Project a point's on-axis coordinate for the current dir.
export const elevH = (dir: ElevDir, p: Pt, cx = PLAN_CX, cy = PLAN_CY): number => elevU(dir, p[ELEV_BASIS[dir].axis], cx, cy)
// Horizontal drawing span [min,max] of a flat (z=0) object seen edge-on in an elevation dir.
export function flatSpan(e: Ent, dir: ElevDir, cx = PLAN_CX, cy = PLAN_CY): [number, number] {
	const ax = ELEV_BASIS[dir].axis
	let lo: number, hi: number
	if (e.type === 'circle') { lo = e.c![ax] - e.r!; hi = e.c![ax] + e.r! }
	else if (e.type === 'polyline') { const cs = (e.pts ?? []).map(p => p[ax]); lo = Math.min(...cs); hi = Math.max(...cs) }
	else { lo = Math.min(e.a![ax], e.b![ax]); hi = Math.max(e.a![ax], e.b![ax]) }
	const u0 = elevU(dir, lo, cx, cy), u1 = elevU(dir, hi, cx, cy)
	return [Math.min(u0, u1), Math.max(u0, u1)]
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])

// Distance from point p to segment a–b.
export function segDist(p: Pt, a: Pt, b: Pt): number {
	const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1
	let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L
	t = Math.max(0, Math.min(1, t))
	return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

// Translate every point of an entity by (dx,dy).
export function translate(e: Ent, dx: number, dy: number): Ent {
	const t = (p?: Pt): Pt | undefined => p ? [p[0] + dx, p[1] + dy] : p
	return { ...e, a: t(e.a), b: t(e.b), c: t(e.c), pts: e.pts?.map(p => [p[0] + dx, p[1] + dy] as Pt) }
}

// Text bounding box (drawing units): a[0]/a[1] is the first line's baseline-left; lines run down.
// Sizes with the object's font (fontPt → drawing units); the char width ≈ 0.6·em (monospace).
export function textBox(e: Ent): [number, number, number, number] {
	const lines = (e.text ?? '').split('\n')
	const fs = (e.fontPt ?? STYLE_DEFAULTS.fontPt) * PT, lh = fs * 1.18
	const w = Math.max(...lines.map(l => l.length), 1) * fs * 0.6
	// vertical-align shifts the whole block about the anchor (matches the Viewport render's oy).
	const oy = e.valign === 'middle' ? -((lines.length - 1) * lh) / 2 : e.valign === 'bottom' ? -((lines.length - 1) * lh) : 0
	return [e.a![0], e.a![1] + oy - fs * 0.9, e.a![0] + w, e.a![1] + oy + (lines.length - 1) * lh + 3]
}

// Elevation face of a box in direction `dir` (default front): u0..u1 wide (the projected footprint
// axis), top at GROUND-z0-h, baseline at GROUND-z0. front/rear use the x-edges, left/right the y-edges.
export function boxElev(e: Ent, dir: ElevDir = 'front', cx = PLAN_CX, cy = PLAN_CY) {
	const u0 = elevU(dir, e.a![ELEV_BASIS[dir].axis], cx, cy), u1 = elevU(dir, e.b![ELEV_BASIS[dir].axis], cx, cy)
	const x0 = Math.min(u0, u1), x1 = Math.max(u0, u1)
	const h = e.h ?? DEFAULT_BOX_H, base = GROUND - (e.z0 ?? 0)
	return { x0, x1, h, base, top: base - h }
}

// Apply an elevation-view edit to a box: the width edges (x0/x1, in drawing horizontal) map back onto
// the dir's footprint axis (inverse-projected), keeping the OTHER footprint axis; z0 = base elevation;
// h = height. So editing a side view only touches that view's axis + the box height/elevation.
export function boxElevSet(e: Ent, ch: { x0?: number; x1?: number; z0?: number; h?: number }, dir: ElevDir = 'front', cx = PLAN_CX, cy = PLAN_CY): Ent {
	const ax = ELEV_BASIS[dir].axis
	const cu0 = elevU(dir, e.a![ax], cx, cy), cu1 = elevU(dir, e.b![ax], cx, cy)
	const uMin = Math.min(cu0, cu1), uMax = Math.max(cu0, cu1)
	const nMin = ch.x0 ?? uMin, nMax = ch.x1 ?? uMax
	const na = elevUInv(dir, cu0 === uMin ? nMin : nMax, cx, cy)   // new model coord for endpoint a
	const nb = elevUInv(dir, cu1 === uMin ? nMin : nMax, cx, cy)   // …and endpoint b
	const a: Pt = ax === 0 ? [na, e.a![1]] : [e.a![0], na]
	const b: Pt = ax === 0 ? [nb, e.b![1]] : [e.b![0], nb]
	return { ...e, a, b, z0: Math.max(0, ch.z0 ?? e.z0 ?? 0), h: Math.max(1, ch.h ?? e.h ?? DEFAULT_BOX_H) }
}

// Model-view oblique (cabinet) cuboid faces: the top face is the footprint shifted up-right by h·ISO.
export function boxFaces(e: Ent) {
	const x0 = Math.min(e.a![0], e.b![0]), y0 = Math.min(e.a![1], e.b![1])
	const x1 = Math.max(e.a![0], e.b![0]), y1 = Math.max(e.a![1], e.b![1])
	const h = e.h ?? DEFAULT_BOX_H, ox = h * ISO, oy = -h * ISO
	const P = (x: number, y: number) => `${x},${y}`
	return {
		x0, y0, x1, y1, h,
		top: `${P(x0 + ox, y0 + oy)} ${P(x1 + ox, y0 + oy)} ${P(x1 + ox, y1 + oy)} ${P(x0 + ox, y1 + oy)}`,
		right: `${P(x1, y0)} ${P(x1, y1)} ${P(x1 + ox, y1 + oy)} ${P(x1 + ox, y0 + oy)}`,
		back: `${P(x0, y0)} ${P(x1, y0)} ${P(x1 + ox, y0 + oy)} ${P(x0 + ox, y0 + oy)}`,
	}
}
