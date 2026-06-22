// Pure geometry for annotations — bounds (for selection outline + hit area + handles), text
// metrics, and arrowhead markers. Real-mm space; `den` is the view's scale denominator so text
// (sized in points) maps to mm.
import type { Annotation } from '../types'

export const PT = 25.4 / 72
export type Box = { x: number; y: number; w: number; h: number }

/** Box-shaped kinds carry x,y (top-left) + w,h; line kinds use x,y + x2,y2. */
export const BOX_KINDS = new Set(['text', 'rect', 'ellipse', 'cloud', 'symbol', 'callout', 'image', 'grid'])
export const isBox = (a: Annotation) => BOX_KINDS.has(a.kind)
export const fontMmOf = (a: Annotation, den: number) => (a.fontPt ?? 8) * PT * (den || 1)

/** Wrapped text lines (split on explicit newlines). */
export const textLines = (a: Annotation) => (a.text ?? '').split('\n')

/** Text block metrics in mm. */
export function textMetrics(a: Annotation, den: number) {
	const fontMm = fontMmOf(a, den)
	const lineH = fontMm * 1.3
	const lines = textLines(a)
	const w = a.w ?? Math.max(1, ...lines.map(l => l.length)) * fontMm * 0.58
	const h = a.h ?? lines.length * lineH
	return { fontMm, lineH, lines, w, h }
}

/** Default box size (mm) for a new box annotation. */
export function defaultBox(kind: string, fontMm: number): { w: number; h: number } {
	if (kind === 'symbol') return { w: 1000, h: 1000 }
	if (kind === 'text') return { w: fontMm * 8, h: fontMm * 1.4 }
	if (kind === 'callout') return { w: fontMm * 8, h: fontMm * 2.8 }
	return { w: 3000, h: 2000 } // rect / cloud
}

/** Normalised box (top-left + size) for a box annotation. */
export function box(a: Annotation, den = 1): Box {
	// text + callout auto-size to their content (until a resize sets explicit w/h).
	if (a.kind === 'text' || a.kind === 'callout') { const m = textMetrics(a, den); return { x: a.x, y: a.y, w: m.w, h: m.h } }
	const d = defaultBox(a.kind, fontMmOf(a, den))
	return { x: a.x, y: a.y, w: a.w ?? d.w, h: a.h ?? d.h }
}
export function boxCentre(a: Annotation, den = 1) { const b = box(a, den); return { x: b.x + b.w / 2, y: b.y + b.h / 2 } }

/** Tight content bounds (mm) of any annotation. */
export function bounds(a: Annotation, den = 1): Box {
	if (isBox(a)) return box(a, den)
	const x2 = a.x2 ?? a.x, y2 = a.y2 ?? a.y
	return { x: Math.min(a.x, x2), y: Math.min(a.y, y2), w: Math.abs(x2 - a.x), h: Math.abs(y2 - a.y) }
}

/** SVG dash-array (drawing-mm) for a dash style. Dotted / dash-dot use a ~zero-length dash + round
 *  cap (see dashCap) so the dots render round, with tight gaps so they read as a dotted line. */
export const dashArray = (d?: string) => (d === 'dashed' ? '6 4' : d === 'dotted' ? '0.01 2' : d === 'dashdot' ? '6 2.5 0.01 2.5' : undefined)
/** Round caps turn the ~zero-length dashes of dotted / dash-dot into round dots. */
export const dashCap = (d?: string) => (d === 'dotted' || d === 'dashdot' ? 'round' : undefined)

/** Revision-cloud path: outward semicircular bumps around a rectangle. */
export function cloudPath(x: number, y: number, w: number, h: number, r: number): string {
	const edges: [number, number, number, number][] = [[x, y, x + w, y], [x + w, y, x + w, y + h], [x + w, y + h, x, y + h], [x, y + h, x, y]]
	let d = `M ${x} ${y}`
	for (const [ax, ay, bx, by] of edges) {
		const len = Math.hypot(bx - ax, by - ay) || 1
		const n = Math.max(1, Math.round(len / (r * 2)))
		const ux = (bx - ax) / len, uy = (by - ay) / len, step = len / n
		for (let i = 1; i <= n; i++) d += ` A ${step / 2} ${step / 2} 0 0 1 ${(ax + ux * step * i).toFixed(1)} ${(ay + uy * step * i).toFixed(1)}`
	}
	return d + ' Z'
}
