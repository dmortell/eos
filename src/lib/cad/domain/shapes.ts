// SHAPES: every DRAWN item is one entity type (ADR 0007). Lines, polylines, rectangles, circles, polygons, text,
// notes, dimensions, leaders, clouds, images and block inserts — in a level's model, inside one view, or on a sheet's
// paper — are all Shapes, so they share one selection / grip / layer / clipboard / undo path.
//
// A 2D shape is a 3D shape with no height:
//  - a PATH with no section is a plain line; give it a section (w × h) and node z's and it is a 3D strip; give it a
//    role and it IS a wall or a containment run — clear the role and it is a line again. Geometry never changes.
//  - a REGION (rect / circle / polygon) lies on a plane; with no extent it is flat, with one it is a 2.5D solid pushed
//    straight out of the plane (ADR 0006): up from a plan, away from the viewer on an elevation.
// Project DATA (outlets, racks, devices, links, cords, places) is not drawn geometry and is not a Shape (./types.ts).
// Everything follows ./conventions.ts: plan mm, y down, z above the level's FFL.
import type { Pt, ElevFrame } from './conventions'
import type { Id, Tier } from './types'
import type { InsertLink } from './links'

/**
 * Who a shape belongs to — exactly one. A LEVEL's model (seen by every view of that level), ONE view (e.g. a note
 * that only belongs on one elevation), or a SHEET's paper. Stored as flat fields so Firestore can query by them.
 */
export type Owner = { levelId: Id; viewId?: never; sheetId?: never; vpId?: never }
	| { viewId: Id; levelId?: never; sheetId?: never; vpId?: never }
	/** On a sheet's paper. With `vpId` (a note drawn inside a viewport), its points are in THAT viewport's view mm, so
	 *  it follows the viewport's move / scale / pan; its text and arrow / arc sizes stay paper mm. */
	| { sheetId: Id; vpId?: Id; levelId?: never; viewId?: never }

/** Where a non-path shape lies: horizontal at height z, or the vertical plane of an elevation frame at a depth. */
export type Plane =
	| { kind: 'plan'; z: number }
	| { kind: 'vertical'; frame: ElevFrame; depth: number }

/** A cross-section swept along a path. `round` = a pipe of diameter w (h ignored). */
export interface Section {
	w: number
	h: number
	round?: boolean
	/** Inside size for fill (trunk / pipe walls); absent = same as outside. */
	inner?: { w: number; h: number }
	/** Is a node's z the BOTTOM of the section (walls, trunks laid on a surface) or its CENTRE (pipes)? Default bottom. */
	anchor?: 'bottom' | 'centre'
}

export interface PathNode {
	id: Id
	x: number
	y: number
	/** Height above FFL; ignored for view- and sheet-owned shapes (they are 2D in their own space). */
	z: number
	/** Only when the node is on another level than the shape (a riser's far end). */
	levelId?: Id
	/** This corner's bend radius (mm), 0 = sharp; absent = the run's `bendRadius` (domain/bends.ts). */
	radius?: number
	/** An outlet / rack / shape this node is attached to, and follows. */
	attach?: Id
}

export interface PathSeg {
	id: Id
	a: Id
	b: Id
	/** Overrides the shape's section for this segment (a reducer, a taller wall panel). */
	section?: Section
}

