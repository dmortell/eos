// 3D model data model for the `model3d` viewport source. Ported from the `edit3d`
// tool, trimmed to model space only — paper-space (View/frame/scale) is owned by
// the sheets viewport, so a projection direction is just a source parameter.
//
// Coordinates are model mm. Axes: x = width (east), y = depth (north),
// z = height (up). Object sizes: w along x, d along y, h along z.
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
	nodes: GNode[]
	segments: CondSeg[]
}

// A drawing layer (model-scoped): controls object color, visibility and locking.
export type Layer = { id: string; name: string; color: string; visible: boolean; locked: boolean }

// Every object may belong to a layer (by id); unassigned objects fall back to
// the model's first layer.
export type Obj = (Prism | Wall | Conduit) & { layer?: string }

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
export type Model = { id: number; name: string; objects: Obj[]; layers?: Layer[]; underlays?: Underlay[] }

// Projection direction: five orthographic + an isometric 3D view.
export type Dir = 'plan' | 'front' | 'rear' | 'left' | 'right' | 'iso'
export const DIRECTIONS: Dir[] = ['plan', 'front', 'rear', 'left', 'right', 'iso']
export const DIR_LABEL: Record<Dir, string> = { plan: 'Plan', front: 'Front', rear: 'Rear', left: 'Left', right: 'Right', iso: '3D' }

// Axis-aligned model-space box; a section/elevation crop (cull + auto-frame).
export type Clip = { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }

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
