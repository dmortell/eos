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
	/** What the prim IS, for the code that acts on it (picking, port tips, overlays, layers, DXF) — `cls` only styles
	 *  it, so a renamed CSS class changes nothing else (hacky-code #6). Absent = nothing reads it by meaning. */
	role?: PrimRole
}

/** The meanings a prim is read by (hacky-code #6). Set by the generator alongside `cls`; a restyled copy (a hover, a
 *  highlight) keeps it.
 *  - `port` — a device's port CELL (closed; `src` = the device, `sub` = the port number): rack views, port grids
 *  - `port-label` — a port's label text over its cell (`src` / `sub` as the cell's when pickable)
 *  - `cord` — a patch cord's line (`src` = the cord)
 *  - `cord-stub` — a cord to another row: its stub down from the port and the "→ far end" under it (`src` = the cord;
 *    the Cord stubs layer, User 2026-10-20: too crowded to show all the time)
 *  - `device` — a device's body outline (`src` = the device)
 *  - `device-name` — a device's name drawn over its ports (no `src`: it takes no clicks)
 *  - `other-face` — a device on the rack's other face, outline and name (no `src`; the Other face layer)
 *  - `rack` — a rack's body (`src` = the rack)
 *  - `room-line` — a rack view's storey / room floor and ceiling lines and their labels (no `src`; the Room lines layer)
 *  - `viewport` — a sheet viewport's frame (`sub` = the viewport id)
 *  - `riser` — a containment run's riser: its symbol and label on a plan, its shaft in a riser view (the Risers layer)
 *  - `run` / `run-high` — a containment run's drawn body, low / high tier (DXF E-CONTAINMENT / -HIGH)
 *  - `run-pick` — a plan run's pick band (drawn along its centre line; DXF writes the run's outline instead)
 *  - `fill` — a region's fill under its outline (DXF: a solid hatch)
 *  - `datum` — an elevation's storey line (slab, ceiling, FFL, a room's floor) and its name (Fit leaves them out, as
 *    it does a rack view's `room-line`s)
 *  - `label` — an item's name by its symbol (outlet, rack), which the plan's run / riser labels move clear of
 *  - `run-label` — a containment run's name along it (moved clear of the labels; never boxed when selected)
 *  - `dim` / `dim-text` — a dimension's lines / its text (`src` = the dimension; its grips are found by them)
 *  - `opening-pick` — an opening's pick band in its wall (`sub` = the opening; never drawn as selected)
 *  - `paper` / `margin` — a sheet's paper and its margin line (snapped to when a viewport is dragged)
 *  - `title-block` — the title block's text (snapped to when a viewport is dragged) */
export type PrimRole = 'port' | 'port-label' | 'cord' | 'cord-stub' | 'device' | 'device-name' | 'other-face' | 'rack' | 'room-line' | 'viewport'
	| 'riser' | 'run' | 'run-high' | 'run-pick' | 'fill' | 'datum' | 'label' | 'run-label' | 'dim' | 'dim-text' | 'opening-pick'
	| 'paper' | 'margin' | 'title-block'

/** One placed block: its id, insertion point (drawing mm, y down), rotation (°), scale (incl. the annotative k), the
 *  filled attribute values, and the entity it draws. */
export interface BlockInstance { blockId: Id; at: Pt; rot: number; scale: number; attrs: Record<string, string>; src: Id }

/** Line types (backlog "Shape style"). */
export type Dash = 'dashed' | 'dotted' | 'dashdot'

export interface Bounds { x0: number; y0: number; x1: number; y1: number }
