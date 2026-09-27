// Properties › SIZE on a ROTATED box (a 2D rect / ellipse, a 3D box / rack): a box turns about its CENTRE, so growing
// it from its unrotated top-left corner moved the centre and the whole thing slid (Dave: "when I change w/h … its
// position changes"). Keep the corner the user SEES — the top-left corner as drawn (rotated) — fixed instead. An
// unrotated box is unchanged: its top-left stays where it was, as before. Pure.
import type { Pt } from './geometry'

const rot = (v: Pt, deg: number): Pt => { const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c] }

/** A box at (x, y) sized w × d, turned `deg` about its centre, resized to w2 × d2 with its drawn top-left corner kept:
 *  its new unrotated top-left (x, y). */
export function resizeKeepCorner(x: number, y: number, w: number, d: number, deg: number, w2: number, d2: number): Pt {
	if (!deg) return [x, y]
	const c0: Pt = [x + w / 2, y + d / 2], off = rot([-w / 2, -d / 2], deg)
	const corner: Pt = [c0[0] + off[0], c0[1] + off[1]]   // the top-left corner where it is drawn
	const off2 = rot([w2 / 2, d2 / 2], deg)                 // …to the new centre along the box's own axes
	return [corner[0] + off2[0] - w2 / 2, corner[1] + off2[1] - d2 / 2]
}
