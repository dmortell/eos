// Pure annotation geometry — the first module extracted from ui/Viewport.svelte (review.md §R1, step 1).
// These take their size as an explicit argument instead of reading the component's `paperMm` closure, so
// they are unit-testable and shared by the render snippets, PaperPage and (future) print.
import type { Pt, Ent, ElevDir, Head, Dash } from './geometry'
import type { Clip } from '../3dview/types'

/** Centre-out draw: given the centre `c` and the dragged corner `p`, the opposite corner is mirrored. */
export const centerCorners = (c: Pt, p: Pt): [Pt, Pt] => [[2 * c[0] - p[0], 2 * c[1] - p[1]], p]

/** Ortho lock: snap `p` to a horizontal or vertical line through `a` (whichever axis it is nearer). */
export const orthoPt = (a: Pt, p: Pt): Pt => (Math.abs(p[0] - a[0]) >= Math.abs(p[1] - a[1]) ? [p[0], a[1]] : [a[0], p[1]])

/** Shift-constrain a drawing point relative to the start `a`, per tool: Rectangle/Ellipse → square bbox
 *  (a circle for the ellipse); Line/Dimension → 15° angle increments (which includes ortho); anything
 *  else (free radius etc.) → unchanged. `shift` false → p unchanged. */
export function constrainPt(tool: string, a: Pt, p: Pt, shift: boolean): Pt {
	if (!shift) return p
	const dx = p[0] - a[0], dy = p[1] - a[1]
	if (tool === 'Rectangle' || tool === 'Ellipse') {
		const s = Math.max(Math.abs(dx), Math.abs(dy))
		return [a[0] + (dx < 0 ? -s : s), a[1] + (dy < 0 ? -s : s)]
	}
	if (tool === 'Line' || tool === 'Dimension') {
		const len = Math.hypot(dx, dy), step = Math.PI / 12   // 15°
		const ang = Math.round(Math.atan2(dy, dx) / step) * step
		return [a[0] + len * Math.cos(ang), a[1] + len * Math.sin(ang)]
	}
	return p
}

/** A filled arrowhead triangle AT `to`, pointing away from `from`. `size` = arrow length in MODEL units
 *  (callers pass 3.5·paperMm for annotative sizing, B3). Half-width is 0.4·size. Returns SVG polygon pts. */
export function arrowPts(from: Pt, to: Pt, size: number): string {
	const dx = to[0] - from[0], dy = to[1] - from[1], len = Math.hypot(dx, dy) || 1
	const ux = dx / len, uy = dy / len, vx = -uy, vy = ux, L = size, HW = size * 0.4
	const bx = to[0] - ux * L, by = to[1] - uy * L
	return `${to[0]},${to[1]} ${bx + vx * HW},${by + vy * HW} ${bx - vx * HW},${by - vy * HW}`
}

/** A REVISION CLOUD outline around the a→b rect: outward semicircle bumps along each edge. Clockwise
 *  winding (TL→TR→BR→BL) with sweep-flag 1 keeps every bump OUTSIDE (matches sheets/annotations cloudPath).
 *  `bump` = target bump diameter in MODEL units (callers pass ~4·paperMm). Returns an SVG path. */
/** The head at `to` for a line coming from `from` (XP33), sized in model mm (`size` = 3.5 paper mm ×
 *  paperMm, like the arrows): a filled ARROW, a filled DOT, or an architectural TICK (a 45° slash through
 *  the end point). null for 'none' / unset. */
export type HeadGeom = { kind: 'arrow'; pts: string } | { kind: 'dot'; c: Pt; r: number } | { kind: 'tick'; a: Pt; b: Pt }
export function headGeom(head: Head | undefined, from: Pt, to: Pt, size: number): HeadGeom | null {
	if (!head || head === 'none') return null
	if (head === 'arrow') return { kind: 'arrow', pts: arrowPts(from, to, size) }
	if (head === 'dot') return { kind: 'dot', c: to, r: size * 0.3 }
	const dx = to[0] - from[0], dy = to[1] - from[1], len = Math.hypot(dx, dy) || 1
	const ux = dx / len, uy = dy / len, h = (size * 0.5) / Math.SQRT2   // half-length size/2 → a `size`-long slash at 45°
	const tx = (ux - uy) * h, ty = (uy + ux) * h
	return { kind: 'tick', a: [to[0] - tx, to[1] - ty], b: [to[0] + tx, to[1] + ty] }
}

/** D7: where a line's text label sits — at the start, the middle (by length) or the end of the polyline —
 *  as an anchor point lifted `gap` off the line, the text-anchor, and an UPRIGHT rotation (deg) along the
 *  segment it sits on. null for fewer than 2 points. */
export type LabelPos = 'start' | 'mid' | 'end'
export function lineLabelAt(pts: Pt[], pos: LabelPos | undefined, gap: number): { p: Pt; anchor: 'start' | 'middle' | 'end'; rot: number } | null {
	if (pts.length < 2) return null
	let a: Pt, b: Pt, at: Pt, anchor: 'start' | 'middle' | 'end'
	if (pos === 'start') { a = pts[0]; b = pts[1]; at = pts[0]; anchor = 'start' }
	else if (pos === 'end') { a = pts[pts.length - 2]; b = pts[pts.length - 1]; at = b; anchor = 'end' }
	else {   // the middle of the whole run, on the segment that contains it
		const lens = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]))
		let half = lens.reduce((s, l) => s + l, 0) / 2, i = 0
		while (i < lens.length - 1 && half > lens[i]) { half -= lens[i]; i++ }
		a = pts[i]; b = pts[i + 1]; const t = lens[i] ? half / lens[i] : 0
		at = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; anchor = 'middle'
	}
	const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1
	let rot = (Math.atan2(dy, dx) * 180) / Math.PI
	const flip = rot > 90 || rot < -90
	if (flip) { rot += rot > 0 ? -180 : 180; if (anchor !== 'middle') anchor = anchor === 'start' ? 'end' : 'start' }
	// lift perpendicular, to the reading side (screen "up" once upright): the normal (dy, -dx) flips with the text
	const nx = (dy / len) * (flip ? -1 : 1), ny = (-dx / len) * (flip ? -1 : 1)
	return { p: [at[0] + nx * gap, at[1] + ny * gap], anchor, rot }
}

