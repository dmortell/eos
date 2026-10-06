// Drawing a block (an outlet's symbol or an insert shape) into display-list prims: each block shape transformed by the
// insert's position / rotation / scale (× the drawing scale for annotative blocks), `{LABEL}` attributes filled in.
import type { Id, Pt } from '../domain/types'
import { primBounds, unionBounds, type Prim } from './display'
import { fillAttrs, insertAttrs, type Block } from '../domain/blocks'
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
				// a text wholly on a filled shape of the block (a port count inside the symbol) is drawn white; a port count
				// on an outline symbol gets a small halo (`port-count`), so the symbol's lines don't cross it
				const tcls = onSolid(b, g, text) ? 'label on-fill' : g.text === '{PORTS}' ? 'label port-count' : 'label'
				if (text) out.push({ k: 'text', at: P(g.at), text, size: g.sizeMm * s, anchor: g.align === 'centre' ? 'middle' : g.align === 'right' ? 'end' : 'start', rot: (g.rot ?? 0) + rot || undefined, cls: tcls, src })
				break
			}
			default: break   // arcs, images and nested inserts in blocks come later
		}
	}
	return out
}

/** A block drawn small for a list (the legend, the Blocks panel): its prims at 1:1 and a padded viewBox round them. */
export function blockPreview(b: Block): { prims: Prim[]; viewBox: string } {
	const prims = blockPrims(b, { at: { x: 0, y: 0 } }, 1, insertAttrs(b), b.id, b.category === 'outlet' ? 'outlet outlet-low' : 'shape')   // its {TAGS} blank
	const bb = unionBounds(prims.map(primBounds)) ?? { x0: -1, y0: -1, x1: 1, y1: 1 }
	const pad = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) * 0.15 || 0.5
	return { prims, viewBox: `${bb.x0 - pad} ${bb.y0 - pad} ${bb.x1 - bb.x0 + 2 * pad} ${bb.y1 - bb.y0 + 2 * pad}` }
}

type TextGeom = Extract<Block['shapes'][number]['geom'], { kind: 'text' }>

/** Does this text (block-local mm) sit wholly inside one of the block's SOLID shapes? Its box is taken as 0.6 × size a
 *  character wide and 0.7 × size tall above the baseline. */
export function onSolid(b: Block, g: TextGeom, text: string): boolean {
	const w = text.length * g.sizeMm * 0.6, x0 = g.align === 'centre' ? g.at.x - w / 2 : g.align === 'right' ? g.at.x - w : g.at.x
	const y1 = g.at.y, y0 = y1 - g.sizeMm * 0.7
	const corners: Pt[] = [{ x: x0, y: y0 }, { x: x0 + w, y: y0 }, { x: x0 + w, y: y1 }, { x: x0, y: y1 }]
	return b.shapes.some((sh) => {
		if (sh.style?.fill !== 'solid') return false
		const s = sh.geom
		if (s.kind === 'circle') return corners.every((c) => Math.hypot(c.x - s.centre.x, c.y - s.centre.y) <= s.r)
		if (s.kind === 'rect' && !s.rot) return corners.every((c) => Math.abs(c.x - s.centre.x) <= s.size.x / 2 && Math.abs(c.y - s.centre.y) <= s.size.y / 2)
		if (s.kind === 'polygon') return corners.every((c) => inside(c, s.pts))
		return false
	})
}

function inside(p: Pt, pts: Pt[]): boolean {
	let r = false
	for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
		const a = pts[i], c = pts[j]
		if (a.y > p.y !== c.y > p.y && p.x < ((c.x - a.x) * (p.y - a.y)) / (c.y - a.y) + a.x) r = !r
	}
	return r
}