/** Points of non-path kinds are in the shape's plane (plan: x/y; vertical: x = u, y = z), or the owner's 2D space. */
export type Geometry =
	/** Lines, polylines and branching graphs. A segment whose two nodes share x/y is vertical (ADR 0006). */
	| { kind: 'path'; nodes: PathNode[]; segs: PathSeg[]; closed?: boolean }
	| { kind: 'rect'; centre: Pt; size: { x: number; y: number }; rot?: number }
	| { kind: 'circle'; centre: Pt; r: number }
	/** An ellipse: radii along its own x / y, turned by `rot` (deg, clockwise on screen). */
	| { kind: 'ellipse'; centre: Pt; rx: number; ry: number; rot?: number }
	| { kind: 'polygon'; pts: Pt[] }
	/** Angles in degrees, clockwise on screen (conventions.ts), swept from start to end. */
	| { kind: 'arc'; centre: Pt; r: number; start: number; end: number }
	/** Text and notes. `width` set = a wrapping note box; `markdown` allows lists and tables. Sizes are paper mm. */
	| { kind: 'text'; at: Pt; text: string; sizeMm: number; rot?: number; width?: number; markdown?: boolean; align?: 'left' | 'centre' | 'right' }
	/** `textAt`: where its text was dragged (unset = centred just off its line); `gapA` / `gapB`: each extension line's
	 *  gap from its measured point (mm; unset = 1 paper mm) — the text and extension grips (backlog "Dimension grips"). */
	| { kind: 'dimension'; a: Pt; b: Pt; offset: number; mode: 'aligned' | 'horizontal' | 'vertical' | 'rotated'; angle?: number; text?: string; textAt?: Pt; gapA?: number; gapB?: number }
	/** Tip first. `attach` makes the tip follow an entity (an outlet, a rack, a shape). */
	| { kind: 'leader'; pts: Pt[]; text?: string; attach?: Id; /** A callout's frame round its words (backlog "Callouts"); absent = none. */ border?: 'underline' | 'box' }
	| { kind: 'cloud'; pts: Pt[]; arcMm?: number }
	| { kind: 'image'; fileId: string; page?: number; centre: Pt; size: { x: number; y: number }; rot?: number }
	/** A placed block. `linked` inserts follow edits to the definition; a copied insert was exploded into shapes. */
	| { kind: 'insert'; blockId: Id; at: Pt; rot?: number; scale?: number; attrs?: Record<string, string>; /** Attributes kept as data but not drawn (Properties → Attributes). */ hidden?: string[]; /** Height above FFL (mm): where it shows in elevations / sections (a wall faceplate). */ z?: number; /** Placed in an elevation / section: shown there too; one placed on a plan is a plan symbol only (Dave 2026-10-10). */ inElevations?: boolean; /** The elevation / section it was placed in: shown ONLY there — not on the plan or in other views (Dave 2026-10-12). Absent (older inserts, or ticked “show in elevations” on the plan): the plan and every elevation. */ frame?: ElevFrame; /** A sheet or web page this marker opens (double-click); each insert has its own target. */ link?: InsertLink }
	/** A LEGEND (backlog "Legend on the drawing"): a table of the symbols / layers in use on its level (a sheet: the levels
	 *  its viewports show), with counts. `at` = its top-left; `rows` = the row keys it shows ('block:<id>' / 'layer:<id>';
	 *  absent = every symbol in use); sizes are paper mm. Drawn from the data each time, so it keeps itself up to date. */
	| { kind: 'legend'; at: Pt; title?: string; rows?: string[]; sizeMm?: number }

export type GeometryKind = Geometry['kind']

/** A path that bounds a room or space: walls host openings, and doors / windows move with their wall. */
export interface WallRole {
	kind: 'wall'
	openings: Opening[]
	/** Full height, slab to slab (IDF / UPS rooms): its height follows its level's floor heights, not its section. */
	slabToSlab?: boolean
}

/** Trunking, conduit, tray, ladder, riser: carries cables, so it routes links and counts towards fill and the BOM. */
export interface ContainmentRole {
	kind: 'containment'
	form: 'trunk' | 'conduit' | 'tray' | 'ladder'
	tier: Tier | 'wall'
	/** Server rooms this run may carry cables to (empty = any) — the Outlets tool's routing filter. */
	serves?: Id[]
	primary?: boolean
	/** Cables added BY HAND (backlog T080): before routes exist, or ones that aren't links (power, coax). Fill adds them
	 *  to the routed ones — `n` × `type` (a cable type id, or any name), `d` = their outer Ø in mm (else the type's),
	 *  `seg` = one segment (else every segment of the run). */
	extra?: HandCables[]
	/** The run's corner radius (mm; backlog "Bend radius") — a conduit's bends; absent / 0 = sharp. A node's own
	 *  `radius` wins (domain/bends.ts). */
	bendRadius?: number
}
export type HandCables = { type: string; n: number; d?: number; seg?: Id }

