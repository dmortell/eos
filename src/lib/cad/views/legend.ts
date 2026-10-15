// A LEGEND drawn (backlog "Legend on the drawing", User 2026-10-05): a framed table from its top-left point — its
// title, then a row per symbol (the block's own drawing, fitted in a square) or layer (a color swatch), its name and
// how many. Paper mm × k (1 on a sheet, the plot scale on a plan). Every prim is the legend's (picked / dragged as one).
import type { Pt } from '../domain/types'
import type { Prim } from './display'
import type { Block } from '../domain/blocks'
import type { LegendRow } from '../domain/legend'
import type { ProjectIndex } from '../domain/project'
import type { Shape } from '../domain/shapes'
import { legendCandidates, legendShown } from '../domain/legend'
import { blockPrims } from './blocks'
import { insertAttrs } from '../domain/blocks'
import { primBounds, unionBounds } from './display'

/** A prim moved and scaled about the origin: q → at + q × f. */
function place(p: Prim, f: number, at: Pt, src: string): Prim {
	const m = (q: Pt) => ({ x: at.x + q.x * f, y: at.y + q.y * f })
	if (p.k === 'line') return { ...p, pts: p.pts.map(m), ...(p.w ? { w: p.w * f } : {}), src }
	if (p.k === 'circle') return { ...p, c: m(p.c), r: p.r * f, src }
	if (p.k === 'text') return { ...p, at: m(p.at), size: p.size * f, src }
	return { ...p, x: at.x + p.x * f, y: at.y + p.y * f, w: p.w * f, h: p.h * f, src }
}

export function legendPrims(id: string, at: Pt, title: string, rows: LegendRow[], k: number, blockOf: (id: string) => Block | undefined, sizeMm = 2.5): Prim[] {
	const size = sizeMm * k, rowH = size * 2.2, pad = size * 0.6, icon = rowH * 0.8
	const nameW = Math.max(size * 8, ...rows.map((r) => r.name.length * size * 0.6))
	const w = pad + icon + pad + nameW + pad + size * 4 + pad
	const h = rowH * 1.3 + rows.length * rowH + pad
	const out: Prim[] = [
		{ k: 'line', pts: [at, { x: at.x + w, y: at.y }, { x: at.x + w, y: at.y + h }, { x: at.x, y: at.y + h }], closed: true, fill: true, cls: 'legend', src: id },
		{ k: 'text', at: { x: at.x + pad, y: at.y + rowH * 0.95 }, text: title, size: size * 1.2, cls: 'legend-title', src: id },
		{ k: 'line', pts: [{ x: at.x, y: at.y + rowH * 1.3 }, { x: at.x + w, y: at.y + rowH * 1.3 }], cls: 'legend-rule', src: id },
	]
	rows.forEach((r, i) => {
		const top = at.y + rowH * 1.3 + i * rowH, cx = at.x + pad + icon / 2, cy = top + rowH / 2
		if (r.kind === 'block') {
			const b = blockOf(r.id)
			const ps = b ? blockPrims(b, { at: { x: 0, y: 0 } }, 1, insertAttrs(b), id, b.category === 'outlet' ? 'outlet outlet-low' : 'shape') : []   // its {TAGS} blank
			const bb = unionBounds(ps.map(primBounds))
			if (bb) {
				const f = icon / Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0, 1e-6), mid = { x: (bb.x0 + bb.x1) / 2, y: (bb.y0 + bb.y1) / 2 }
				for (const p of ps) out.push(place(p, f, { x: cx - mid.x * f, y: cy - mid.y * f }, id))
			}
		} else {
			const s = icon * 0.7, sq = [{ x: cx - s / 2, y: cy - s / 2 }, { x: cx + s / 2, y: cy - s / 2 }, { x: cx + s / 2, y: cy + s / 2 }, { x: cx - s / 2, y: cy + s / 2 }]
			out.push({ k: 'line', pts: sq, closed: true, fill: true, cls: 'shape-fill', ...(r.color ? { color: r.color } : {}), src: id })
			out.push({ k: 'line', pts: sq, closed: true, cls: 'legend-rule', src: id })
		}
		out.push({ k: 'text', at: { x: at.x + pad + icon + pad, y: cy + size * 0.35 }, text: r.name, size, cls: 'legend-text', src: id })
		out.push({ k: 'text', at: { x: at.x + w - pad, y: cy + size * 0.35 }, text: String(r.count), size, anchor: 'end', cls: 'legend-text', src: id })
	})
	if (!rows.length) out.push({ k: 'text', at: { x: at.x + pad, y: at.y + rowH * 1.3 + rowH * 0.6 }, text: 'Nothing to list — choose rows in Properties', size: size * 0.8, cls: 'legend-text', src: id })
	return out
}

/** A legend shape as drawn over `levelIds` (its level; a sheet's: the levels its viewports show). */
export function legendShapePrims(ix: ProjectIndex, s: Shape, levelIds: ReadonlySet<string>, k: number, blockOf: (id: string) => Block | undefined = () => undefined): Prim[] {
	if (s.geom.kind !== 'legend') return []
	const rows = legendShown(legendCandidates(ix, levelIds, blockOf), s.geom.rows)
	return legendPrims(s.id, s.geom.at, s.geom.title?.trim() || 'LEGEND', rows, k, blockOf, s.geom.sizeMm)
}
