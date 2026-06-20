// ---- 3D data model ----------------------------------------------------
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

// line -> wall: a base polyline (x,y) of `thickness`, extruded up from z by
// height h. (Effectively a rectangular sweep — like a conduit laid flat.)
export type Wall = {
	type: 'wall'
	z: number; h: number; thickness: number
	pts: Pt[]
}

// Conduit (sweep): an n-gon cross-section (w×h, edges) swept along a polyline
// path. Axis-aligned segments. 4 edges = rectangular trunk; 16/24 = round pipe.
export type Conduit = {
	type: 'conduit'
	path: { x: number; y: number; z: number }[]
	w: number; h: number
	edges: number // 3..24
}

export type Obj = Prism | Wall | Conduit
export type Model = { id: number; name: string; objects: Obj[] }

// ---- Views ------------------------------------------------------------
// View projection. Five orthographic directions + an isometric 3D view.
export type Dir = 'plan' | 'front' | 'rear' | 'left' | 'right' | 'iso'
export const DIRECTIONS: Dir[] = ['plan', 'front', 'rear', 'left', 'right', 'iso']
export const DIR_LABEL: Record<Dir, string> = { plan: 'plan', front: 'front', rear: 'rear', left: 'left', right: 'right', iso: 'ISO', }

// A view is a window on the paper page that looks into a model from a
// direction. Frame (fx,fy,fw,fh) is in paper mm; pan (mx,my) + scale map
// the projected drawing plane onto it.
export type View = {
	id: number
	modelId: number
	name: string
	direction: Dir
	fx: number; fy: number; fw: number; fh: number
	mx: number; my: number; scale: number
	yaw?: number // iso view: orbit angle around the vertical axis (radians)
	pitch?: number // iso view: elevation angle (radians; 0=side, π/2=top-down)
}

// View basis: which model axis maps to screen-horizontal (u) and
// screen-vertical (v, pointing up), with sign. Origin sits bottom-left.
export const BASIS: Record<Dir, { h: Axis; hs: number; v: Axis; vs: number }> = {
	plan:  { h: 'x', hs: 1,  v: 'y', vs: 1 },
	front: { h: 'x', hs: 1,  v: 'z', vs: 1 },
	rear:  { h: 'x', hs: -1, v: 'z', vs: 1 },
	right: { h: 'y', hs: 1,  v: 'z', vs: 1 },
	left:  { h: 'y', hs: -1, v: 'z', vs: 1 },
	iso:   { h: 'x', hs: 1,  v: 'z', vs: 1 }, // placeholder; iso is not edited in-plane
}

// ---- Paper / geometry constants ---------------------------------------
// A3 landscape, in mm.
export const PAPER = { w: 420, h: 297 }
export const MIN_FRAME = 10 // mm — smallest a view frame can be resized to

// Corner handles (offsets relative to the frame) for resizing a view.
export const HANDLES = [
	{ corner: 'nw', dx: 0, dy: 0, cur: 'nwse' },
	{ corner: 'ne', dx: 1, dy: 0, cur: 'nesw' },
	{ corner: 'sw', dx: 0, dy: 1, cur: 'nesw' },
	{ corner: 'se', dx: 1, dy: 1, cur: 'nwse' },
] as const

// Drawing-plane (u,v) point -> paper-mm within a view's frame. The vertical
// axis is flipped so increasing v extends upward, with origin bottom-left.
export const u2paper = (v: View, u: number) => v.fx + (u - v.mx) * v.scale
export const v2paper = (view: View, vv: number) => view.fy + view.fh - (vv - view.my) * view.scale
