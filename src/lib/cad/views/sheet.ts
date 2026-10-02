// The SHEET generator (Phase 4.1): a drawing sheet's paper, in paper mm from its top-left, y down. Each viewport
// draws its view (plan / elevation / rack row — the same generators as the panes) at 1:N into its window: view mm →
// paper mm = (p − centre) / N + the window's middle, clipped to the window. Viewport content isn't pickable on the
// sheet (only the viewport is); editing happens in the views themselves.
import type { Id } from '../domain/types'
import type { Sheet, Viewport } from '../domain/drawing'
import type { ProjectIndex } from '../domain/project'
import type { Prim, Bounds } from './display'
import { planDisplayList, type PlanOpts } from './plan'
import { elevationDisplayList } from './elevation'
import { rackRowDisplayList } from './rackRow'
import { spaceOf } from './space'

/** ISO A sizes, portrait (w × h, mm). */
export const PAPER: Record<Sheet['paper']['size'], [number, number]> = { A0: [841, 1189], A1: [594, 841], A2: [420, 594], A3: [297, 420], A4: [210, 297] }

/** The sheet's paper size in mm, as oriented. */
export function paperSize(s: Sheet): { w: number; h: number } {
	const [a, b] = PAPER[s.paper.size]
	return s.paper.orientation === 'landscape' ? { w: b, h: a } : { w: a, h: b }
}

export interface SheetOpts { underlay?: PlanOpts['underlay']; blocks?: PlanOpts['blocks'] }

/** A viewport's view, in the view's own drawing mm, drawn for paper at 1:N (annotation sizes follow the scale). */
export function viewportContent(ix: ProjectIndex, vp: Viewport, o: SheetOpts = {}): Prim[] {
	const v = vp.view, spec = v.spec
	if (spec.kind === 'row') return rackRowDisplayList(ix, spec)
	if (spec.kind === 'plan') return planDisplayList(ix, v.levelId, { scale: vp.scale, underlay: o.underlay, blocks: o.blocks })
	return elevationDisplayList(ix, v.levelId, spaceOf(spec), { scale: vp.scale })
}

/** View mm → paper mm for one viewport. */
export function toPaper(vp: Viewport): (p: { x: number; y: number }) => { x: number; y: number } {
	const mx = vp.rect.x + vp.rect.w / 2, my = vp.rect.y + vp.rect.h / 2, k = 1 / vp.scale
	return (p) => ({ x: mx + (p.x - vp.centre.x) * k, y: my + (p.y - vp.centre.y) * k })
}

/** One prim moved onto the paper: points through `t`, sizes by 1/N, clipped to the window, no longer pickable. */
function placePrim(p: Prim, t: ReturnType<typeof toPaper>, k: number, clip: Bounds): Prim {
	switch (p.k) {
		case 'line': return { ...p, pts: p.pts.map(t), ...(p.w ? { w: p.w * k } : {}), src: undefined, clip }
		case 'circle': return { ...p, c: t(p.c), r: p.r * k, src: undefined, clip }
		case 'text': return { ...p, at: t(p.at), size: p.size * k, src: undefined, clip }
		case 'image': { const a = t({ x: p.x, y: p.y }); return { ...p, x: a.x, y: a.y, w: p.w * k, h: p.h * k, src: undefined, clip } }
	}
}

export function sheetDisplayList(ix: ProjectIndex, sheet: Sheet, o: SheetOpts = {}): Prim[] {
	const { w, h } = paperSize(sheet), m = sheet.paper.marginMm
	const rect = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
	const out: Prim[] = [
		{ k: 'line', pts: rect(0, 0, w, h), closed: true, fill: true, cls: 'paper', src: sheet.id },
		{ k: 'line', pts: rect(m, m, w - m, h - m), closed: true, cls: 'paper-margin' },
	]
	for (const vp of sheet.viewports) {
		const r = vp.rect, clip = { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h }
		const t = toPaper(vp), k = 1 / vp.scale
		// an opaque window: a viewport laid over another hides what's under it
		out.push({ k: 'line', pts: rect(r.x, r.y, r.x + r.w, r.y + r.h), closed: true, fill: true, cls: 'viewport-bg' })
		for (const p of viewportContent(ix, vp, o)) out.push(placePrim(p, t, k, clip))
		// the window itself: what you pick and drag on the sheet
		out.push({ k: 'line', pts: rect(r.x, r.y, r.x + r.w, r.y + r.h), closed: true, fill: true, cls: vp.border === false ? 'viewport viewport-hidden' : 'viewport', src: sheet.id, sub: vp.id })
		if (vp.label) out.push({ k: 'text', at: { x: r.x, y: r.y + r.h + 5 }, text: `${vp.label}  1:${vp.scale}`, size: 3.5, cls: 'viewport-label' })
	}
	return out
}

/** A sensible first viewport: the middle half of the paper, at 1:100, centred on the level's content. */
export function defaultViewport(ix: ProjectIndex, sheet: Sheet, levelId: Id, id: Id): Viewport {
	const { w, h } = paperSize(sheet)
	const vp: Viewport = { id, view: { levelId, spec: { kind: 'plan' } }, rect: { x: w * 0.1, y: h * 0.1, w: w * 0.6, h: h * 0.75 }, scale: 100, centre: { x: 0, y: 0 } }
	return { ...vp, centre: contentCentre(ix, vp) }
}

/** The middle of what a viewport's view shows (for "Fit" and new viewports). */
export function contentCentre(ix: ProjectIndex, vp: Viewport, o: SheetOpts = {}): { x: number; y: number } {
	const ps = viewportContent(ix, vp, o).filter((p) => p.k !== 'image')
	if (!ps.length) return { x: 0, y: 0 }
	let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
	for (const p of ps) {
		const pts = p.k === 'line' ? p.pts : p.k === 'circle' ? [p.c] : p.k === 'text' ? [p.at] : []
		for (const q of pts) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y) }
	}
	return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }
}
