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
	/** Bend radius (mm), 0 = sharp. */
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
	| { kind: 'dimension'; a: Pt; b: Pt; offset: number; mode: 'aligned' | 'horizontal' | 'vertical' | 'rotated'; angle?: number; text?: string }
	/** Tip first. `attach` makes the tip follow an entity (an outlet, a rack, a shape). */
	| { kind: 'leader'; pts: Pt[]; text?: string; attach?: Id; /** A callout's frame round its words (backlog "Callouts"); absent = none. */ border?: 'underline' | 'box' }
	| { kind: 'cloud'; pts: Pt[]; arcMm?: number }
	| { kind: 'image'; fileId: string; page?: number; centre: Pt; size: { x: number; y: number }; rot?: number }
	/** A placed block. `linked` inserts follow edits to the definition; a copied insert was exploded into shapes. */
	| { kind: 'insert'; blockId: Id; at: Pt; rot?: number; scale?: number; attrs?: Record<string, string>; /** Attributes kept as data but not drawn (Properties → Attributes). */ hidden?: string[]; /** Height above FFL (mm): where it shows in elevations / sections (a wall faceplate). */ z?: number }
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
	/** A box / cabinet's doors (backlog "Door swings on other objects"), as racks have: drawn open on the plan, front = its
	 *  local +y (the back line is −y). */
	doors?: { front?: 'single' | 'split'; rear?: 'single' | 'split'; hinge?: 'left' | 'right' }
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
		case 'dimension': return { ...g, a: add(g.a), b: add(g.b) }
		case 'leader': case 'cloud': return { ...g, pts: g.pts.map(add) }
		case 'image': return { ...g, centre: add(g.centre) }
		case 'insert': case 'legend': return { ...g, at: add(g.at) }
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

/** The shape with its own line colour / fill set; undefined or 'none' takes it off (By layer / no fill). */
export function withStyle(s: Shape, patch: { stroke?: string; fill?: string }): Shape {
	const st: NonNullable<Shape['style']> = { ...s.style }
	for (const k of ['stroke', 'fill'] as const) if (k in patch) { const v = patch[k]; if (v && v !== 'none') st[k] = v; else delete st[k] }
	return { ...s, style: Object.keys(st).length ? st : undefined }
}
/** A region with its fill colour set ('none' / undefined = no fill; Properties → Fill). */
export const withFill = (s: Shape, fill: string | undefined): Shape => withStyle(s, { fill })