/** A thing in the room that is neither wall nor containment, e.g. furniture or equipment — for filtering and the BOM. */
export interface ObjectRole {
	kind: 'object'
	category: string
}

/**
 * A core drill / sleeve. Placed by hand (PEN) where no run is drawn, or ACCEPTED from the auto-detected crossings of
 * containment through walls and slabs — `source` then names the run segment and the wall / level it crosses, so the
 * tag stays stable and a moved run can flag its penetration as stale.
 */
export interface PenetrationRole {
	kind: 'penetration'
	diaMm: number
	through: 'wall' | 'slab'
	tag?: string
	source?: { run: Id; seg: Id; host: Id }
}

export type Role = WallRole | ContainmentRole | ObjectRole | PenetrationRole

/** A hole in a wall — a door or a window is just a hole (Dave) — hosted on a wall segment: it moves with the wall
 *  (ADR 0004). `z` = its bottom above FFL, `h` = its height. A `swing` draws a door leaf + arc on the plan, hinged on
 *  that side as seen from the segment's `a` end; `flip` opens it to the other face. */
export interface Opening {
	id: Id
	segId: Id
	/** Centre, mm along the segment from its `a` node. */
	at: number
	width: number
	z: number
	h: number
	swing?: 'left' | 'right'
	flip?: boolean
	/** Brought in from a Pages opening box (`pages:<modelId>:<objId>`, File › Import legacy drawings): importing it again skips it. */
	importedFrom?: string
}

/** A mark on a line's end: a filled arrow, a dot, or an architectural tick. */
export type LineEnd = 'arrow' | 'dot' | 'tick'

export interface ShapeCore {
	type: 'shape'
	id: Id
	geom: Geometry
	/** Non-path shapes in a level's model: the plane they lie on (absent = plan at z 0). A PATH with a vertical plane is
	 *  a line drawn on that elevation / section: its nodes are still model points (on the plane), and it shows only
	 *  there (`ownFrame`). */
	plane?: Plane
	/** Paths: the cross-section of every segment. Absent = a plain line (no width, no height). */
	section?: Section
	/** Regions: how far the shape extends out of its plane. Absent / 0 = flat. */
	extent?: number
	/** What the shape is beyond its geometry. Absent = a plain drawn shape. */
	role?: Role
	/** Any shape can carry a label (auto-numbering works on all of them). */
	label?: string
	/**
	 * Moves with this entity: a block of a modem / ONU on a rack shelf (host = the rack), a PC or phone on a desk (host =
	 * the desk shape). The shape keeps its own coordinates; moving or rotating the host carries it along.
	 */
	hostId?: Id
	groupId?: Id
	layerId?: Id
	/** Draw order within its owner and layer (higher = on top). */
	order?: number
	catalogId?: Id
	style?: { stroke?: string; fill?: string; weightMm?: number; dash?: string
		/** A plain line's end marks (backlog "Markup kinds" part 2): at its start (`a`, its first node) and its other
		 *  end(s) (`b`). */
		ends?: { a?: LineEnd; b?: LineEnd } }
	/** A box (rect): draw a thick line on its back edge (local −y), as racks have — which way a desk / box faces. */
	backLine?: boolean
	/** A box (rect): a floor-tile grid drawn over it, every `mm` from its top-left corner with an offset (domain/tiles.ts). */
	tiles?: { mm: number; dx: number; dy: number }
	/** A box / cabinet's doors (backlog "Door swings on other objects"), as racks have: drawn open on the plan, front = its
	 *  local +y (the back line is −y). */
	doors?: { front?: 'single' | 'split'; rear?: 'single' | 'split'; hinge?: 'left' | 'right' }
	/** Brought in from a legacy drawing (File › Import legacy drawings): `pages:<modelId>:<objId>` or
	 *  `sheets:<sheetId>:<annotationId>` — so importing the same item again skips it instead of doubling it. */
	importedFrom?: string
}

