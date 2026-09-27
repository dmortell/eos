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
export type Ent = { id: string; type: 'rect' | 'ellipse' | 'dim' | 'text' | 'polyline' | 'arc' | 'image' | 'insert'; a?: Pt; b?: Pt; text?: string; pts?: Pt[]; groupId?: string;
	color?: string; fill?: string; weight?: number; fontPt?: number; align?: TextAlign; valign?: VAlign; layer?: string; rot?: number;
	// `lw` = the LINEWEIGHT in paper mm (ui/lineweight.ts LINEWEIGHTS; absent / −1 = ByLayer). `weight` is the legacy
	// screen-px stroke — still read (mapped to mm) when there's no `lw`.
	lw?: number;
	// `z` = a PLAN-plane shape's height above the floor (mm; absent = 0): an elevation draws a flat one edge-on AT that
	// height (drag it up / down there to set it), the 3D view lifts it (a callout's leader points up at a ceiling TV).
	z?: number;
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
	// I7 (images): draw the image in greyscale (a floorplan behind coloured markup). Firestore-stable.
	grey?: boolean;
	// I6 (a floorplan PDF page): placement follows the Uploads calibration live (ui/floorplanLink.ts); a move /
	// scale / crop in Pages clears it. Firestore-stable.
	live?: boolean;
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
	// D9: the callout's frame — 'box' (default) / 'underline' (a line under the text, the leader from its end) / 'none'.
	calloutBorder?: 'box' | 'underline' | 'none';
	// D7 LINE LABEL (polyline only): `text` is drawn along the line at `textPos` ('mid' default; ui/annotations
	// lineLabelAt), annotative like a dimension's figure. Firestore-stable.
	textPos?: 'start' | 'mid' | 'end';
	// LINE ENDS (XP33): the head drawn at each end of a 2-point polyline (pts[0] / pts[last]) or a dimension
	// (a / b) — 'arrow' | 'dot' | 'tick' | 'none'. Unset = none on a line, arrow on a dimension. Replaced the
	// old `arrow: 'start' | 'end' | 'both'` (migrateEnt converts it). Firestore-stable.
	headStart?: Head; headEnd?: Head;
	// LINE TYPE (XP32): 'solid' | 'dashed' | 'dotted' | 'dashdot'; unset = ByLayer (the layer's `dash`, else
	// solid) — the same field name as Layer.dash. Firestore-stable.
	dash?: Dash;
	// CLOUD (rect, or a closed polyline — REVCLOUD): render the outline as a revision cloud (scalloped arcs). Firestore-stable.
	cloud?: boolean;
	// D2 FLOOR-TILE GRID (rect): grid lines every `tile` mm inside the rect, aligned to the model origin shifted by
	// `tileOff` (so tiles line up with the building's real grid wherever the rect is). Firestore-stable.
	tile?: number; tileOff?: Pt;
	// HATCH (2D, a rect / ellipse / closed polyline): a line pattern across it — h / v / x (both) / d (45°) / dx (both
	// diagonals) — `hatchStep` model mm apart (default 300: cable-ladder rungs). ui/annotations hatchLines. Firestore-stable.
	hatch?: 'h' | 'v' | 'x' | 'd' | 'dx'; hatchStep?: number;
	// D3 (insert): drawn mirrored left↔right (a door's hinge side). Firestore-stable.
	mirror?: boolean;
	// DIMENSION text offset: signed perpendicular distance (mm) of the measured-length text from the dim
	// line; undefined = a small auto offset. Draggable via a grip. Firestore-stable.
	dimOff?: number;
	// DIMENSION extension lines: the measured points sit `dimExt` mm back from the dim line (a / b), along its
	// perpendicular (signed, the same side convention as dimOff); undefined = the dim line IS on the points
	// (short ticks only). DIMBASELINE sets it so each stacked dim reaches back to the base line. Firestore-stable.
	dimExt?: number;
	// DIMENSION text position ALONG the line: 0..1 fraction from start (a) to end (b); undefined = 0.5
	// (centred). Draggable via the same text grip. Firestore-stable.
	dimT?: number;
	// DIMENSION mode (`dimGeom`): unset = ALIGNED (the true a→b distance, a / b on the dim line); 'h' / 'v' = a LINEAR
	// dim measuring only Δx / Δy — a / b are then the MEASURED points and the dim line is horizontal / vertical, `dimExt`
	// from a. Firestore-stable.
	dimMode?: DimMode;
	// DIMENSION 'r' (ROTATED linear) mode: the dim line's direction in degrees (drawing coords, [0, 180)) — like 'h' / 'v'
	// but at any angle (an H / V dim turned by a non-90° angle becomes one, keeping its figure). Firestore-stable.
	dimAng?: number;
	// DIMENSION text offset in PAPER mm (signed, perpendicular to the dim line — the same side convention as dimOff),
	// so it reads the same at any scale; supersedes the older model-mm `dimOff`. Unset = dimOff, else 2.5. Firestore-stable.
	dimTextOff?: number;
	// D10 DIMENSION unit: the figure in mm (unset) / cm / m (ui/drawingDefaults dimLabel). Firestore-stable.
	unit?: 'mm' | 'cm' | 'm'
	// BLOCK INSERT (type 'insert', ui/blocks.ts): `block` = the global block definition id, placed with its
	// insertion point at `a`, rotated `rot`, scaled `scale` (default 1); `attrs` = attribute values by tag
	// (LABEL / PORTS / NOTE / TYPE for outlets). `color` / `fill` feed the block's 'byblock' shapes.
	// Swapping `block` keeps `attrs`. Firestore-stable.
	block?: string; attrs?: Record<string, string>; scale?: number
	// A WRAPPED TEXT (was the K3 NOTE; `isNote`): a text with `noteW` — its `text` is markdown (ui/noteLayout.ts), laid out from its top-left `a` in a box `noteW` PAPER
	// mm wide (annotative, default 90); `noteBox` draws the frame round it. Firestore-stable.
	noteW?: number; noteBox?: boolean }
