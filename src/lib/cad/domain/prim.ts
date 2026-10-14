// The DISPLAY LIST's types (views/display.ts re-exports them): what a generator outputs and every renderer / picker /
// exporter consumes. They live in domain/ because domain code (fields, issue) names them too; views/ builds on them.
import type { Id, Pt } from './types'

export type Prim = (
	/** A polyline or polygon. `w` = a real width in drawing mm (a trunk, a wall); absent = a hairline. `sub` = a part of
	 *  the source entity (a port number). */
	| { k: 'line'; pts: Pt[]; closed?: boolean; fill?: boolean; w?: number; cls: string; src?: Id; sub?: string
		/** A closed, filled outline's holes (a ring of runs): drawn as edges, left unfilled (even-odd). */
		holes?: Pt[][] }
	| { k: 'circle'; c: Pt; r: number; fill?: boolean; cls: string; src?: Id; sub?: string }
	/** Text: `size` in drawing mm (already scaled from paper mm by the generator). LOD: drawn only while the text is at
	 *  least `minPx` and at most `maxPx` screen px tall (port labels: short form when small, full form when big). */
	| { k: 'text'; at: Pt; text: string; size: number; anchor?: 'start' | 'middle' | 'end'; rot?: number; cls: string; src?: Id; sub?: string; minPx?: number; maxPx?: number }
	/** `fit: 'contain'` keeps the image's own proportions inside the box, at its left (a logo); `'centre'` the same,
 *  centred (an image shape); else it fills the box (a floorplan). */
	| { k: 'image'; url: string; x: number; y: number; w: number; h: number; opacity?: number; src?: Id; fit?: 'contain' | 'centre'; /** drawn in black and white (screen and PDF) */ gray?: boolean
		/** Turned (degrees, clockwise on screen) about the box's centre: a turned image shape. */
		rot?: number
		/** Its dark lines drawn in red (W7: the floorplan revision compared with; screen only). */
		tint?: 'red' }
) & {
	/** Drawn only inside this rectangle (a sheet viewport's window, in the same drawing mm). */
	clip?: Bounds
	/** Overrides the class color: the item's own (a patch cord's color), else its layer's (views/layers.ts). */
	color?: string
	/** A shape's own lineweight (paper mm) and line type (backlog "Shape style"); absent = its class's. */
	weight?: number
	dash?: Dash
	/** The layer it's on, set by views/layers.ts (none = always shown: paper, title block, datums). */
	layer?: Id
	/** Drawn from a BLOCK (an outlet's symbol, an insert): which, where, and its attribute values — so the DXF can write
	 *  one INSERT of a BLOCK instead of loose lines (backlog "DXF blocks as BLOCK + INSERT"). Shared by all its prims. */
	ins?: BlockInstance
}

/** One placed block: its id, insertion point (drawing mm, y down), rotation (°), scale (incl. the annotative k), the
 *  filled attribute values, and the entity it draws. */
export interface BlockInstance { blockId: Id; at: Pt; rot: number; scale: number; attrs: Record<string, string>; src: Id }

/** Line types (backlog "Shape style"). */
export type Dash = 'dashed' | 'dotted' | 'dashdot'

export interface Bounds { x0: number; y0: number; x1: number; y1: number }