export type Shape = ShapeCore & Owner

/** Geometry shifted by d (path nodes also by d.z). A new value; the input is never changed. */
export function moveGeometry(g: Geometry, d: { x: number; y: number; z?: number }): Geometry {
	const add = (p: Pt): Pt => ({ x: p.x + d.x, y: p.y + d.y })
	switch (g.kind) {
		case 'path': return { ...g, nodes: g.nodes.map((n) => ({ ...n, x: n.x + d.x, y: n.y + d.y, z: n.z + (d.z ?? 0) })) }
		case 'rect': case 'circle': case 'ellipse': case 'arc': return { ...g, centre: add(g.centre) }
		case 'polygon': return { ...g, pts: g.pts.map(add) }
		case 'text': return { ...g, at: add(g.at) }
		case 'dimension': return { ...g, a: add(g.a), b: add(g.b), ...(g.textAt ? { textAt: add(g.textAt) } : {}) }
		case 'leader': case 'cloud': return { ...g, pts: g.pts.map(add) }
		case 'image': return { ...g, centre: add(g.centre) }
		case 'insert': case 'legend': return { ...g, at: add(g.at) }
	}
}

/** Geometry in a block's own mm placed at `at`, turned `rot` degrees (clockwise on screen, as inserts are) and scaled by
 *  `scale` — what an insert draws, as shapes (explode). Heights (path z) are kept. */
export function placeGeometry(g: Geometry, at: Pt, rot = 0, scale = 1): Geometry {
	const r = (rot * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r)
	const P = (p: Pt): Pt => ({ x: at.x + (p.x * c - p.y * sn) * scale, y: at.y + (p.x * sn + p.y * c) * scale })
	const turn = (a?: number) => ((a ?? 0) + rot) % 360 || undefined
	switch (g.kind) {
		case 'path': return { ...g, nodes: g.nodes.map((n) => ({ ...n, ...P(n) })) }
		case 'rect': case 'image': return { ...g, centre: P(g.centre), size: { x: g.size.x * scale, y: g.size.y * scale }, rot: turn(g.rot) }
		case 'circle': return { ...g, centre: P(g.centre), r: g.r * scale }
		case 'ellipse': return { ...g, centre: P(g.centre), rx: g.rx * scale, ry: g.ry * scale, rot: turn(g.rot) }
		case 'arc': return { ...g, centre: P(g.centre), r: g.r * scale, start: g.start + rot, end: g.end + rot }
		case 'polygon': return { ...g, pts: g.pts.map(P) }
		case 'text': return { ...g, at: P(g.at), sizeMm: g.sizeMm * scale, rot: turn(g.rot), ...(g.width ? { width: g.width * scale } : {}) }
		case 'dimension': {
			const mode = rot && (g.mode === 'horizontal' || g.mode === 'vertical') ? 'rotated' : g.mode
			const angle = mode === 'rotated' ? (g.mode === 'vertical' ? 90 : g.mode === 'horizontal' ? 0 : g.angle ?? 0) + rot : g.angle
			return { ...g, a: P(g.a), b: P(g.b), offset: g.offset * scale, mode, ...(angle != null ? { angle } : {}), ...(g.textAt ? { textAt: P(g.textAt) } : {}) }
		}
		case 'leader': case 'cloud': return { ...g, pts: g.pts.map(P) }
		case 'insert': return { ...g, at: P(g.at), rot: turn(g.rot), scale: (g.scale ?? 1) * scale }
		case 'legend': return { ...g, at: P(g.at) }
	}
}

