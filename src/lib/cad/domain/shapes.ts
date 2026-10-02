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
	| { kind: 'polygon'; pts: Pt[] }
	/** Angles in degrees, clockwise on screen (conventions.ts), swept from start to end. */
	| { kind: 'arc'; centre: Pt; r: number; start: number; end: number }
	/** Text and notes. `width` set = a wrapping note box; `markdown` allows lists and tables. Sizes are paper mm. */
	| { kind: 'text'; at: Pt; text: string; sizeMm: number; rot?: number; width?: number; markdown?: boolean; align?: 'left' | 'centre' | 'right' }
	| { kind: 'dimension'; a: Pt; b: Pt; offset: number; mode: 'aligned' | 'horizontal' | 'vertical' | 'rotated'; angle?: number; text?: string }
	/** Tip first. `attach` makes the tip follow an entity (an outlet, a rack, a shape). */
	| { kind: 'leader'; pts: Pt[]; text?: string; attach?: Id }
	| { kind: 'cloud'; pts: Pt[]; arcMm?: number }
	| { kind: 'image'; fileId: string; page?: number; centre: Pt; size: { x: number; y: number }; rot?: number }
	/** A placed block. `linked` inserts follow edits to the definition; a copied insert was exploded into shapes. */
	| { kind: 'insert'; blockId: Id; at: Pt; rot?: number; scale?: number; attrs?: Record<string, string> }

export type GeometryKind = Geometry['kind']

/** A path that bounds a room or space: walls host openings, and doors / windows move with their wall. */
export interface WallRole {
	kind: 'wall'
	openings: Opening[]
}

/** Trunking, conduit, tray, ladder, riser: carries cables, so it routes links and counts towards fill and the BOM. */
export interface ContainmentRole {
	kind: 'containment'
	form: 'trunk' | 'conduit' | 'tray' | 'ladder'
	tier: Tier | 'wall'
	/** Server rooms this run may carry cables to (empty = any) — the Outlets tool's routing filter. */
	serves?: Id[]
	primary?: boolean
}

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

/** Hosted on a wall segment: it moves with the wall (ADR 0004). */
export interface Opening {
	id: Id
	segId: Id
	/** Centre, mm along the segment from its `a` node. */
	at: number
	width: number
	sill: number
	head: number
	kind: 'door' | 'window' | 'hole'
	swing?: 'left' | 'right'
	flip?: boolean
}

export interface ShapeCore {
	type: 'shape'
	id: Id
	geom: Geometry
	/** Non-path shapes in a level's model: the plane they lie on (absent = plan at z 0). */
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
	style?: { stroke?: string; fill?: string; weightMm?: number; dash?: string }
}

export type Shape = ShapeCore & Owner

/** Geometry shifted by d (path nodes also by d.z). A new value; the input is never changed. */
export function moveGeometry(g: Geometry, d: { x: number; y: number; z?: number }): Geometry {
	const add = (p: Pt): Pt => ({ x: p.x + d.x, y: p.y + d.y })
	switch (g.kind) {
		case 'path': return { ...g, nodes: g.nodes.map((n) => ({ ...n, x: n.x + d.x, y: n.y + d.y, z: n.z + (d.z ?? 0) })) }
		case 'rect': case 'circle': case 'arc': return { ...g, centre: add(g.centre) }
		case 'polygon': return { ...g, pts: g.pts.map(add) }
		case 'text': return { ...g, at: add(g.at) }
		case 'dimension': return { ...g, a: add(g.a), b: add(g.b) }
		case 'leader': case 'cloud': return { ...g, pts: g.pts.map(add) }
		case 'image': return { ...g, centre: add(g.centre) }
		case 'insert': return { ...g, at: add(g.at) }
	}
}

/** A segment is vertical when both ends share a plan position (to within 0.5 mm). */
export function isVertical(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
	return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5
}

/** Flat = drawn in 2D only: a path with no section, or anything else with no extent. */
export function isFlat(s: Pick<ShapeCore, 'geom' | 'section' | 'extent'>): boolean {
	return s.geom.kind === 'path' ? !s.section : !s.extent
}

export function ownerOf(s: Owner): { kind: 'level' | 'view' | 'sheet'; id: Id } {
	return s.levelId ? { kind: 'level', id: s.levelId } : s.viewId ? { kind: 'view', id: s.viewId } : { kind: 'sheet', id: s.sheetId! }
}
