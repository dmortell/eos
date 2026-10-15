// The DISPLAY LIST (analysis §6.6): what a generator outputs and every renderer / picker / exporter consumes. Plain
// data in the view's drawing mm (a plan: model mm, y down). `src` names the entity a prim draws, for picking.
import type { Id, Pt } from '../domain/types'

/** The scale plans and elevations are drawn at on screen (1:N): annotation (text, symbols) is sized for it. */
export const PLOT_SCALE = 100

export type { Prim, BlockInstance, Dash, Bounds } from '../domain/prim'
import type { Prim, Dash, Bounds } from '../domain/prim'
export const DASHES: Dash[] = ['dashed', 'dotted', 'dashdot']
/** Standard lineweights, paper mm. */
export const WEIGHTS = [0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1]


/** What a prim covers as drawn: inside its clip, when it has one (a section's long run is drawn only between the cut
 *  line's ends — its full length made the view, its datum lines and its fit 16 m wide; User 2026-10-15). */
export function primBounds(p: Prim): Bounds {
	const b = rawBounds(p), c = p.clip
	return c ? { x0: Math.max(b.x0, c.x0), y0: Math.max(b.y0, c.y0), x1: Math.min(b.x1, c.x1), y1: Math.min(b.y1, c.y1) } : b
}
function rawBounds(p: Prim): Bounds {
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
		case 'image': {
			if (!p.rot) return { x0: p.x, y0: p.y, x1: p.x + p.w, y1: p.y + p.h }
			const a = (p.rot * Math.PI) / 180, hw = (Math.abs(p.w * Math.cos(a)) + Math.abs(p.h * Math.sin(a))) / 2, hh = (Math.abs(p.w * Math.sin(a)) + Math.abs(p.h * Math.cos(a))) / 2
			const cx = p.x + p.w / 2, cy = p.y + p.h / 2
			return { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh }
		}
	}
}

export function unionBounds(bs: Bounds[]): Bounds | undefined {
	if (!bs.length) return undefined
	return bs.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }))
}