// ROTATE and MIRROR (backlog R92). Angles as everywhere (conventions.ts): degrees, clockwise on screen. Results are
// rounded to 1e-6 so a quarter turn lands on whole numbers.
const r6 = (v: number) => Math.round(v * 1e6) / 1e6 || 0
/** An orientation angle tidied to [0, 360). */
const tidyDeg = (a: number) => { const v = r6(((a % 360) + 360) % 360); return v === 360 ? 0 : v }
/** A `rot` field: 0 is left out, as everywhere else. */
const rotField = (a: number) => tidyDeg(a) || undefined

/** `p` turned `deg` about `c` (clockwise on screen). */
export function rotatePt(p: Pt, c: Pt, deg: number): Pt {
	const r = (deg * Math.PI) / 180, co = Math.cos(r), s = Math.sin(r), dx = p.x - c.x, dy = p.y - c.y
	return { x: r6(c.x + dx * co - dy * s), y: r6(c.y + dx * s + dy * co) }
}
/** `p` mirrored in the line through `a` and `b`. */
export function mirrorPt(p: Pt, a: Pt, b: Pt): Pt {
	const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy
	if (!l2) return p
	const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, fx = a.x + t * dx, fy = a.y + t * dy
	return { x: r6(2 * fx - p.x), y: r6(2 * fy - p.y) }
}
/** The angle of the line a → b (degrees, clockwise on screen). */
export const lineDeg = (a: Pt, b: Pt) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI

type Dim = Extract<Geometry, { kind: 'dimension' }>
/** A dimension with its points mapped by `P` (a turn or a mirror) and its offset kept on the same side of the measured
 *  points as before. A horizontal / vertical one stays so while its line still runs along an axis (a quarter turn
 *  swaps them); turned any other way it becomes an aligned dimension of the same length. */
function mapDim(g: Dim, P: (p: Pt) => Pt, turn: (a: number) => number): Dim {
	const a = P(g.a), b = P(g.b), extra = g.textAt ? { textAt: P(g.textAt) } : {}
	const perp = (d: Pt, l: number) => ({ x: -d.y / l, y: d.x / l })
	const offsetFor = (from: Pt, to: Pt, line: Pt) => {
		const l = Math.hypot(to.x - from.x, to.y - from.y), n = perp({ x: to.x - from.x, y: to.y - from.y }, l)
		return r6((line.x - from.x) * n.x + (line.y - from.y) * n.y)
	}
	if (g.mode === 'horizontal' || g.mode === 'vertical') {
		const h = g.mode === 'horizontal'
		const a2 = h ? { x: g.a.x, y: g.a.y + g.offset } : { x: g.a.x + g.offset, y: g.a.y }
		const A2 = P(a2), U = P({ x: a2.x + (h ? 1 : 0), y: a2.y + (h ? 0 : 1) }), u = { x: U.x - A2.x, y: U.y - A2.y }
		if (Math.abs(u.y) < 1e-6) return { ...g, a, b, mode: 'horizontal', offset: r6(A2.y - a.y), ...extra }
		if (Math.abs(u.x) < 1e-6) return { ...g, a, b, mode: 'vertical', offset: r6(A2.x - a.x), ...extra }
		const foot = P(h ? { x: g.b.x, y: g.a.y } : { x: g.a.x, y: g.b.y })   // the measured length, along the old axis
		if (Math.hypot(foot.x - a.x, foot.y - a.y) < 1e-9) return { ...g, a, b, ...extra }
		return { ...g, a, b: foot, mode: 'aligned', offset: offsetFor(a, foot, A2), ...extra }
	}
	const L = Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y)
	if (L < 1e-9) return { ...g, a, b, ...extra }
	const n = perp({ x: g.b.x - g.a.x, y: g.b.y - g.a.y }, L), A2 = P({ x: g.a.x + n.x * g.offset, y: g.a.y + n.y * g.offset })
	const angle = g.mode === 'rotated' && g.angle != null ? { angle: tidyDeg(turn(g.angle)) } : {}
	return { ...g, a, b, offset: offsetFor(a, b, A2), ...angle, ...extra }
}

