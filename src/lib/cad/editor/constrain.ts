// SHIFT constrains (backlog "Shift constraints", User 2026-10-05): one helper for the path tool, node grips, moves and
// the shape tool. View coordinates (a plan's x / y, an elevation's u / −z, a sheet's paper mm).
import type { Pt } from '../domain/types'

const DEG = Math.PI / 180

/** `to` turned about `from` to the nearest `step`° (15° by default), keeping its distance along that ray. */
export function angleStep(from: Pt, to: Pt, step = 15): Pt {
	const dx = to.x - from.x, dy = to.y - from.y
	if (!dx && !dy) return to
	const a = Math.round(Math.atan2(dy, dx) / (step * DEG)) * step * DEG, c = Math.cos(a), s = Math.sin(a)
	const l = dx * c + dy * s   // the cursor's distance projected on the snapped ray
	const r = (v: number) => Math.round(v * 10) / 10
	return { x: r(from.x + l * c), y: r(from.y + l * s) }
}

/** A move kept horizontal or vertical: the smaller of its two components dropped. */
export const axisLock = (d: Pt): Pt => (Math.abs(d.x) >= Math.abs(d.y) ? { x: d.x, y: 0 } : { x: 0, y: d.y })

/** The corner opposite `a` with the box made square (each side as long as the longer one, keeping the drag's
 *  direction). */
export function squareCorner(a: Pt, b: Pt): Pt {
	const dx = b.x - a.x, dy = b.y - a.y, s = Math.max(Math.abs(dx), Math.abs(dy))
	return { x: a.x + (dx < 0 ? -s : s), y: a.y + (dy < 0 ? -s : s) }
}

/** A JUNCTION dragged with Shift (backlog "Shift constraints: junctions"): the point nearest `to` where the segments to
 *  ALL its neighbours `from` are on `step`° — as many of them as can be (the intersections of each pair's 15° rays;
 *  most segments on a step first, then nearest), kept within the junction's own reach of the pointer. One neighbour:
 *  plain `angleStep`. */
export function angleStepAll(from: Pt[], to: Pt, step = 15): Pt {
	if (from.length <= 1) return from.length ? angleStep(from[0], to, step) : to
	const dirs = Array.from({ length: Math.round(180 / step) }, (_, k) => k * step * DEG)
	const onStep = (p: Pt, q: Pt) => {
		const dx = q.x - p.x, dy = q.y - p.y
		if (Math.hypot(dx, dy) < 0.5) return true
		const a = (Math.atan2(dy, dx) / DEG) % step
		return Math.min(Math.abs(a), Math.abs(step - Math.abs(a))) < 0.05
	}
	const cands: Pt[] = from.map((p) => angleStep(p, to, step))
	for (let i = 0; i < from.length; i++) for (let j = i + 1; j < from.length; j++) {
		const p = from[i], q = from[j]
		for (const a of dirs) for (const b of dirs) {
			const ux = Math.cos(a), uy = Math.sin(a), vx = Math.cos(b), vy = Math.sin(b), den = ux * vy - uy * vx
			if (Math.abs(den) < 1e-9) continue
			const t = ((q.x - p.x) * vy - (q.y - p.y) * vx) / den
			cands.push({ x: p.x + ux * t, y: p.y + uy * t })
		}
	}
	const reach = Math.max(...from.map((p) => Math.hypot(p.x - to.x, p.y - to.y)))
	const r = (v: number) => Math.round(v * 10) / 10
	let best = cands[0], bestScore = -1, bestD = Infinity
	for (const c of cands) {
		const d = Math.hypot(c.x - to.x, c.y - to.y)
		if (d > reach) continue
		const score = from.filter((p) => onStep(p, c)).length
		if (score > bestScore || (score === bestScore && d < bestD)) { best = c; bestScore = score; bestD = d }
	}
	return { x: r(best.x), y: r(best.y) }
}
