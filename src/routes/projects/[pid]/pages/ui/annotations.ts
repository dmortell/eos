// Pure annotation geometry — the first module extracted from ui/Viewport.svelte (review.md §R1, step 1).
// These take their size as an explicit argument instead of reading the component's `paperMm` closure, so
// they are unit-testable and shared by the render snippets, PaperPage and (future) print.
import type { Pt, Ent } from './geometry'

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

/** A plan entity's outline points (plan coords) + whether it is a closed shape — for ground projection. */
export function groundPts(e: Ent): { pts: Pt[]; closed: boolean } {
	const ell = (cx: number, cy: number, rx: number, ry: number): Pt[] =>
		Array.from({ length: 32 }, (_, i) => { const t = (i / 32) * 2 * Math.PI; return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)] as Pt })
	if (e.type === 'line' || e.type === 'dim') return { pts: [e.a!, e.b!], closed: false }
	if (e.type === 'polyline') return { pts: e.pts ?? [], closed: false }
	if (e.type === 'rect') { const [ax, ay] = e.a!, [bx, by] = e.b!; return { pts: [[ax, ay], [bx, ay], [bx, by], [ax, by]], closed: true } }
	if (e.type === 'ellipse') return { pts: ell((e.a![0] + e.b![0]) / 2, (e.a![1] + e.b![1]) / 2, Math.abs(e.b![0] - e.a![0]) / 2, Math.abs(e.b![1] - e.a![1]) / 2), closed: true }
	return { pts: [], closed: false }
}