/** A dimension's mode: 'aligned' (the default — unset on the shape) or a linear 'h' / 'v' / 'r' (rotated: `dimAng`). */
export type DimMode = 'aligned' | 'h' | 'v' | 'r'
/** A LINEAR dimension (measures along a fixed direction, not the true distance): H, V or rotated. */
export const isLinearDim = (e: Ent): boolean => e.type === 'dim' && (e.dimMode === 'h' || e.dimMode === 'v' || e.dimMode === 'r')
/** A linear dim's measuring direction in degrees [0, 180): H 0, V 90, rotated its `dimAng`. */
export const dimDirDeg = (e: Ent): number => (e.dimMode === 'h' ? 0 : e.dimMode === 'v' ? 90 : ((((e.dimAng ?? 0) % 180) + 180) % 180))
/** A linear direction (degrees) as the dim's mode: 0 → 'h', 90 → 'v', else 'r' with dimAng (H / V stay exact). */
export function dimModeFor(deg: number): { dimMode: 'h' | 'v' | 'r'; dimAng?: number } {
	const a = Math.round(((((deg % 180) + 180) % 180)) * 1e6) / 1e6 % 180
	return a < 1e-6 || a > 180 - 1e-6 ? { dimMode: 'h' } : Math.abs(a - 90) < 1e-6 ? { dimMode: 'v' } : { dimMode: 'r', dimAng: a }
}
/** A dimension as drawn: the dim line A → B, the measured points M1 / M2 (the extension lines run M → A / B), the dim
 *  line's unit direction `u` and perpendicular `p` (= (−u.y, u.x): the +dimExt / +text side), and the measured value. */
export type DimGeom = { A: Pt; B: Pt; M1: Pt; M2: Pt; u: Pt; p: Pt; len: number }
/** Where a dimension draws, per its mode. ALIGNED: a / b are the dim line's ends, the measured points sit `dimExt` back
 *  along −p; the value is |b − a|. H / V: a / b are the measured points, the dim line is horizontal / vertical through
 *  a moved `dimExt` along p (so dimExt reads the same way: how far a sits back from the line); the value is |Δx| / |Δy|.
 *  u follows a → b along the axis, so rotating / mirroring the points carries the frame along. */
