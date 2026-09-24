// Pure geometry for the Pages tool — no component state, so it's unit-testable and shared by
// Viewport.svelte and PropertiesPanel.svelte (see review.md §4.1/§5). The view-dependent helpers
// (hit-testing, grips, bbox per projection) stay in Viewport because they read the viewport `kind`.

export type Pt = [number, number]
export type TextAlign = 'left' | 'center' | 'right'
// Style props mirror the Sheets annotation model (fontPt/align/color/fill/weight) so an object can
// match Sheets' defaults; all optional → unset falls back to the tool defaults (see STYLE_DEFAULTS).
export type VAlign = 'top' | 'middle' | 'bottom'
/** A line-end head (XP33). */
export type Head = 'none' | 'arrow' | 'dot' | 'tick'
/** A line type (XP32); matches Layer.dash plus dash-dot. */
export type Dash = 'solid' | 'dashed' | 'dotted' | 'dashdot'
// SEAM for a future DXF import/export (R4, review.md §R4): a DXF `LINE` (2 points) should round-trip as a
// `polyline` with `pts.length === 2`, and `LWPOLYLINE` as a `polyline` with its full vertex list — the SAME
// mapping `migrateEnt` (3dview/migrate.ts) already applies to a legacy 'line' ent, so an importer/exporter
// can reuse that shape directly rather than inventing its own DXF-side entity type.
export type Ent = { id: string; type: 'rect' | 'ellipse' | 'dim' | 'text' | 'polyline' | 'image' | 'insert'; a?: Pt; b?: Pt; text?: string; pts?: Pt[]; groupId?: string;
	color?: string; fill?: string; weight?: number; fontPt?: number; align?: TextAlign; valign?: VAlign; layer?: string; rot?: number;
	// 'image' entity (imported background): src = image URL / data-URL placed in the a→b rect (origin +
	// scale). `crop` = the visible sub-rectangle of the SOURCE image, normalized 0..1 (x,y = top-left,
	// w,h = size); undefined = whole image. `opacity` 0..1 for tracing. Firestore-stable field names.
	src?: string; opacity?: number; crop?: { x: number; y: number; w: number; h: number };
	// `origin` = a reference POINT inside the image (normalized 0..1 of the placement rect), like the
	// Uploads tool — the anchor that scale calibration keeps fixed, and the point to align a re-imported
	// (differently-cropped) new version by. Undefined → the rect centre.
	origin?: { x: number; y: number };
	// `lockAspect` (images) — corner-resize keeps the source aspect ratio (default true for imports); Shift
	// while dragging inverts it (free stretch). Stored so it round-trips.
	lockAspect?: boolean;
	// DRAWING PLANE — which projection plane the object's coordinates live in: undefined/'plan' = the
	// model/plan plane (projected into every elevation as a ground line, layer-gated); an ElevDir = drawn
	// natively in that elevation plane (a wall/rack label, a leader, a 2D shape/image on an elevation).
	plane?: 'plan' | ElevDir;
	// SCOPE (orthogonal to plane, DXF-style): 'model'/undefined = belongs to the model, shown in every
	// view of it (layer-gated); 'view:<frameId>' = a viewport-local annotation, shown only in that frame.
	// Firestore-stable field names ({plane, space}) — see [[project_pages_firestore_schema]].
	space?: 'model' | string;
	// CALLOUT (text only): `callout` boxes the text and draws a leader to `leader` (the tip it points at,
	// model coords). Toggled in Properties; the leader tip has its own grip. Firestore-stable names.
	callout?: boolean; leader?: Pt;
	// LINE ENDS (XP33): the head drawn at each end of a 2-point polyline (pts[0] / pts[last]) or a dimension
	// (a / b) — 'arrow' | 'dot' | 'tick' | 'none'. Unset = none on a line, arrow on a dimension. Replaced the
	// old `arrow: 'start' | 'end' | 'both'` (migrateEnt converts it). Firestore-stable.
	headStart?: Head; headEnd?: Head;
	// LINE TYPE (XP32): 'solid' | 'dashed' | 'dotted' | 'dashdot'; unset = ByLayer (the layer's `dash`, else
	// solid) — the same field name as Layer.dash. Firestore-stable.
	dash?: Dash;
	// CLOUD (rect): render the rectangle outline as a revision cloud (scalloped arcs). Firestore-stable.
	cloud?: boolean;
	// DIMENSION text offset: signed perpendicular distance (mm) of the measured-length text from the dim
	// line; undefined = a small auto offset. Draggable via a grip. Firestore-stable.
	dimOff?: number;
	// DIMENSION text position ALONG the line: 0..1 fraction from start (a) to end (b); undefined = 0.5
	// (centred). Draggable via the same text grip. Firestore-stable.
	dimT?: number
	// BLOCK INSERT (type 'insert', ui/blocks.ts): `block` = the global block definition id, placed with its
	// insertion point at `a`, rotated `rot`, scaled `scale` (default 1); `attrs` = attribute values by tag
	// (LABEL / PORTS / NOTE / TYPE for outlets). `color` / `fill` feed the block's 'byblock' shapes.
	// Swapping `block` keeps `attrs`. Firestore-stable.
	block?: string; attrs?: Record<string, string>; scale?: number }
