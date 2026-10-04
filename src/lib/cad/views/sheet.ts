// The SHEET generator (Phase 4.1): a drawing sheet's paper, in paper mm from its top-left, y down. Each viewport
// draws its view (plan / elevation / rack row — the same generators as the panes) at 1:N into its window: view mm →
// paper mm = (p − centre) / N + the window's middle, clipped to the window. Viewport content isn't pickable on the
// sheet (only the viewport is); editing happens in the views themselves.
import type { Id } from '../domain/types'
import type { Sheet, Viewport, SectionCut } from '../domain/drawing'
import type { Shape } from '../domain/shapes'
import type { ProjectIndex } from '../domain/project'
import type { Prim, Bounds } from './display'
import { planDisplayList, shapePrims, type PlanOpts } from './plan'
import { elevationDisplayList } from './elevation'
import { rackRowDisplayList } from './rackRow'
import { riserDisplayList, type RiserOpts } from './riser'
import { sectionDisplayList } from './section'
import { spaceOf } from './space'
import { titleBlockPrims } from './titleBlock'
import { fillTitleBlock, shownTitleBlock, type TbContext, type TbShown, type TitleBlockTemplate } from '../domain/titleBlock'

/** ISO A sizes, portrait (w × h, mm). */
export const PAPER: Record<Sheet['paper']['size'], [number, number]> = { A0: [841, 1189], A1: [594, 841], A2: [420, 594], A3: [297, 420], A4: [210, 297] }

/** The sheet's paper size in mm, as oriented. */
export function paperSize(s: Sheet): { w: number; h: number } {
	const [a, b] = PAPER[s.paper.size]
	return s.paper.orientation === 'landscape' ? { w: b, h: a } : { w: a, h: b }
}

export interface SheetOpts {
	underlay?: PlanOpts['underlay']; blocks?: PlanOpts['blocks']
	/** For the title block: the project's name and template (absent = the default template). */
	projectName?: string; template?: TitleBlockTemplate
	/** Cable routes for a riser viewport (else routed here). */
	routes?: RiserOpts['routes']
}

/** What the title block's auto fields show for a sheet (ADR: values are filled at render time, never stored). The
 *  sheet's own `titleBlock.fields` override any of them ("Drawn" is usually set there). */
export function titleBlockContext(ix: ProjectIndex, s: Sheet, projectName = ''): TbContext {
	const scales = [...new Set(s.viewports.map((v) => v.scale))]
	const places = [...new Set(s.viewports.map((v) => ix.nameOf(v.view.levelId)).filter(Boolean))]
	const last = s.revisions?.at(-1)
	return {
		project: projectName, title: s.title, number: s.number,
		size: `${s.paper.size} ${s.paper.orientation === 'landscape' ? 'L' : 'P'}`,
		scale: scales.length === 1 ? `1:${scales[0]}` : scales.length ? 'As shown' : '',
		place: places.join(' / '),
		...(last ? { rev: last.code, date: last.date } : {}),
		...s.titleBlock?.fields,
	}
}

/** The title block as this sheet shows it (template + values + revisions + the sheet's own hide). */
export function sheetTitleBlock(ix: ProjectIndex, s: Sheet, o: SheetOpts = {}): TbShown {
	const shown = shownTitleBlock(o.template, fillTitleBlock(o.template, titleBlockContext(ix, s, o.projectName)), s.revisions ?? [])
	return s.titleBlock?.hidden ? { ...shown, hidden: true } : shown
}

/** The paper inside the margin that the title block leaves for drawing (new viewports go here). */
export function drawingArea(ix: ProjectIndex, s: Sheet, o: SheetOpts = {}): { x: number; y: number; w: number; h: number } {
	const { w, h } = paperSize(s), m = s.paper.marginMm
	const area = titleBlockPrims(sheetTitleBlock(ix, s, o), w, h, m).area
	const layout = o.template?.layout ?? 'vertical'
	const x1 = area && layout === 'vertical' ? area.x0 : w - m, y1 = area && layout === 'horizontal' ? area.y0 : h - m
	return { x: m, y: m, w: x1 - m, h: y1 - m }
}

/** A viewport's view, in the view's own drawing mm, drawn for paper at 1:N (annotation sizes follow the scale). */
export function viewportContent(ix: ProjectIndex, vp: Viewport, o: SheetOpts = {}): Prim[] {
	const v = vp.view, spec = v.spec
	if (spec.kind === 'row') return rackRowDisplayList(ix, spec)
	if (spec.kind === 'riser') return riserDisplayList(ix, { scale: vp.scale, routes: o.routes, hideEmpty: spec.hideEmpty })
	if (spec.kind === 'section') { const sec = ix.get<SectionCut>(spec.sectionId); return sec?.type === 'section' ? sectionDisplayList(ix, sec, { scale: vp.scale }) : [] }
	if (spec.kind === 'plan') return planDisplayList(ix, v.levelId, { scale: vp.scale, underlay: o.underlay, blocks: o.blocks })
	return elevationDisplayList(ix, v.levelId, spaceOf(spec), { scale: vp.scale })
}