export function dimGeom(e: Ent): DimGeom {
	const a = e.a ?? [0, 0], b = e.b ?? a, ext = e.dimExt ?? 0
	if (e.dimMode === 'h' || e.dimMode === 'v') {
		const h = e.dimMode === 'h', s = Math.sign(h ? b[0] - a[0] : b[1] - a[1]) || 1
		const u: Pt = h ? [s, 0] : [0, s], p: Pt = h ? [0, s] : [-s, 0]
		if (h) { const y = a[1] + s * ext; return { A: [a[0], y], B: [b[0], y], M1: a, M2: b, u, p, len: Math.abs(b[0] - a[0]) } }
		const x = a[0] - s * ext
		return { A: [x, a[1]], B: [x, b[1]], M1: a, M2: b, u, p, len: Math.abs(b[1] - a[1]) }
	}
	if (e.dimMode === 'r') {   // ROTATED linear: like H / V along `dimAng` (u follows a → b; p = (−u.y, u.x), as for H / V)
		const r = (dimDirDeg(e) * Math.PI) / 180, d: Pt = [Math.cos(r), Math.sin(r)], t = (b[0] - a[0]) * d[0] + (b[1] - a[1]) * d[1]
		const s = Math.sign(t) || 1, u: Pt = [s * d[0], s * d[1]], p: Pt = [-u[1], u[0]]
		const A: Pt = [a[0] + p[0] * ext, a[1] + p[1] * ext], len = Math.abs(t)
		return { A, B: [A[0] + u[0] * len, A[1] + u[1] * len], M1: a, M2: b, u, p, len }
	}
	const len = Math.hypot(b[0] - a[0], b[1] - a[1]), L = len || 1, u: Pt = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], p: Pt = [-u[1], u[0]]
	return { A: a, B: b, M1: [a[0] - p[0] * ext, a[1] - p[1] * ext], M2: [b[0] - p[0] * ext, b[1] - p[1] * ext], u, p, len }
}
/** A dimension's two extension lines (drawing coords): from a small gap off each measured point to just past the
 *  dim line — none where the point is ON the line (an aligned dim without `dimExt`). `paperMm` = model mm per paper mm
 *  (the gap / overshoot are paper sizes). */
export function dimExtLines(e: Ent, paperMm: number): [Pt, Pt][] {
	if (!e.a || !e.b) return []
	const g = dimGeom(e), [px, py] = g.p, out: [Pt, Pt][] = []
	for (const [M, D] of [[g.M1, g.A], [g.M2, g.B]]) {
		const d = (D[0] - M[0]) * px + (D[1] - M[1]) * py; if (Math.abs(d) < 1e-9) continue
		const s = Math.sign(d), gap = Math.min(1 * paperMm, Math.abs(d) / 2), over = 1.5 * paperMm
		out.push([[M[0] + px * s * gap, M[1] + py * s * gap], [D[0] + px * s * over, D[1] + py * s * over]])
	}
	return out
}
/** The default dimension text offset (paper mm), and the figure's height. */
export const DIM_TEXT_OFF = 2.5
/** A dimension's text offset from its dim line in model mm: `dimTextOff` (paper mm) × paperMm, else the older model-mm
 *  `dimOff`, else the default 2.5 paper mm. */
