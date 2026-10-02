// The DISPLAY LIST (analysis §6.6): what a generator outputs and every renderer / picker / exporter consumes. Plain
// data in the view's drawing mm (a plan: model mm, y down). `src` names the entity a prim draws, for picking.
import type { Id, Pt } from '../domain/types'

export type Prim =
	/** A polyline or polygon. `w` = a real width in drawing mm (a trunk, a wall); absent = a hairline. `color` overrides
	 *  the class colour (a patch cord's colour). `sub` = a part of the source entity (a port number). */
	| { k: 'line'; pts: Pt[]; closed?: boolean; fill?: boolean; w?: number; cls: string; src?: Id; sub?: string; color?: string }
	| { k: 'circle'; c: Pt; r: number; fill?: boolean; cls: string; src?: Id; sub?: string }
	/** Text: `size` in drawing mm (already scaled from paper mm by the generator). LOD: drawn only while the text is at
	 *  least `minPx` and at most `maxPx` screen px tall (port labels: short form when small, full form when big). */
	| { k: 'text'; at: Pt; text: string; size: number; anchor?: 'start' | 'middle' | 'end'; rot?: number; cls: string; src?: Id; sub?: string; minPx?: number; maxPx?: number }
	| { k: 'image'; url: string; x: number; y: number; w: number; h: number; opacity?: number; src?: Id }

export interface Bounds { x0: number; y0: number; x1: number; y1: number }

export function primBounds(p: Prim): Bounds {
	switch (p.k) {
		case 'line': {
			const pad = (p.w ?? 0) / 2
			const xs = p.pts.map((q) => q.x), ys = p.pts.map((q) => q.y)
			return { x0: Math.min(...xs) - pad, y0: Math.min(...ys) - pad, x1: Math.max(...xs) + pad, y1: Math.max(...ys) + pad }
		}
		case 'circle': return { x0: p.c.x - p.r, y0: p.c.y - p.r, x1: p.c.x + p.r, y1: p.c.y + p.r }
		case 'text': {
			const w = p.text.length * p.size * 0.6, x0 = p.anchor === 'middle' ? p.at.x - w / 2 : p.anchor === 'end' ? p.at.x - w : p.at.x
			return { x0, y0: p.at.y - p.size, x1: x0 + w, y1: p.at.y + p.size * 0.2 }
		}
		case 'image': return { x0: p.x, y0: p.y, x1: p.x + p.w, y1: p.y + p.h }
	}
}

export function unionBounds(bs: Bounds[]): Bounds | undefined {
	if (!bs.length) return undefined
	return bs.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }))
}
