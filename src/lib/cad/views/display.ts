// The DISPLAY LIST (analysis §6.6): what a generator outputs and every renderer / picker / exporter consumes. Plain
// data in the view's drawing mm (a plan: model mm, y down). `src` names the entity a prim draws, for picking.
import type { Id, Pt } from '../domain/types'

/** The scale plans and elevations are drawn at on screen (1:N): annotation (text, symbols) is sized for it. */
export const PLOT_SCALE = 100

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
	| { k: 'image'; url: string; x: number; y: number; w: number; h: number; opacity?: number; src?: Id; fit?: 'contain' | 'centre'; /** drawn in black and white (screen and PDF) */ gray?: boolean }
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
export const DASHES: Dash[] = ['dashed', 'dotted', 'dashdot']
/** Standard lineweights, paper mm. */
export const WEIGHTS = [0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1]

export interface Bounds { x0: number; y0: number; x1: number; y1: number }

export function primBounds(p: Prim): Bounds {
	switch (p.k) {
		case 'line': {
			const pad = (p.w ?? 0) / 2
			const xs = p.pts.map((q) => q.x), ys = p.pts.map((q) => q.y)
			return { x0: Math.min(...xs) - pad, y0: Math.min(...ys) - pad, x1: Math.max(...xs) + pad, y1: Math.max(...ys) + pad }
		}
		case 'circle': return { x0: p.c.x - p.r, y0: p.c.y - p.r, x1: p.c.x + p.r, y1: p.c.y + p.r }
		case 'text': {
			const w = p.text.length * p.size * 0.6, x0 = p.anchor === 'middle' ? p.at.x - w / 2 : p.anchor === 'end' ? p.at.x - w : p.at.x
			const b = { x0, y0: p.at.y - p.size, x1: x0 + w, y1: p.at.y + p.size * 0.2 }
			if (!p.rot) return b
			// turned text (a 0U PDU's name up its strip): the box turned about its anchor, as SVG's rotate() draws it
			const a = (p.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
			const pts = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]].map(([x, y]) => ({ x: p.at.x + (x - p.at.x) * c - (y - p.at.y) * s, y: p.at.y + (x - p.at.x) * s + (y - p.at.y) * c }))
			return { x0: Math.min(...pts.map((q) => q.x)), y0: Math.min(...pts.map((q) => q.y)), x1: Math.max(...pts.map((q) => q.x)), y1: Math.max(...pts.map((q) => q.y)) }
		}
		case 'image': return { x0: p.x, y0: p.y, x1: p.x + p.w, y1: p.y + p.h }
	}
}

export function unionBounds(bs: Bounds[]): Bounds | undefined {
	if (!bs.length) return undefined
	return bs.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }))
}