/** Geometry turned `deg` (clockwise on screen) about `pivot`: points move, rotations add, an arc's ends turn. Heights
 *  (path z) are kept. A new value; the input is never changed. */
export function rotateGeometry(g: Geometry, pivot: Pt, deg: number): Geometry {
	const P = (p: Pt) => rotatePt(p, pivot, deg), turn = (a?: number) => rotField((a ?? 0) + deg)
	switch (g.kind) {
		case 'path': return { ...g, nodes: g.nodes.map((n) => ({ ...n, ...P(n) })) }
		case 'rect': case 'image': case 'ellipse': return { ...g, centre: P(g.centre), rot: turn(g.rot) }
		case 'circle': return { ...g, centre: P(g.centre) }
		case 'arc': return { ...g, centre: P(g.centre), start: tidyDeg(g.start + deg), end: tidyDeg(g.end + deg) }
		case 'polygon': case 'leader': case 'cloud': return { ...g, pts: g.pts.map(P) }
		case 'text': case 'insert': return { ...g, at: P(g.at), rot: turn(g.rot) }
		case 'dimension': return mapDim(g, P, (a) => a + deg)
		case 'legend': return { ...g, at: P(g.at) }
	}
}

/** Text the right way up: turned half round when a mirror left it reading upside down. */
const upsideDown = (a: number) => a > 90 + 1e-6 && a < 270 - 1e-6

/** Geometry mirrored in the line through `a` and `b`. A rotation `r` becomes 2θ − r (θ = the line's angle; a block
 *  insert's 2θ − r + 180, so its symbol's ±y axis — the way it points — is the mirror image); an arc's
 *  ends swap so it still sweeps clockwise; a dimension stays on its side. Text stays READABLE: its anchor point is
 *  mirrored but not its letters — turned the right way up, with left / right alignment swapped so it still ends where
 *  the mirror image would. An image is kept upright the same way (a picture can't be drawn back to front). */
export function mirrorGeometry(g: Geometry, a: Pt, b: Pt): Geometry {
	const th = lineDeg(a, b), P = (p: Pt) => mirrorPt(p, a, b), flip = (r?: number) => tidyDeg(2 * th - (r ?? 0))
	switch (g.kind) {
		case 'path': return { ...g, nodes: g.nodes.map((n) => ({ ...n, ...P(n) })) }
		// a block's symbol points along its local ±y (an outlet's, a tag's pointer): that axis mirrored is 2θ − r + 180
		case 'insert': return { ...g, at: P(g.at), rot: rotField(flip(g.rot) + 180) }
		// a box / ellipse looks the same turned half round: kept under 180° (a box with a front: behaviours.ts)
		case 'rect': case 'ellipse': return { ...g, centre: P(g.centre), rot: flip(g.rot) % 180 || undefined }
		case 'image': { const r = flip(g.rot); return { ...g, centre: P(g.centre), rot: rotField(upsideDown(r) ? r + 180 : r) } }
		case 'circle': return { ...g, centre: P(g.centre) }
		case 'arc': return { ...g, centre: P(g.centre), start: flip(g.end), end: flip(g.start) }
		case 'polygon': case 'leader': case 'cloud': return { ...g, pts: g.pts.map(P) }
		case 'text': {
			const r = flip(g.rot), turned = upsideDown(r)
			const align = turned && g.align !== 'centre' ? { align: g.align === 'right' ? 'left' as const : 'right' as const } : {}
			return { ...g, at: P(g.at), rot: rotField(turned ? r + 180 : r), ...align }
		}
		case 'dimension': return mapDim(g, P, (r) => 2 * th - r)
		case 'legend': return { ...g, at: P(g.at) }
	}
}

