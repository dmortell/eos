// SHIFT constrains (backlog "Shift constraints", Dave 2026-10-05): one helper for the path tool, node grips, moves and
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