export const dimTextOffMm = (e: Ent, paperMm: number): number => (e.dimTextOff != null ? e.dimTextOff * paperMm : e.dimOff ?? DIM_TEXT_OFF * paperMm)
/** Where a dimension's figure sits (its anchor, drawing coords) and its upright rotation (degrees). */
export function dimTextAt(e: Ent, paperMm: number): { p: Pt; rot: number } {
	const g = dimGeom(e), off = dimTextOffMm(e, paperMm), t = e.dimT ?? 0.5
	const p: Pt = [g.A[0] + (g.B[0] - g.A[0]) * t + g.p[0] * off, g.A[1] + (g.B[1] - g.A[1]) * t + g.p[1] * off]
	const ang = (Math.atan2(g.u[1], g.u[0]) * 180) / Math.PI
	return { p, rot: ang > 90 || ang < -90 ? ang + 180 : ang }
}
/** DIMLINEAR's automatic pick: horizontal when the points are further apart in x than in y, else vertical. */
export const autoDimMode = (a: Pt, b: Pt): 'h' | 'v' => (Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? 'h' : 'v')
/** The dimension with its dim line moved through `q`, the measured points kept (the dim-line grip): H / V set `dimExt`;
 *  an aligned one slides a / b along its perpendicular (dimExt = how far the points now sit back). Whole mm. */
export function dimSetLine(e: Ent, q: Pt): Ent {
	const g = dimGeom(e), ext = Math.round((q[0] - g.M1[0]) * g.p[0] + (q[1] - g.M1[1]) * g.p[1])
	if (isLinearDim(e)) return { ...e, dimExt: ext || undefined }
	return { ...e, a: [g.M1[0] + g.p[0] * ext, g.M1[1] + g.p[1] * ext], b: [g.M2[0] + g.p[0] * ext, g.M2[1] + g.p[1] * ext], dimExt: ext || undefined }
}
/** The dimension switched to another mode, keeping what it measures FROM (the measured points) and its dim line
 *  through the same middle point (as near as the new direction allows). Unchanged when already in that mode. */
export function dimSetMode(e: Ent, mode: DimMode, ang?: number): Ent {
	if (e.type !== 'dim' || !e.a || !e.b) return e
	const g = dimGeom(e), q: Pt = [(g.A[0] + g.B[0]) / 2, (g.A[1] + g.B[1]) / 2]
	// ROTATED: at `ang`, else along the dim line as it is now (a switch from aligned keeps the figure)
	const r = mode === 'r' ? dimModeFor(ang ?? (Math.atan2(g.u[1], g.u[0]) * 180) / Math.PI) : null
	if ((e.dimMode ?? 'aligned') === mode && (mode !== 'r' || r?.dimAng === e.dimAng)) return e
	const { dimAng: _a, ...rest } = e
	return dimSetLine({ ...rest, a: g.M1, b: g.M2, dimExt: undefined, ...(r ?? { dimMode: mode === 'aligned' ? undefined : mode }) }, q)
}
/** A wrapped markdown text (a "note"): a TEXT with a wrap width. Without one it's plain lines. */
export const isNote = (e: Ent): boolean => e.type === 'text' && e.noteW != null
/** A stored shape from before NOTE merged into TEXT: type 'note' → a wrapped text. */
export const migrateNote = (e: Ent): Ent => ((e.type as string) === 'note' ? { ...e, type: 'text', noteW: e.noteW ?? 90 } : e)
export type View ={ zoom: number; x: number; y: number }

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
// (ELEV_BASIS / elevU / elevUInv are the PRE-FRAME formulas, kept as the reference the ElevFrame tests pin —
// app code goes through the frame helpers below.)
export function elevU(dir: ElevDir, coord: number, cx = PLAN_CX, cy = PLAN_CY): number {
	const { axis, sign } = ELEV_BASIS[dir]
	return cx + sign * (coord - (axis === 0 ? cx : cy))
}
// Inverse of elevU (own inverse up to the axis centre): drawing horizontal u → model coord along the axis.
export function elevUInv(dir: ElevDir, u: number, cx = PLAN_CX, cy = PLAN_CY): number {
	const { axis, sign } = ELEV_BASIS[dir]
	return (axis === 0 ? cx : cy) + sign * (u - cx)
}