/** A closed region's outline in its own 2D space (a box's corners, an ellipse's / circle's points, a polygon). */
export function outlineOf(g: Geometry): Pt[] | null {
	switch (g.kind) {
		case 'rect': case 'image': {
			const r = ((g.rot ?? 0) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r), hx = g.size.x / 2, hy = g.size.y / 2
			return [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map(([x, y]) => ({ x: g.centre.x + x * c - y * s, y: g.centre.y + x * s + y * c }))
		}
		case 'circle': return ellipsePts({ centre: g.centre, rx: g.r, ry: g.r })
		case 'ellipse': return ellipsePts(g)
		case 'polygon': return g.pts
		default: return null
	}
}

type Arc = Extract<Geometry, { kind: 'arc' }>
const deg = (r: number) => (r * 180) / Math.PI
const cw = (a: number) => ((a % 360) + 360) % 360
/** An arc's sweep (degrees clockwise on screen, from `start` to `end`); a full turn when they meet. */
const sweepOf = (g: Arc) => cw(g.end - g.start) || 360
const onArc = (g: Arc, a: number): Pt => ({ x: g.centre.x + g.r * Math.cos((a * Math.PI) / 180), y: g.centre.y + g.r * Math.sin((a * Math.PI) / 180) })

/** The arc through three points (start, one on it, end — backlog "Arc"); null when they're in a line. */
export function arcThrough(a: Pt, m: Pt, b: Pt): Arc | null {
	const d = 2 * (a.x * (m.y - b.y) + m.x * (b.y - a.y) + b.x * (a.y - m.y))
	if (Math.abs(d) < 1e-9) return null
	const s = (p: Pt) => p.x * p.x + p.y * p.y
	const c = { x: (s(a) * (m.y - b.y) + s(m) * (b.y - a.y) + s(b) * (a.y - m.y)) / d, y: (s(a) * (b.x - m.x) + s(m) * (a.x - b.x) + s(b) * (m.x - a.x)) / d }
	const ang = (p: Pt) => deg(Math.atan2(p.y - c.y, p.x - c.x))
	const r1 = (v: number) => Math.round(v * 10) / 10, r3 = (v: number) => Math.round(v * 1000) / 1000
	const [sa, ma, ea] = [ang(a), ang(m), ang(b)]
	// clockwise from a to b — unless the middle point isn't on that way round: then clockwise from b to a
	const through = cw(ma - sa) < cw(ea - sa)
	return { kind: 'arc', centre: { x: r1(c.x), y: r1(c.y) }, r: r1(Math.hypot(a.x - c.x, a.y - c.y)), start: r3(cw(through ? sa : ea)), end: r3(cw(through ? ea : sa)) }
}
/** An arc's start, middle and end points (its grips). */
export function arcPoints(g: Arc): [Pt, Pt, Pt] {
	return [onArc(g, g.start), onArc(g, g.start + sweepOf(g) / 2), onArc(g, g.start + sweepOf(g))]
}
/** An arc as a polyline of about one point per 5°. */
export function arcPts(g: Arc): Pt[] {
	const sw = sweepOf(g), n = Math.max(2, Math.ceil(sw / 5))
	return Array.from({ length: n + 1 }, (_, i) => onArc(g, g.start + (sw * i) / n))
}

/** An ellipse as a closed outline of `n` points (drawing, PDF, DXF and picking use straight lines). */
export function ellipsePts(g: { centre: Pt; rx: number; ry: number; rot?: number }, n = 72): Pt[] {
	const r = ((g.rot ?? 0) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
	return Array.from({ length: n }, (_, i) => {
		const a = (i / n) * 2 * Math.PI, x = g.rx * Math.cos(a), y = g.ry * Math.sin(a)
		return { x: g.centre.x + x * c - y * s, y: g.centre.y + x * s + y * c }
	})
}

/** A segment is vertical when both ends share a plan position (to within 0.5 mm). */
export function isVertical(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
	return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5
}

/** Flat = drawn in 2D only: a path with no section, or anything else with no extent. */
export function isFlat(s: Pick<ShapeCore, 'geom' | 'section' | 'extent'>): boolean {
	return s.geom.kind === 'path' ? !s.section : !s.extent
}

/** Two elevation / section frames are one view's when they look the same way from the same origin. */
export function sameFrame(a: ElevFrame, b: ElevFrame): boolean {
	const near = (p: number, q: number) => Math.abs(p - q) < 1e-6
	return near(a.t.x, b.t.x) && near(a.t.y, b.t.y) && near(a.o.x, b.o.x) && near(a.o.y, b.o.y)
}

/** A FLAT shape drawn on an elevation's / section's plane (a note, a dimension, a line, a flat box) belongs to that
 *  one view (backlog "Shapes that belong to one elevation"): the frame of the view it shows in. Null = shown wherever
 *  its geometry falls (plan shapes, solids, runs). */
export function ownFrame(s: Pick<ShapeCore, 'geom' | 'section' | 'extent' | 'plane'>): ElevFrame | null {
	return s.plane?.kind === 'vertical' && isFlat(s) ? s.plane.frame : null
}

export function ownerOf(s: Owner): { kind: 'level' | 'view' | 'sheet'; id: Id } {
	return s.levelId ? { kind: 'level', id: s.levelId } : s.viewId ? { kind: 'view', id: s.viewId } : { kind: 'sheet', id: s.sheetId! }
}

/** Draw order (backlog "Draw order"): lower `order` first, so higher draws on top; equal keeps the list's order. */
export const byDrawOrder = (a: Shape, b: Shape): number => (a.order ?? 0) - (b.order ?? 0)

/** Ctrl+] / Ctrl+[ (Shift: to the front / back): the selected shapes' new `order` among the other shapes of the same
 *  owner (level or sheet). Forward = just above the next order up (or one up when they share theirs); front = above
 *  them all. Only the moved shapes change; [] = nothing to do. */
export function reorderShapes(all: Shape[], ids: string[], how: 'forward' | 'backward' | 'front' | 'back'): Shape[] {
	const sel = new Set(ids), out: Shape[] = []
	const owner = (s: Shape) => s.sheetId ?? s.levelId ?? ''
	for (const s of all) {
		if (!sel.has(s.id)) continue
		const others = all.filter((o) => !sel.has(o.id) && owner(o) === owner(s)).map((o) => o.order ?? 0)
		if (!others.length) continue
		const me = s.order ?? 0, up = how === 'forward' || how === 'front'
		let next = me
		if (how === 'front') next = Math.max(...others) + 1
		else if (how === 'back') next = Math.min(...others) - 1
		else {
			const beyond = others.filter((o) => (up ? o > me : o < me))
			next = beyond.length ? (up ? Math.min(...beyond) + 1 : Math.max(...beyond) - 1) : others.includes(me) ? me + (up ? 1 : -1) : me
		}
		if (how === 'front' && me > Math.max(...others)) next = me
		if (how === 'back' && me < Math.min(...others)) next = me
		if (next !== me) out.push({ ...s, order: next })
	}
	return out
}

/** The shape with its own line color / fill set; undefined or 'none' takes it off (By layer / no fill). */
export function withStyle(s: Shape, patch: { stroke?: string; fill?: string }): Shape {
	const st: NonNullable<Shape['style']> = { ...s.style }
	for (const k of ['stroke', 'fill'] as const) if (k in patch) { const v = patch[k]; if (v && v !== 'none') st[k] = v; else delete st[k] }
	return { ...s, style: Object.keys(st).length ? st : undefined }
}
/** A region with its fill color set ('none' / undefined = no fill; Properties → Fill). */
export const withFill = (s: Shape, fill: string | undefined): Shape => withStyle(s, { fill })
