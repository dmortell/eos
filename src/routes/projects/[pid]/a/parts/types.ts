// ---- Data model -------------------------------------------------------
// CAD models contain objects to be rendered. Coordinates are in model mm.
export type Pt = { x: number; y: number }

export type Obj =
	| { type: 'line'; points: Pt[] }
	| { type: 'rect'; x: number; y: number; w: number; h: number }
	| { type: 'circle'; x: number; y: number; r: number }

export type Model = { id: number; name: string; objects: Obj[] }

// A view is a window on the paper page that looks into a model. Its frame
// (fx,fy,fw,fh) is in paper mm; pan (mx,my) + scale map model mm onto it.
export type View = {
	id: number
	modelId: number
	name: string
	fx: number; fy: number; fw: number; fh: number
	mx: number; my: number; scale: number
}

// ---- Paper / geometry constants ---------------------------------------
// A3 landscape, in mm.
export const PAPER = { w: 420, h: 297 }
export const MIN_FRAME = 10 // mm — smallest a view frame can be resized to

// Corner handles (offsets relative to the frame) for resizing a selected view.
export const HANDLES = [
	{ corner: 'nw', dx: 0, dy: 0, cur: 'nwse' },
	{ corner: 'ne', dx: 1, dy: 0, cur: 'nesw' },
	{ corner: 'sw', dx: 0, dy: 1, cur: 'nesw' },
	{ corner: 'se', dx: 1, dy: 1, cur: 'nwse' },
] as const

// Model point -> paper-mm within a view's frame.
export const mx2paper = (v: View, x: number) => v.fx + (x - v.mx) * v.scale
export const my2paper = (v: View, y: number) => v.fy + (y - v.my) * v.scale