// ── ElevFrame: a HORIZONTAL VIEW FRAME (elevation-section-plan.md §3.1) ──
// An elevation / section looks horizontally along `n` (unit, plan mm, y down) and its drawing's horizontal runs
// along `t` (unit, the view's "right": n = (−t.y, t.x)), about the origin `o`. Drawing coords: u = o.x + (p − o)·t
// (the origin draws at its own plan x, so the four ElevDir frames — origin = the plan centre — keep elevU's
// centring) and v = GROUND − z as before; depth (sorting / clipping) d = (p − o)·n, larger = farther. The four
// ElevDirs are the axis-aligned frames (`frameOf`): front t +x / n +y, rear −x / −y, right +y / −x, left −y / +x
// (= Model3d's hidden-line `far`). An AXIS-ALIGNED frame (t = ±x or ±y) takes a fast path through the exact
// ELEV_BASIS arithmetic, so every existing view keeps its numbers bit for bit; an oblique one (frameAt) is the
// general dot product.
export type ElevFrame = { o: Pt; t: Pt; n: Pt }
const mkFrame = (o: Pt, t: Pt): ElevFrame => ({ o, t, n: [0 - t[1], t[0]] })   // 0 − t.y: no −0 in n
const DIR_T: Record<ElevDir, Pt> = { front: [1, 0], rear: [-1, 0], right: [0, 1], left: [0, -1] }
const DIR_FRAMES = Object.fromEntries((Object.keys(DIR_T) as ElevDir[]).map((d) => [d, mkFrame([PLAN_CX, PLAN_CY], DIR_T[d])])) as Record<ElevDir, ElevFrame>
/** The frame of an ElevDir about the plan centre (cx, cy). The default-centre frames are SHARED — don't mutate. */
export const frameOf = (dir: ElevDir, cx = PLAN_CX, cy = PLAN_CY): ElevFrame =>
	cx === PLAN_CX && cy === PLAN_CY ? DIR_FRAMES[dir] : mkFrame([cx, cy], DIR_T[dir])
/** An oblique frame about `o` looking along plan angle `deg` (from +x toward +y, the plan's rotation sense).
 *  Multiples of 90° come out exactly axis-aligned (90° = front), so they take the fast path. */
export function frameAt(o: Pt, deg: number): ElevFrame {
	const r = (deg * Math.PI) / 180, z = (x: number) => (Math.abs(x) < 1e-12 ? 0 : x)
	return mkFrame(o, [z(Math.sin(r)), z(-Math.cos(r))])
}
/** The frame whose horizontal runs along the plan line a→b (a section's CUT line, phase 2's OClip): t = unit(b − a),
 *  looking along its right-hand normal n, about `o` (default a). An axis-aligned line gives exact ±1 / 0 components. */
export function frameOnLine(a: Pt, b: Pt, o: Pt = a): ElevFrame {
	const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1
	return mkFrame(o, dy === 0 ? [dx < 0 ? -1 : 1, 0] : dx === 0 ? [0, dy < 0 ? -1 : 1] : [dx / len, dy / len])
}
/** The plan angle a frame looks along (degrees, 0..360, frameAt's convention: 90 = front) — for labels. */
export const frameAngle = (f: ElevFrame): number => { const d = (Math.atan2(f.n[1], f.n[0]) * 180) / Math.PI; return Math.round((d < 0 ? d + 360 : d) * 1e6) / 1e6 }
/** The plan axis an axis-aligned frame's horizontal runs along (0 = x, 1 = y); null when oblique. */
export const frameAxis = (f: ElevFrame): 0 | 1 | null => (f.t[1] === 0 ? 0 : f.t[0] === 0 ? 1 : null)
/** A plan point → the drawing's horizontal u (= elevU of its on-axis coord for the four dirs). */
export function frameU(f: ElevFrame, p: Pt): number {
	const { o, t } = f
	if (t[1] === 0) return o[0] + t[0] * (p[0] - o[0])
	if (t[0] === 0) return o[0] + t[1] * (p[1] - o[1])
	return o[0] + (p[0] - o[0]) * t[0] + (p[1] - o[1]) * t[1]
}
/** A plan point's depth along the look direction from the origin (larger = farther from the viewer). */
export function frameDepth(f: ElevFrame, p: Pt): number {
	const { o, n } = f
	if (n[1] === 0) return n[0] * (p[0] - o[0])
	if (n[0] === 0) return n[1] * (p[1] - o[1])
	return (p[0] - o[0]) * n[0] + (p[1] - o[1]) * n[1]
}
/** Drawing u + depth → the plan point (the inverse of frameU + frameDepth; the on-axis coord = elevUInv). */
export function frameInv(f: ElevFrame, u: number, depth = 0): Pt {
	const { o, t, n } = f
	if (t[1] === 0) return [o[0] + t[0] * (u - o[0]), o[1] + n[1] * depth]
	if (t[0] === 0) return [o[0] + n[0] * depth, o[1] + t[1] * (u - o[0])]
	const s = u - o[0]
	return [o[0] + s * t[0] + depth * n[0], o[1] + s * t[1] + depth * n[1]]
}
/** The ALONG coordinate of a plan point — the scalar a view's horizontal measures (typed user coords, depth-snap
 *  matching): for an axis-aligned frame its model coord on that axis (x / y); oblique, the distance along t from o.
 *  `alongToU` / `uToAlong` map it to the drawing u and back (= elevU / elevUInv for the four dirs). */