/** View mm → paper mm for one viewport. */
export function toPaper(vp: Viewport): (p: { x: number; y: number }) => { x: number; y: number } {
	const mx = vp.rect.x + vp.rect.w / 2, my = vp.rect.y + vp.rect.h / 2, k = 1 / vp.scale
	return (p) => ({ x: mx + (p.x - vp.centre.x) * k, y: my + (p.y - vp.centre.y) * k })
}

/** Paper mm → view mm for one viewport (the inverse of toPaper). */
export function fromPaper(vp: Viewport): (p: { x: number; y: number }) => { x: number; y: number } {
	const mx = vp.rect.x + vp.rect.w / 2, my = vp.rect.y + vp.rect.h / 2
	return (p) => ({ x: vp.centre.x + (p.x - mx) * vp.scale, y: vp.centre.y + (p.y - my) * vp.scale })
}
/** The topmost viewport under a paper point. */
export const viewportAt = (sheet: Sheet, p: { x: number; y: number }): Viewport | undefined =>
	sheet.viewports.findLast((v) => p.x >= v.rect.x && p.x <= v.rect.x + v.rect.w && p.y >= v.rect.y && p.y <= v.rect.y + v.rect.h)

/** One prim moved onto the paper: points through `t`, sizes by 1/N, clipped to the window (none = unclipped);
 *  viewport content is no longer pickable, a tied note keeps its `src`. */
function placePrim(p: Prim, t: ReturnType<typeof toPaper>, k: number, clip?: Bounds, src?: Id): Prim {
	switch (p.k) {
		case 'line': return { ...p, pts: p.pts.map(t), ...(p.w ? { w: p.w * k } : {}), src, clip }
		case 'circle': return { ...p, c: t(p.c), r: p.r * k, src, clip }
		case 'text': return { ...p, at: t(p.at), size: p.size * k, src, clip }
		case 'image': { const a = t({ x: p.x, y: p.y }); return { ...p, x: a.x, y: a.y, w: p.w * k, h: p.h * k, src, clip } }
	}
}

/** A note on a sheet as paper prims: tied to a viewport → drawn in its view mm at 1:N, then onto the paper. */
function notePrims(s: Shape, sheet: Sheet, blocks: SheetOpts['blocks']): Prim[] {
	const vp = s.vpId ? sheet.viewports.find((v) => v.id === s.vpId) : undefined
	if (!vp) return shapePrims(s, 1, blocks)
	const t = toPaper(vp), k = 1 / vp.scale
	return shapePrims(s, vp.scale, blocks).map((p) => placePrim(p, t, k, undefined, p.src))
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
		const label = vp.label ?? autoLabel(ix, vp)
		if (label) out.push({ k: 'text', at: { x: r.x, y: r.y + r.h + 5 }, text: `${label}  1:${vp.scale}`, size: 3.5, cls: 'viewport-label' })
	}
	// the title block over the viewports (a window that strays under it is covered, as in Pages)
	out.push(...titleBlockPrims(sheetTitleBlock(ix, sheet, o), w, h, m).prims)
	// paper notes (text, leaders, clouds — shapes owned by this sheet) over everything: a cloud may mark the title block
	for (const s of ix.shapes) if (s.sheetId === sheet.id) out.push(...notePrims(s, sheet, o.blocks))
	return out
}

/** The title a viewport gets when none is typed: a section reads "SECTION A–A′". */
function autoLabel(ix: ProjectIndex, vp: Viewport): string | undefined {
	if (vp.view.spec.kind !== 'section') return undefined
	const s = ix.get(vp.view.spec.sectionId)
	return s?.type === 'section' ? `SECTION ${s.name}–${s.name}′` : undefined
}

/** A sensible first viewport: most of the drawing area (left of / above the title block), at 1:100, centred on the
 *  level's content. */
export function defaultViewport(ix: ProjectIndex, sheet: Sheet, levelId: Id, id: Id, o: SheetOpts = {}): Viewport {
	const a = drawingArea(ix, sheet, o), inset = 5
	const vp: Viewport = { id, view: { levelId, spec: { kind: 'plan' } }, rect: { x: a.x + inset, y: a.y + inset, w: a.w - 2 * inset, h: a.h - 2 * inset }, scale: 100, centre: { x: 0, y: 0 } }
	return { ...vp, centre: contentCentre(ix, vp, o) }
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
