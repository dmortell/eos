// A box's floor-tile grid (backlog "Floor-tile grid"): lines every `mm` across the box, from its top-left corner (in
// the box's own turned frame) shifted by an X / Y offset, so the grid can be lined up with the real floor's tiles.
// Only the lines INSIDE the box are made (the box's own outline is its edge). Pure geometry; views/plan.ts draws them.
import type { Pt } from './types'

export interface Tiles {
	/** Tile size (mm): the grid step. */
	mm: number
	/** Where the first line falls, from the box's left / top edge (mm; any number: only its remainder matters). */
	dx: number
	dy: number
}

/** A tile size of 600 mm (the usual floor tile), no offset. */
export const DEFAULT_TILES: Tiles = { mm: 600, dx: 0, dy: 0 }

/** More lines than this across one axis would be a black wall (and slow): the grid is left off and Properties says so. */
export const MAX_TILE_LINES = 300

/** The positions (mm from the edge, strictly inside 0..len) of the grid lines along one axis. */
export function tileOffsets(len: number, mm: number, off: number): number[] {
	if (!(mm > 0) || !(len > 0)) return []
	const eps = 1e-6, first = ((off % mm) + mm) % mm, out: number[] = []
	if (len / mm > MAX_TILE_LINES) return []
	for (let u = first; u < len - eps; u += mm) if (u > eps) out.push(Math.round(u * 1e6) / 1e6)
	return out
}

/** Whether the grid is too fine to draw on a box of this size. */
export function tilesTooFine(size: Pt, t: Tiles): boolean {
	return t.mm > 0 && (size.x / t.mm > MAX_TILE_LINES || size.y / t.mm > MAX_TILE_LINES)
}

/** The grid lines as segments in the box's local frame (origin at its centre, x right, y down): the first kind run the
 *  box's height, the second its width. */
export function tileLinesLocal(size: Pt, t: Tiles): [Pt, Pt][] {
	const hx = size.x / 2, hy = size.y / 2
	return [
		...tileOffsets(size.x, t.mm, t.dx).map((u): [Pt, Pt] => [{ x: u - hx, y: -hy }, { x: u - hx, y: hy }]),
		...tileOffsets(size.y, t.mm, t.dy).map((v): [Pt, Pt] => [{ x: -hx, y: v - hy }, { x: hx, y: v - hy }]),
	]
}