export function frameAlong(f: ElevFrame, p: Pt): number {
	const ax = frameAxis(f)
	return ax === null ? (p[0] - f.o[0]) * f.t[0] + (p[1] - f.o[1]) * f.t[1] : p[ax]
}
export function alongToU(f: ElevFrame, a: number): number {
	const ax = frameAxis(f)
	return ax === null ? f.o[0] + a : f.o[0] + f.t[ax] * (a - f.o[ax])
}
export function uToAlong(f: ElevFrame, u: number): number {
	const ax = frameAxis(f)
	return ax === null ? u - f.o[0] : f.o[ax] + f.t[ax] * (u - f.o[0])
}
/** Plan point p slid along t so it draws at u, keeping its depth (axis-aligned: only the on-axis coord changes). */
export function frameSetU(f: ElevFrame, p: Pt, u: number): Pt {
	const ax = frameAxis(f)
	if (ax === 0) return [uToAlong(f, u), p[1]]
	if (ax === 1) return [p[0], uToAlong(f, u)]
	const d = u - frameU(f, p)
	return [p[0] + d * f.t[0], p[1] + d * f.t[1]]
}
/** A drawing-horizontal step du as a plan vector (du·t; exact zeros off-axis for the four dirs). */
export const frameStep = (f: ElevFrame, du: number): Pt => [f.t[0] === 0 ? 0 : f.t[0] * du, f.t[1] === 0 ? 0 : f.t[1] * du]
/** ENGINE coords (3dview/projection `project()`, origin-free): the horizontal x·t (= BASIS hs · p[h]) and the
 *  depth x·n (Model3d's `far`). viewMap re-centres: drawing u = dotT + frameShift. */
export function dotT(f: ElevFrame, x: number, y: number): number {
	const t = f.t
	return t[1] === 0 ? t[0] * x : t[0] === 0 ? t[1] * y : x * t[0] + y * t[1]
}
export function dotN(f: ElevFrame, x: number, y: number): number {
	const n = f.n
	return n[1] === 0 ? n[0] * x : n[0] === 0 ? n[1] * y : x * n[0] + y * n[1]
}
/** Drawing u − engine u: o.x − o·t (= viewMap's old `cx − hs · centre`). */
export const frameShift = (f: ElevFrame): number => f.o[0] - dotT(f, f.o[0], f.o[1])
/** The drawing-u span [min, max] of plan points: the along coords' extremes mapped to u (u is monotone in the
 *  along coord, mirrored for rear / left — so this is elevU of the min / max on-axis coord, as before). */