export type View = { zoom: number; x: number; y: number }

// Default object style — matched to the Sheets tool (annotations.svelte.ts: text fontPt 8 / align
// left; strokeWidth ?? 0.5; fill ?? 'none'). `color` unset = ByLayer/ink (resolved by the renderer).
export const STYLE_DEFAULTS = { fontPt: 8, align: 'left' as TextAlign, weight: 1.2, fill: 'none' }
export const PT = 96.25   // model mm per point (1.375 × MMPU) — keeps text proportional in mm space

// Model space is REAL MILLIMETRES. The demo plan is ~28 m × 17.5 m, so a realistic scale like 1:100
// fills the view (the whole tool's constants + mock content are sized in mm; MMPU below converts the
// legacy abstract backdrop). 1 model unit = 1 mm.
// Elevation ground line (mm, model space); a flat z=0 object stands on it. Set ~1500 below the plan
// centre (PLAN_CY 8750) so a typical ~3 m building's vertical MIDDLE sits on the viewBox centre — then
// an elevation shows centred (like the plan/iso) instead of dropping off the bottom of the screen.
export const GROUND = 10250
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
	if (e.type === 'polyline') { const cs = (e.pts ?? []).map(p => p[ax]); lo = Math.min(...cs); hi = Math.max(...cs) }
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
	return { ...e, a: t(e.a), b: t(e.b), pts: e.pts?.map(p => [p[0] + dx, p[1] + dy] as Pt) }
}

// Text bounding box (drawing units): a[0]/a[1] is the first line's baseline-left; lines run down.
// Sizes with the object's font (fontPt → drawing units); the char width ≈ 0.6·em (monospace).
// `mmPerPt` = model units per typographic point. Defaults to PT (world-sized); callers that render text
// ANNOTATIVELY (a fixed size on paper) pass PT_MM·paperMm so the hit-box/leader match what's drawn (B3).
export function textBox(e: Ent, mmPerPt = PT): [number, number, number, number] {
	const lines = (e.text ?? '').split('\n')
	const fs = (e.fontPt ?? STYLE_DEFAULTS.fontPt) * mmPerPt, lh = fs * 1.18
	const w = Math.max(...lines.map(l => l.length), 1) * fs * 0.6
	// vertical-align shifts the whole block about the anchor (matches the Viewport render's oy).
	const oy = e.valign === 'middle' ? -((lines.length - 1) * lh) / 2 : e.valign === 'bottom' ? -((lines.length - 1) * lh) : 0
	return [e.a![0], e.a![1] + oy - fs * 0.9, e.a![0] + w, e.a![1] + oy + (lines.length - 1) * lh + 3]
}

// (boxElev / boxElevSet / boxFaces removed with the 'box' Ent type — R4. Prisms are model objects.)
