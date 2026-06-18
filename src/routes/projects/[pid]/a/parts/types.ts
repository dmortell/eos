// ---- 3D data model ----------------------------------------------------
// Coordinates are model mm. Axes: x = width (east), y = depth (north),
// z = height (up). Object sizes: w along x, d along y, h along z.
export type Pt = { x: number; y: number }
export type Axis = 'x' | 'y' | 'z'

// rect -> cuboid (axis-aligned box).
export type Cuboid = {
	type: 'cuboid'
	x: number; y: number; z: number
	w: number; h: number; d: number
}

// line -> wall: a base polyline (x,y) extruded up from z by height h.
export type Wall = {
	type: 'wall'
	z: number; h: number
	pts: Pt[]
}

// circle -> polygon: an n-gon footprint (center x,y, radius r) extruded
// up from z by height h. 16/24 edges read as a cylinder; 4 as a cuboid.
export type Polygon = {
	type: 'polygon'
	x: number; y: number; z: number
	r: number; h: number
	edges: number // 3..24
}

export type Obj = Cuboid | Wall | Polygon
export type Model = { id: number; name: string; objects: Obj[] }

// ---- Views ------------------------------------------------------------
// Orthographic projection direction. (A 3D view will be added later.)
export type Dir = 'plan' | 'front' | 'rear' | 'left' | 'right'
export const DIRECTIONS: Dir[] = ['plan', 'front', 'rear', 'left', 'right']

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
}

// View basis: which model axis maps to screen-horizontal (u) and
// screen-vertical (v, pointing up), with sign. Origin sits bottom-left.
export const BASIS: Record<Dir, { h: Axis; hs: number; v: Axis; vs: number }> = {
	plan:  { h: 'x', hs: 1,  v: 'y', vs: 1 },
	front: { h: 'x', hs: 1,  v: 'z', vs: 1 },
	rear:  { h: 'x', hs: -1, v: 'z', vs: 1 },
	right: { h: 'y', hs: 1,  v: 'z', vs: 1 },
	left:  { h: 'y', hs: -1, v: 'z', vs: 1 },
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
