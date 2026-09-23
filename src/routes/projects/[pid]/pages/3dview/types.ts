// Ported verbatim from sheets/tools/model3d (the mature 3D engine) for the Pages 3D model — see model-plan.md.
// 3D model data model for the `model3d` viewport source. Ported from the `edit3d`
// tool, trimmed to model space only — paper-space (View/frame/scale) is owned by
// the sheets viewport, so a projection direction is just a source parameter.
//
// Coordinates are model mm. Axes: x = width (east), y = depth (north),
// z = height (up). Object sizes: w along x, d along y, h along z.
import type { Ent, ElevDir } from '../ui/geometry'   // 2D annotation entity + elevation direction (geometry.ts imports nothing from 3dview → no cycle)
export type Pt = { x: number; y: number }
export type Axis = 'x' | 'y' | 'z'

// Prism: an n-gon footprint inscribed in the w×d box [x..x+w]×[y..y+d],
// extruded up from z by height h. 4 edges = axis-aligned box; 16/24 read as
// a cylinder; non-square w/d give an elliptical/stadium prism.
export type Prism = {
	type: 'prism'
	x: number; y: number; z: number
	w: number; h: number; d: number
	edges: number // 3..24
	rot?: number  // rotation about the vertical (z) axis, degrees, about the footprint centre
	rotX?: number // tilt about the model x-axis, degrees, about the box centre (0 = upright)
	rotY?: number // tilt about the model y-axis, degrees, about the box centre (0 = upright)
	// Opening subtype (only meaningful for a prism on an `opening` layer): 'door' draws a leaf + swing
	// arc in plan, 'window' draws glazing + sill/head, 'hole' is a plain masked gap. `swing` = door leaf
	// angle in degrees (default 90), `flip` = hinge side / swing handedness (mirror).
	open?: 'door' | 'window' | 'hole'
	swing?: number
	flip?: boolean
}

// Wall + Conduit are swept primitives over a node/segment graph (see graph.ts).
// `nodes` are the path vertices; `segments` connect them and may carry per-segment
// profile overrides (falling back to the object's default). Object `h`/thickness/
// w/edges are the defaults. A node shared by 3+ segments is a branch/junction.
import type { GNode, GSeg } from './graph'

// Wall: a flat ribbon of `thickness`, extruded up from each node's z by height h.
export type WallSeg = GSeg & { thickness?: number; h?: number }
export type Wall = {
	type: 'wall'
	h: number; thickness: number
	nodes: GNode[]
	segments: WallSeg[]
}

// Conduit: an n-gon cross-section (w×h, edges) swept along the path. 4 edges =
// rectangular trunk; 16/24 = round pipe.
export type CondSeg = GSeg & { w?: number; h?: number; edges?: number }
export type Conduit = {
	type: 'conduit'
	w: number; h: number; edges: number // 3..24
	bend?: number // default corner fillet radius (mm); a node's own `bend` overrides it
	nodes: GNode[]
	segments: CondSeg[]
}

// A drawing layer (model-scoped): controls object color, visibility and locking.
// R5 (review.md §R5): the ONE layer type. A model's `layers` list files BOTH its 3D objects and its 2D
// entities (annotations, outlets, trunks, background images); array order = draw order for entities.
// weight = non-scaling lineweight (screen px); opening = objects on this layer CUT the wall (masked hole +
// frame); group = the Layers-panel heading (undefined = 'Model', the object layers); swatch/dash = how the
// panel draws the layer's chip (a colour fill, or a line of that dash).
export type Layer = { id: string; name: string; color: string; visible: boolean; locked: boolean; weight?: number; opening?: boolean;
	group?: string; swatch?: 'color' | 'line'; dash?: 'solid' | 'dashed' | 'dotted' }

// Every object may belong to a layer (by id); unassigned objects fall back to
// the model's first layer.
// `id` is a stable per-object identity (assigned on create, backfilled by migrate).
// Selection is keyed by id, not array index, so it survives reordering/insert/delete.
export type Obj = (Prism | Wall | Conduit) & { layer?: string; id?: string; groupId?: string }