/** D2: a floor-tile grid's lines inside the a→b rect — every `tile` mm from the origin shifted by `off`, capped
 *  at 400 lines a direction (a tiny tile on a huge rect draws nothing rather than freezing). */
export function tileLines(a: Pt, b: Pt, tile: number, off: Pt = [0, 0]): [Pt, Pt][] {
	if (!(tile > 0)) return []
	const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1])
	if ((x1 - x0) / tile > 400 || (y1 - y0) / tile > 400) return []
	const out: [Pt, Pt][] = []
	for (let x = Math.ceil((x0 - off[0]) / tile) * tile + off[0]; x < x1; x += tile) if (x > x0) out.push([[x, y0], [x, y1]])
	for (let y = Math.ceil((y0 - off[1]) / tile) * tile + off[1]; y < y1; y += tile) if (y > y0) out.push([[x0, y], [x1, y]])
	return out
}

/** SVG stroke-dasharray for a line type (XP32), in SCREEN px (strokes are non-scaling), ÷ the ancestor CSS
 *  canvas zoom like the lineweights. undefined = solid. */
const DASHES: Record<Exclude<Dash, 'solid'>, number[]> = { dashed: [6, 4], dotted: [1, 3], dashdot: [8, 3, 1, 3] }
export function dashArray(dash: Dash | undefined, canvasZoom = 1): string | undefined {
	if (!dash || dash === 'solid') return undefined
	return DASHES[dash].map((v) => v / (canvasZoom || 1)).join(' ')
}

export function cloudPath(a: Pt, b: Pt, bump: number): string {
	const x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]), x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1])
	const D = Math.max(bump, 1)
	const edges: [Pt, Pt][] = [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]]]
	let d = `M ${x0} ${y0}`
	for (const [p, q] of edges) {
		const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, n = Math.max(1, Math.round(len / D)), step = len / n
		const ux = (q[0] - p[0]) / len, uy = (q[1] - p[1]) / len, r = step / 2
		for (let i = 1; i <= n; i++) { const ex = p[0] + ux * step * i, ey = p[1] + uy * step * i; d += ` A ${r} ${r} 0 0 1 ${ex} ${ey}` }
	}
	return d + ' Z'
}

/** The section marker's direction arrow, drawn INSIDE the clip rect: the observer stands at one edge and
 *  looks across, so the arrow's TAIL sits just inside the edge OPPOSITE the sight and the tip points the
 *  way the elevation looks — front = tail at the bottom edge pointing up, rear = top edge pointing down,
 *  right = left edge pointing right, left = right edge pointing left (matches the dropdown + ELEV_BASIS).
 *  `size` = arrow length in MODEL units (callers pass ~tolMm(11), a screen-constant size). Returns SVG
 *  polygon points (tip, then the two base corners). */
export function sectionArrowFor(c: Clip, dir: ElevDir, size: number): string {
	const x0 = Math.min(c.x0, c.x1), x1 = Math.max(c.x0, c.x1), y0 = Math.min(c.y0, c.y1), y1 = Math.max(c.y0, c.y1)
	const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, a = size
	const pad = a * 0.9
	let tail: Pt, d: Pt
	if (dir === 'front') { tail = [cx, y1 - pad]; d = [0, -1] }        // bottom edge, look up
	else if (dir === 'rear') { tail = [cx, y0 + pad]; d = [0, 1] }     // top edge, look down
	else if (dir === 'right') { tail = [x0 + pad, cy]; d = [1, 0] }    // left edge, look right
	else { tail = [x1 - pad, cy]; d = [-1, 0] }                        // right edge, look left
	const perp: Pt = [-d[1], d[0]], w = a * 0.8
	const tip: Pt = [tail[0] + d[0] * a * 1.8, tail[1] + d[1] * a * 1.8]
	const b1: Pt = [tail[0] + perp[0] * w, tail[1] + perp[1] * w], b2: Pt = [tail[0] - perp[0] * w, tail[1] - perp[1] * w]
	return `${tip[0]},${tip[1]} ${b1[0]},${b1[1]} ${b2[0]},${b2[1]}`
}

/** A plan entity's outline points (plan coords) + whether it is a closed shape — for ground projection. */
export function groundPts(e: Ent): { pts: Pt[]; closed: boolean } {
	const ell = (cx: number, cy: number, rx: number, ry: number): Pt[] =>
		Array.from({ length: 32 }, (_, i) => { const t = (i / 32) * 2 * Math.PI; return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)] as Pt })
	if (e.type === 'dim') return { pts: [e.a!, e.b!], closed: false }
	if (e.type === 'polyline') return { pts: e.pts ?? [], closed: false }
	if (e.type === 'rect') { const [ax, ay] = e.a!, [bx, by] = e.b!; return { pts: [[ax, ay], [bx, ay], [bx, by], [ax, by]], closed: true } }
	if (e.type === 'ellipse') return { pts: ell((e.a![0] + e.b![0]) / 2, (e.a![1] + e.b![1]) / 2, Math.abs(e.b![0] - e.a![0]) / 2, Math.abs(e.b![1] - e.a![1]) / 2), closed: true }
	return { pts: [], closed: false }
}
