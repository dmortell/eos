// O19 AREA / perimeter — pure measures for the AREA command (tested in area.test.ts). Units are the drawing's (mm).
import type { Ent, Pt } from './geometry'

/** A closed polygon's area (shoelace, always ≥ 0) and perimeter (the closing edge included). */
export function polyMeasure(pts: Pt[]): { area: number; perimeter: number } {
	const n = pts.length
	if (n < 2) return { area: 0, perimeter: 0 }
	let a = 0, p = 0
	for (let i = 0; i < n; i++) {
		const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n]
		a += x0 * y1 - x1 * y0
		p += Math.hypot(x1 - x0, y1 - y0)
	}
	return { area: n < 3 ? 0 : Math.abs(a) / 2, perimeter: n === 2 ? p / 2 : p }   // two points: a line, not a loop
}

/** A shape's area + perimeter: a rect, an ellipse (Ramanujan's perimeter), or a closed polyline (last point = first, or
 *  3+ points — a polyline's loop is measured closed). null = not an area (a line, text, a dimension …). */
export function entMeasure(e: Ent): { area: number; perimeter: number } | null {
	if ((e.type === 'rect' || e.type === 'ellipse') && e.a && e.b) {
		const w = Math.abs(e.b[0] - e.a[0]), h = Math.abs(e.b[1] - e.a[1])
		if (e.type === 'rect') return { area: w * h, perimeter: 2 * (w + h) }
		const a = w / 2, b = h / 2, t = ((a - b) / (a + b || 1)) ** 2
		return { area: Math.PI * a * b, perimeter: Math.PI * (a + b) * (1 + (3 * t) / (10 + Math.sqrt(4 - 3 * t))) }
	}
	if (e.type === 'polyline' && (e.pts?.length ?? 0) >= 3) {
		const pts = e.pts!, last = pts[pts.length - 1], closed = last[0] === pts[0][0] && last[1] === pts[0][1]
		return polyMeasure(closed ? pts.slice(0, -1) : pts)
	}
	return null
}

/** "12.35 m² (12,345,678 mm²)" — m² for anything over 0.01 m², else mm² only. */
export const fmtArea = (mm2: number): string => {
	const m2 = mm2 / 1e6, mm = Math.round(mm2).toLocaleString('en-US')
	return m2 >= 0.01 ? `${Math.round(m2 * 100) / 100} m² (${mm} mm²)` : `${mm} mm²`
}
