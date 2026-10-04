// Drawing a block (an outlet's symbol or an insert shape) into display-list prims: each block shape transformed by the
// insert's position / rotation / scale (× the drawing scale for annotative blocks), `{LABEL}` attributes filled in.
import type { Id, Pt } from '../domain/types'
import { primBounds, unionBounds, type Prim } from './display'
import { fillAttrs, type Block } from '../domain/blocks'
import { rotate } from '../domain/conventions'

export interface Placement { at: Pt; rot?: number; scale?: number }

export function blockPrims(b: Block, pl: Placement, k: number, attrs: Record<string, string>, src: Id, cls: string): Prim[] {
	const s = (pl.scale ?? 1) * (b.annotative ? k : 1), rot = pl.rot ?? 0
	const P = (p: Pt): Pt => { const q = rotate({ x: p.x * s, y: p.y * s }, rot); return { x: pl.at.x + q.x, y: pl.at.y + q.y } }
	const out: Prim[] = []
	for (const sh of b.shapes) {
		const fill = sh.style?.fill === 'solid'
		const g = sh.geom
		switch (g.kind) {
			case 'path': {
				const nodes = new Map(g.nodes.map((n) => [n.id, n]))
				for (const sg of g.segs) {
					const a = nodes.get(sg.a), c = nodes.get(sg.b)
					if (a && c) out.push({ k: 'line', pts: [P(a), P(c)], cls, src })
				}
				break
			}
			case 'rect': {
				const hx = g.size.x / 2, hy = g.size.y / 2
				const pts = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map(([x, y]) => { const q = rotate({ x, y }, g.rot ?? 0); return P({ x: g.centre.x + q.x, y: g.centre.y + q.y }) })
				out.push({ k: 'line', pts, closed: true, fill, cls, src })
				break
			}
			case 'circle': out.push({ k: 'circle', c: P(g.centre), r: g.r * s, fill, cls, src }); break
			case 'polygon': out.push({ k: 'line', pts: g.pts.map(P), closed: true, fill, cls, src }); break
			case 'text': {
				const text = fillAttrs(g.text, attrs)
				if (text) out.push({ k: 'text', at: P(g.at), text, size: g.sizeMm * s, anchor: g.align === 'centre' ? 'middle' : g.align === 'right' ? 'end' : 'start', rot: (g.rot ?? 0) + rot || undefined, cls: 'label', src })
				break
			}
			default: break   // arcs, images and nested inserts in blocks come later
		}
	}
	return out
}

/** A block drawn small for a list (the legend, the Blocks panel): its prims at 1:1 and a padded viewBox round them. */
export function blockPreview(b: Block): { prims: Prim[]; viewBox: string } {
	const prims = blockPrims(b, { at: { x: 0, y: 0 } }, 1, { LABEL: '' }, b.id, b.category === 'outlet' ? 'outlet outlet-low' : 'shape')
	const bb = unionBounds(prims.map(primBounds)) ?? { x0: -1, y0: -1, x1: 1, y1: 1 }
	const pad = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) * 0.15 || 0.5
	return { prims, viewBox: `${bb.x0 - pad} ${bb.y0 - pad} ${bb.x1 - bb.x0 + 2 * pad} ${bb.y1 - bb.y0 + 2 * pad}` }
}