export function frameSpan(f: ElevFrame, pts: Pt[]): [number, number] {
	const as = pts.map((p) => frameAlong(f, p)), u0 = alongToU(f, Math.min(...as)), u1 = alongToU(f, Math.max(...as))
	return [Math.min(u0, u1), Math.max(u0, u1)]
}
/** A plan rectangle's 4 corners (for a frame span — an oblique frame needs all four). */
export const rectPts = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]

// Horizontal drawing span [min,max] of a flat (z=0) object seen edge-on in an elevation dir.
export function flatSpan(e: Ent, dir: ElevDir, cx = PLAN_CX, cy = PLAN_CY): [number, number] {
	return flatSpanOf(e, frameOf(dir, cx, cy))
}
/** `flatSpan` in any view frame (an oblique one too — the ground line is the shape's along-t extent). */
export function flatSpanOf(e: Ent, f: ElevFrame): [number, number] {
	let pts = e.type === 'polyline' || e.type === 'arc' ? (e.type === 'arc' ? arcPts(e) : e.pts ?? []) : !e.b ? [e.a!]   // a point (insert / text) → its a
		: (e.type === 'rect' || e.type === 'ellipse') ? [e.a!, [e.b[0], e.a![1]], e.b, [e.a![0], e.b[1]]] as Pt[]   // a box: all four corners (they matter once it's turned / seen obliquely)
		: [e.a!, e.b]
	if (e.rot && pts.length) {   // turned in plan: the span of its turned outline (about its box centre, as drawn in plan)
		const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), c: Pt = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
		const r = (e.rot * Math.PI) / 180, co = Math.cos(r), s = Math.sin(r)
		pts = pts.map(([x, y]) => [c[0] + (x - c[0]) * co - (y - c[1]) * s, c[1] + (x - c[0]) * s + (y - c[1]) * co])
	}
	return frameSpan(f, pts)
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])

// ── ARC (type 'arc'): stored as THREE points on it — start, any point between, end — so move / rotate / scale /
// grips treat it like a 3-point polyline; the circle is derived. ──
/** The circle through three points + the signed sweep from p0 to p2 passing p1 (radians, drawing coords);
 *  null when they're collinear (a straight "arc"). */
export function arc3(p0: Pt, p1: Pt, p2: Pt): { c: Pt; r: number; a0: number; sweep: number } | null {
	const [ax, ay] = p0, [bx, by] = p1, [cx, cy] = p2
	const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
	const span = Math.max(dist(p0, p1), dist(p1, p2), dist(p0, p2))
	if (Math.abs(d) < 1e-9 * span * span || !span) return null
	const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy
	const c: Pt = [(a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d, (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d]
	const ang = (p: Pt) => Math.atan2(p[1] - c[1], p[0] - c[0]), TAU = Math.PI * 2, norm = (x: number) => ((x % TAU) + TAU) % TAU
	const a0 = ang(p0), s = norm(ang(p2) - a0)
	return { c, r: dist(c, p0), a0, sweep: norm(ang(p1) - a0) <= s ? s : s - TAU }
}
/** An arc entity as a polyline (`n` segments) — for hit-testing, bounds, snaps, elevation spans and DXF. */
export function arcPts(e: Ent, n = 48): Pt[] {
	const p = e.pts ?? []; if (p.length < 3) return p
	const g = arc3(p[0], p[1], p[2]); if (!g) return [p[0], p[2]]
	return Array.from({ length: n + 1 }, (_, i) => { const t = g.a0 + (g.sweep * i) / n; return [g.c[0] + g.r * Math.cos(t), g.c[1] + g.r * Math.sin(t)] as Pt })
}
/** SVG path for an arc entity. */
export function arcPath(e: Ent): string {
	const p = e.pts ?? []; if (p.length < 3) return ''
	const g = arc3(p[0], p[1], p[2]); if (!g) return `M${p[0][0]},${p[0][1]} L${p[2][0]},${p[2][1]}`
	return `M${p[0][0]},${p[0][1]} A${g.r},${g.r} 0 ${Math.abs(g.sweep) > Math.PI ? 1 : 0} ${g.sweep > 0 ? 1 : 0} ${p[2][0]},${p[2][1]}`
}

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