// A PDF/image underlay placed in one projection plane (e.g. a floorplan under
// the plan view). A model can hold several per direction; array order is the
// z-order (later = on top). Initial position/size come from the file's per-page
// calibration (origin/scale, like the outlets floorplan); `rect` (world-mm) is
// the explicit placement once moved/resized (clear it to reset to calibration).
// `flip` mirrors the image vertically to align a y-down floorplan to model y-up.
export type UnderlayRect = { x: number; y: number; w: number; h: number }
export type Underlay = {
	id: string
	dir: Dir
	fileId: string
	pageNum?: number
	opacity?: number
	flip?: boolean
	rect?: UnderlayRect
}
// Building levels (z heights, model mm) drawn as horizontal datum lines in
// elevation views only — not as real objects. Shared model defaults; any can be
// omitted to hide that line. Order low→high: structural floor slab, raised/access
// floor (FFL), suspended ceiling tile, structural ceiling slab/soffit.
export type Levels = { floorSlab?: number; raisedFloor?: number; ceilingTile?: number; ceilingSlab?: number }

// Alignment GUIDE (Visio-style): a full-view horizontal/vertical line that sets the DEPTH PLANE for
// cross-view drawing (a plan guide fixes the off-axis depth when drawing a conduit in an elevation).
// Model-scoped (lives in the model, shown across its views) — undo/redo ride the model history snapshot.
// `plane` = the drawing plane it belongs to ('plan' | ElevDir); `pos` is a drawing coord in that plane.
// Guides are always model-scoped (no `space` scope field needed). Field names are Firestore-stable
// (id/plane/orient/pos), matching entities' `plane` — see [[project_pages_firestore_schema]].
export type Guide = { id: string; plane: string; orient: 'h' | 'v'; pos: number }

// A SECTION marker drawn on the plan: a clip box + the primary sight direction (which elevation it cuts)
// + a display name. Model-scoped (rides the model snapshot → undoable, and a cut on one model's plan does
// NOT show on another's). Firestore-stable (id/clip/dir/name). Its elevations are dropped onto a sheet as
// viewport frames; the marker itself just lives here. (B5 — moved out of the +page per-tab maps.)
export type Section = { id: string; clip: Clip; dir: ElevDir; name?: string }

// `objects` = 3D geometry (walls/prisms/conduits). `ents` = 2D annotations/shapes/text/dims (the drawn
// `Ent`s from ui/geometry.ts), each tagged with a `plane` + `space` scope. Both belong to the model and
// are shown across its views (layer- and scope-gated). Guides likewise. `Ent` imports cleanly (geometry.ts
// imports nothing from 3dview, so no cycle). Field names Firestore-stable — see the schema memory.
export type Model = { id: number; name: string; objects: Obj[]; ents?: Ent[]; guides?: Guide[]; sections?: Section[]; layers?: Layer[]; underlays?: Underlay[]; levels?: Levels }

// Projection direction: five orthographic + an isometric 3D view.
export type Dir = 'plan' | 'front' | 'rear' | 'left' | 'right' | 'iso'
export const DIRECTIONS: Dir[] = ['plan', 'front', 'rear', 'left', 'right', 'iso']
export const DIR_LABEL: Record<Dir, string> = { plan: 'Plan', front: 'Front', rear: 'Rear', left: 'Left', right: 'Right', iso: '3D' }

// Axis-aligned model-space box; a section/elevation crop (cull + auto-frame).
export type Clip = { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }

// A section marker on the plan = another viewport's clip + its editable properties. The plan
// editor reads these via sectionsProvider and edits them via onSectionUpdate (host applies to
// the elevation viewport). `layer` files the marker so it can be hidden with that layer.
export type SectionInfo = { id: string; clip: Clip; label?: string; direction?: Dir; scale?: number; layer?: string; hiddenLines?: boolean; bw?: boolean }

// View basis: which model axis maps to drawing-plane horizontal (u) and
// vertical (v, pointing up), with sign. Origin sits bottom-left.
export const BASIS: Record<Dir, { h: Axis; hs: number; v: Axis; vs: number }> = {
	plan:  { h: 'x', hs: 1,  v: 'y', vs: 1 },
	front: { h: 'x', hs: 1,  v: 'z', vs: 1 },
	rear:  { h: 'x', hs: -1, v: 'z', vs: 1 },
	right: { h: 'y', hs: 1,  v: 'z', vs: 1 },
	left:  { h: 'y', hs: -1, v: 'z', vs: 1 },
	iso:   { h: 'x', hs: 1,  v: 'z', vs: 1 }, // placeholder; iso is not edited in-plane
}
