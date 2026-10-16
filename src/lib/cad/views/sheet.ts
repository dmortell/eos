// The SHEET generator (Phase 4.1): a drawing sheet's paper, in paper mm from its top-left, y down. Each viewport
// draws its view (plan / elevation / rack row — the same generators as the panes) at 1:N into its window: view mm →
// paper mm = (p − centre) / N + the window's middle, clipped to the window. Viewport content isn't pickable on the
// sheet (only the viewport is); editing happens in the views themselves.
import type { Id } from '../domain/types'
import type { Sheet, Viewport, SectionCut } from '../domain/drawing'
import type { Shape } from '../domain/shapes'
import { byDrawOrder } from '../domain/shapes'
import { nextLabel } from '../domain/labels'
import type { ProjectIndex } from '../domain/project'
import { primBounds, unionBounds, PLOT_SCALE, type Prim, type Bounds } from './display'
import { planDisplayList, shapePrims, type PlanOpts } from './plan'
import { elevationDisplayList } from './elevation'
import { rackRowDisplayList } from './rackRow'
import { riserDisplayList, type RiserOpts } from './riser'
import { paperDisplayList, PAPER_PAD, type PaperOpts } from './paper'
import { sectionDisplayList } from './section'
import { spaceOf, isPaperSpec } from './space'
import { applyLayers } from './layers'
import { layersOf, layerOf } from '../domain/layers'
import { legendShapePrims } from './legend'
import { titleBlockPrims } from './titleBlock'
import { scheduleTitle, patchScheduleLayout } from './schedule'
import { fieldCtx, withFields } from '../domain/fields'
import { cloudShown } from '../domain/issue'
import { fillTitleBlock, shownTitleBlock, withDetails, drawnFallback, type TbContext, type TbShown, type TitleBlockTemplate, type ProjectDetails } from '../domain/titleBlock'

/** ISO A sizes, portrait (w × h, mm). */
/** The viewport scales offered (1:N): Sheet Properties' list, and Alt+wheel's steps. */
export const SCALES = [1, 2, 5, 10, 15, 20, 25, 50, 100, 150, 200, 250, 500, 1000]
/** The next scale from `n` — `dir` −1 = closer in (a smaller N), +1 = further out. */
export function nextScale(n: number, dir: 1 | -1): number {
	return dir < 0 ? [...SCALES].reverse().find((s) => s < n) ?? SCALES[0] : SCALES.find((s) => s > n) ?? SCALES.at(-1)!
}

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
	/** What {DATE} fields read (YYYY-MM-DD); absent = today. An issued sheet reads its last issue date, so midnight does not change its print. */
	fieldDate?: string
	/** The sheet's viewports, for one that carries on from another (a patch schedule continued: `spec.after`). */
	vps?: Viewport[]
	/** The Project details the title block falls back on (client, site address, author, company). */
	details?: ProjectDetails
	/** Floorplans in black and white, outlets by usage color, cords along the channels — the project's old settings
	 *  here; each sheet's own (sheetLook) win. */
	gray?: boolean
	byUsage?: boolean
	cords?: 'channels' | 'straight'
	/** Cable routes for a riser viewport (else routed here). */
	routes?: RiserOpts['routes']
	/** The project's fills, for a fill-section viewport (else worked out from the routes). */
	fills?: PaperOpts['fills']
}

/** What the title block's auto fields show for a sheet (ADR: values are filled at render time, never stored). The
 *  sheet's own `titleBlock.fields` override any of them ("Drawn" is usually set there) — except the date once the sheet
 *  has a dated revision: a date field (only ever imported from a Sheets-tool sheet) would print over every later issue.
 *  The client comes from the Project details; a blank Drawn shows their author, else who issued the latest revision. */
export function titleBlockContext(ix: ProjectIndex, s: Sheet, projectName = '', details?: ProjectDetails): TbContext {
	const scales = [...new Set(s.viewports.filter((v) => !isPaperSpec(v.view.spec)).map((v) => v.scale))]   // a table on paper has no scale
	const places = [...new Set(s.viewports.map((v) => ix.nameOf(v.view.levelId)).filter(Boolean))]
	const last = s.revisions?.at(-1)
	const drawn = s.titleBlock?.fields?.drawn?.trim() || drawnFallback(details?.author, last?.by)
	return {
		project: projectName, title: s.title, number: s.number, client: details?.client?.trim() ?? '', building: details?.buildingName?.trim() ?? '',
		size: `${s.paper.size} ${s.paper.orientation === 'landscape' ? 'L' : 'P'}`,
		scale: scales.length === 1 ? `1:${scales[0]}` : scales.length ? 'As shown' : '',
		// the sheet's own place, else the levels of its viewports; a riser (every floor) has no level of its own (Q50)
		place: (s.placeId ? ix.nameOf(s.placeId) : '') || places.join(' / ') || (s.viewports.some((v) => v.view.spec.kind === 'riser') ? 'All floors' : ''),
		...(last ? { rev: last.code, date: last.date } : {}),
		...s.titleBlock?.fields,
		...(last?.date ? { date: last.date } : {}),
		drawn,
	}
}

/** The title block as this sheet shows it (template + values + revisions + the sheet's own hide). */
export function sheetTitleBlock(ix: ProjectIndex, s: Sheet, o: SheetOpts = {}): TbShown {
	const t = withDetails(o.template, o.details)
	const shown = shownTitleBlock(t, fillTitleBlock(t, { site: t?.site, ...titleBlockContext(ix, s, o.projectName, o.details) }), s.revisions ?? [])
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

/** A viewport's view, in the view's own drawing mm, drawn for paper at 1:N (annotation sizes follow the scale), with
 *  the layers hidden in it left out and layer colors applied. Only the viewport's own list counts (User 2026-10-13: a
 *  viewport's layers are its own, apart from the model's eye) — on screen as in print. */
export function viewportContent(ix: ProjectIndex, vp: Viewport, o: SheetOpts = {}): Prim[] {
	return applyLayers(viewContent(ix, vp, o), ix, { hidden: new Set(vp.frozen ?? []), sort: vp.view.spec.kind === 'plan' }).draw
}

/** The layers a viewport draws anything on — its view with nothing hidden, and the notes tied to it (Layers: the
 *  others are folded away while it's picked, User 2026-10-14). */
export function viewportLayers(ix: ProjectIndex, sheet: Sheet, vp: Viewport, o: SheetOpts = {}): Set<Id> {
	const out = new Set<Id>()
	for (const p of viewportContent(ix, { ...vp, frozen: undefined }, { ...sheetLook(sheet, o), vps: sheet.viewports })) if (p.layer) out.add(p.layer)
	const known = new Set(layersOf(ix.layers).map((l) => l.id))
	for (const s of ix.shapes) if (s.sheetId === sheet.id && s.vpId === vp.id) { const l = layerOf(s, known); if (l) out.add(l) }
	return out
}

const paperFitOf = (vp: Viewport) => vp.rect.h * vp.scale - 2 * PAPER_PAD

/** Where a patch schedule viewport starts: its own From cord, or — when it continues another viewport — the cord that
 *  one stops before (so growing or shrinking the first never drops or repeats a cord). A broken or looping chain falls back to the own start. */
function scheduleStart(ix: ProjectIndex, vp: Viewport, vps: Viewport[] | undefined, seen = new Set<string>()): number | undefined {
	const spec = vp.view.spec
	if (spec.kind !== 'schedule') return undefined
	const prev = spec.after && !seen.has(vp.id) ? vps?.find((v) => v.id === spec.after) : undefined
	if (!prev || prev.view.spec.kind !== 'schedule' || prev.view.spec.spaceId !== spec.spaceId) return spec.start
	seen.add(vp.id)
	return patchScheduleLayout(ix, spec.spaceId, scheduleStart(ix, prev, vps, seen), { fit: paperFitOf(prev) }).next ?? Infinity
}

function viewContent(ix: ProjectIndex, vp: Viewport, o: SheetOpts): Prim[] {
	const v = vp.view, spec = v.spec
	if (spec.kind === 'row') return rackRowDisplayList(ix, spec, { cords: o.cords })
	if (spec.kind === 'riser') return riserDisplayList(ix, { scale: vp.scale, routes: o.routes, fills: o.fills, hideEmpty: spec.hideEmpty })
	if (isPaperSpec(spec)) return paperDisplayList(ix, spec, { fills: o.fills, routes: o.routes, fit: paperFitOf(vp), start: spec.kind === 'schedule' ? scheduleStart(ix, vp, o.vps) : undefined })
	if (spec.kind === 'section') { const sec = ix.get<SectionCut>(spec.sectionId); return sec?.type === 'section' ? sectionDisplayList(ix, sec, { scale: vp.scale, blocks: o.blocks }) : [] }
	if (spec.kind === 'plan') return planDisplayList(ix, v.levelId, { scale: vp.scale, underlay: o.underlay, blocks: o.blocks, gray: o.gray, byUsage: o.byUsage })
	return elevationDisplayList(ix, v.levelId, spaceOf(spec), { scale: vp.scale, blocks: o.blocks })
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
function placePrim(p: Prim, t: ReturnType<typeof toPaper>, k: number, window?: Bounds, src?: Id): Prim {
	// a prim's own clip (a floorplan's crop) goes onto the paper too, inside the viewport's window
	let clip = window
	if (p.clip) {
		const a = t({ x: p.clip.x0, y: p.clip.y0 }), b = t({ x: p.clip.x1, y: p.clip.y1 })
		const own = { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) }
		clip = window ? { x0: Math.max(own.x0, window.x0), y0: Math.max(own.y0, window.y0), x1: Math.min(own.x1, window.x1), y1: Math.min(own.y1, window.y1) } : own
	}
	switch (p.k) {
		case 'line': return { ...p, pts: p.pts.map(t), ...(p.holes ? { holes: p.holes.map((h) => h.map(t)) } : {}), ...(p.w ? { w: p.w * k } : {}), src, clip }
		case 'circle': return { ...p, c: t(p.c), r: p.r * k, src, clip }
		case 'text': return { ...p, at: t(p.at), size: p.size * k, src, clip }
		case 'image': { const a = t({ x: p.x, y: p.y }); return { ...p, x: a.x, y: a.y, w: p.w * k, h: p.h * k, src, clip } }
	}
}

/** A viewport's view prims (view mm) put on the paper, clipped to its window; `src` is KEPT (editing inside a
 *  viewport, UX review S5: the selection, hover and tool previews draw over the paper). */
export function onPaper(prims: Prim[], vp: Viewport): Prim[] {
	const t = toPaper(vp), k = 1 / vp.scale, r = vp.rect, clip = { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h }
	return prims.map((p) => placePrim(p, t, k, clip, p.src))
}

/** A note on a sheet as paper prims: tied to a viewport → drawn in its view mm at 1:N, then onto the paper. */
function notePrims(ix: ProjectIndex, s: Shape, sheet: Sheet, o: SheetOpts): Prim[] {
	const blocks = o.blocks, vp = s.vpId ? sheet.viewports.find((v) => v.id === s.vpId) : undefined
	// the layer rules, as a plan item gets them (Q41): hidden (a paper note: the sheet's own layers; a tied note: its viewport's) and By-layer color
	const layered = (prims: Prim[], hidden: Iterable<string>) => applyLayers(prims, ix, { hidden: new Set(hidden) }).draw
	if (!vp) return layered(shapePrims(s, 1, blocks), sheet.frozen ?? [])
	// clipped to its window like the view it marks up (User: zoomed in, a tied cloud flew off the page)
	const t = toPaper(vp), k = 1 / vp.scale, r = vp.rect, clip = { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h }
	return layered(shapePrims(s, vp.scale, blocks), vp.frozen ?? []).map((p) => placePrim(p, t, k, clip, p.src))
}

/** The options as this sheet draws: its own B/W, usage colors and cord route over the project's old settings. */
export function sheetLook(sheet: Sheet, o: SheetOpts): SheetOpts {
	return { ...o, gray: sheet.gray ?? o.gray, byUsage: sheet.outletColour ? sheet.outletColour === 'usage' : o.byUsage, cords: sheet.cordRoute ?? o.cords }
}

export function sheetDisplayList(ix: ProjectIndex, sheet: Sheet, o0: SheetOpts = {}): Prim[] {
	const o = sheetLook(sheet, o0)
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
		// text fields ({LEVEL}, {COUNT:…}, domain/fields.ts) read the viewport's level (a riser: the whole project)
		const ctx = fieldCtx(ix, { project: o.projectName, building: o.details?.buildingName?.trim(), today: o.fieldDate, sheet, blocks: o.blocks, ...(vp.view.spec.kind === 'riser' ? {} : { levels: [vp.view.levelId] }) })
		for (const p of withFields(viewportContent(ix, vp, { ...o, vps: sheet.viewports }), ctx)) out.push(placePrim(p, t, k, clip))
		// the window's FRAME: what you pick and drag on the sheet — its border only, not its middle (User: viewports got
		// dragged around the page by mistake; as Pages and Sheets); a double-click inside enters it
		out.push({ k: 'line', pts: rect(r.x, r.y, r.x + r.w, r.y + r.h), closed: true, cls: vp.border === false ? 'viewport viewport-hidden' : 'viewport', src: sheet.id, sub: vp.id })
		// its number, in a small circle above the window's top-left corner
		if (vp.number?.trim()) {
			const c = { x: r.x + 4, y: r.y - 4 }
			out.push({ k: 'circle', c, r: 3.2, cls: 'viewport-no' }, { k: 'text', at: { x: c.x, y: c.y + 1.1 }, text: vp.number.trim(), size: 3.2, anchor: 'middle', cls: 'viewport-label' })
		}
		const label = vp.label ?? autoLabel(ix, vp)
		if (label) out.push({ k: 'text', at: { x: r.x, y: r.y + r.h + 5 }, text: isPaperSpec(vp.view.spec) ? label : `${label}  1:${vp.scale}`, size: 3.5, cls: 'viewport-label' })
	}
	// the title block over the viewports (a window that strays under it is covered, as in Pages)
	out.push(...titleBlockPrims(sheetTitleBlock(ix, sheet, o), w, h, m).prims)
	// paper notes (text, leaders, clouds — shapes owned by this sheet) over everything: a cloud may mark the title block
	const shown = new Set(sheet.viewports.map((v) => v.view.levelId))   // a legend on the paper lists what its viewports show
	const notes: Prim[] = []
	// (a revision cloud of an EARLIER issued revision is kept but not drawn, W20 — its own issue's frozen copy has it)
	for (const s of ix.shapes.filter((x) => x.sheetId === sheet.id && (x.geom.kind !== 'cloud' || cloudShown(sheet, x.geom.rev))).sort(byDrawOrder))
		notes.push(...(s.geom.kind === 'legend' ? applyLayers(legendShapePrims(ix, s, shown, 1, o.blocks), ix, { hidden: new Set(sheet.frozen ?? []) }).draw : notePrims(ix, s, sheet, o)))
	// their text fields read the sheet and its viewports' levels
	out.push(...withFields(notes, fieldCtx(ix, { project: o.projectName, building: o.details?.buildingName?.trim(), today: o.fieldDate, sheet, blocks: o.blocks, levels: shown })))
	return out
}

/** The title a viewport gets when none is typed: a section reads "SECTION A-A"; a port grid its rack (and panel),
 *  a schedule its room. */
function autoLabel(ix: ProjectIndex, vp: Viewport): string | undefined {
	const spec = vp.view.spec
	if (spec.kind === 'ports') return `${ix.nameOf(spec.rackId) || '(rack gone)'}${spec.deviceId ? ` · ${ix.nameOf(spec.deviceId) || '(gone)'}` : ''} port grid`
	if (spec.kind === 'schedule') return `${scheduleTitle(ix, spec.spaceId)}${spec.after ? ' (continued)' : spec.start && spec.start > 1 ? ` (from #${spec.start})` : ''}`
	if (spec.kind !== 'section') return undefined
	const s = ix.get(spec.sectionId)
	return s?.type === 'section' ? `SECTION ${s.name}-${s.name}` : undefined   // plain hyphen (User): PDF fonts have no ′
}

/** A sensible first viewport: most of the drawing area (left of / above the title block), at 1:100, centred on the
 *  level's content. */
export function defaultViewport(ix: ProjectIndex, sheet: Sheet, levelId: Id, id: Id, o: SheetOpts = {}): Viewport {
	const a = drawingArea(ix, sheet, o), inset = 5
	const vp: Viewport = { id, view: { levelId, spec: { kind: 'plan' } }, rect: { x: a.x + inset, y: a.y + inset, w: a.w - 2 * inset, h: a.h - 2 * inset }, scale: 100, centre: { x: 0, y: 0 } }
	return { ...vp, centre: contentCentre(ix, vp, o) }
}

/** Where a level's floorplans show, in plan mm: their crops (else their pages), moved by each one's offset. */
export function floorplanBounds(ix: ProjectIndex, levelId: Id, underlay: SheetOpts['underlay']): Bounds | null {
	let b: Bounds | null = null
	for (const u of ix.byId.values()) {
		if (u.type !== 'underlay' || u.levelId !== levelId) continue
		const pl = underlay?.(u)
		if (!pl) continue
		const dx = u.origin?.x ?? 0, dy = u.origin?.y ?? 0, c = pl.clip ?? { x0: pl.x, y0: pl.y, x1: pl.x + pl.w, y1: pl.y + pl.h }
		const q = { x0: c.x0 + dx, y0: c.y0 + dy, x1: c.x1 + dx, y1: c.y1 + dy }
		b = b ? { x0: Math.min(b.x0, q.x0), y0: Math.min(b.y0, q.y0), x1: Math.max(b.x1, q.x1), y1: Math.max(b.y1, q.y1) } : q
	}
	return b
}

/** A viewport of the view you're looking at (backlog "A sheet from the current view"): centred on what the pane
 *  shows (`visible`, view mm), at the largest standard scale at which that fits the sheet's drawing area, sized to it
 *  (but never past the area), at the area's first free spot (`freeSpot`). A PLAN zoomed out further than that at 1:100 (the whole
 *  floor on screen) is the floor's sheet (W18): at the plan's own 1:100, filling the drawing area, centred on the
 *  floorplan's crop (not the whole PDF page with the architect's title block). */
export function viewViewport(ix: ProjectIndex, sheet: Sheet, view: Viewport['view'], visible: Bounds, id: Id, o: SheetOpts = {}): Viewport {
	const a = drawingArea(ix, sheet, o), inset = 5
	const w = Math.max(1, visible.x1 - visible.x0), h = Math.max(1, visible.y1 - visible.y0)
	const roomW = a.w - 2 * inset, roomH = a.h - 2 * inset
	if (isPaperSpec(view.spec)) return paperViewport(ix, sheet, view, id, o)   // paper is drawn at 1:1, from its top-left
	const scale = SCALES.find((n) => w / n <= roomW && h / n <= roomH) ?? SCALES.at(-1)!
	// a plan with floorplans: the whole floor (their crop), however far in the pane was zoomed (R7-16, User 2026-10-16:
	// zoomed in on the rack room, the sheet showed 262 × 97 mm of it), at 1:100, filling the drawing area
	const f = view.spec.kind === 'plan' ? floorplanBounds(ix, view.levelId, o.underlay) : null
	if (f || (view.spec.kind === 'plan' && scale > PLOT_SCALE)) {
		const c = f ?? visible
		const at = PLOT_SCALE   // the drawings' 1:100 (W18); the viewport can be resized or rescaled after
		return { id, view, scale: at, centre: { x: Math.round((c.x0 + c.x1) / 2), y: Math.round((c.y0 + c.y1) / 2) }, rect: { x: a.x + inset, y: a.y + inset, w: roomW, h: roomH } }
	}
	const size = { w: Math.min(roomW, Math.ceil(w / scale)), h: Math.min(roomH, Math.ceil(h / scale)) }
	return {
		id, view, scale, centre: { x: Math.round((visible.x0 + visible.x1) / 2), y: Math.round((visible.y0 + visible.y1) / 2) },
		rect: { ...freeSpot(sheet, { x: a.x + inset, y: a.y + inset, w: roomW, h: roomH }, size.w, size.h), ...size },
	}
}

/** A new, empty sheet after the last one: the next number, "New sheet", A3 landscape (User: no name prompt). */
export function blankSheet(sheets: Sheet[], id: Id): Sheet {
	const last = [...sheets].sort((a, b) => a.order - b.order).at(-1)
	return { type: 'sheet', id, number: last ? nextLabel(last.number) : 'S001', title: 'New sheet', order: (last?.order ?? 0) + 1,
		paper: { size: 'A3', orientation: 'landscape', marginMm: 5 }, viewports: [], status: 'active' }
}

/** A section put on a sheet (backlog "Drop a section as a viewport"): at the largest standard scale (1:20 or
 *  further out) at which the cut fits the sheet's drawing area, sized to it (+ 10 mm round it), in the area's top-left
 *  corner, centred on the cut. */
export function sectionViewport(ix: ProjectIndex, sheet: Sheet, sectionId: Id, levelId: Id, id: Id, o: SheetOpts = {}): Viewport {
	const a = drawingArea(ix, sheet, o), pad = 10, inset = 5
	const probe: Viewport = { id, view: { levelId, spec: { kind: 'section', sectionId } }, rect: { x: 0, y: 0, w: 1, h: 1 }, scale: 1, centre: { x: 0, y: 0 } }
	let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
	for (const p of viewportContent(ix, probe, o)) {
		const pts = p.k === 'line' ? p.pts : p.k === 'circle' ? [p.c] : p.k === 'text' ? [p.at] : []
		for (const q of pts) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y) }
	}
	const w = x1 > x0 ? x1 - x0 : 1000, h = y1 > y0 ? y1 - y0 : 1000
	const fits = (n: number) => w / n + 2 * pad <= a.w - 2 * inset && h / n + 2 * pad <= a.h - 2 * inset
	const scale = SCALES.find((n) => n >= 20 && fits(n)) ?? SCALES.at(-1)!
	const rect = { x: a.x + inset, y: a.y + inset, w: Math.min(a.w - 2 * inset, Math.ceil(w / scale + 2 * pad)), h: Math.min(a.h - 2 * inset, Math.ceil(h / scale + 2 * pad)) }
	return { ...probe, rect, scale, centre: x1 > x0 ? { x: (x0 + x1) / 2, y: (y0 + y1) / 2 } : { x: 0, y: 0 } }
}

/** The middle of what a viewport's view shows (for "Fit" and new viewports). */
export function contentCentre(ix: ProjectIndex, vp: Viewport, o: SheetOpts = {}): { x: number; y: number } {
	const b = contentBounds(ix, vp, o)
	return b ? { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 } : { x: 0, y: 0 }
}

/** "Fit" (backlog "Viewport handling" part 6): centred on what its view shows, at the largest standard scale at which
 *  that fits its window (the window stays). An empty view keeps its centre and scale. */
export function fitViewport(ix: ProjectIndex, vp: Viewport, o: SheetOpts = {}): Pick<Viewport, 'centre' | 'scale'> {
	if (isPaperSpec(vp.view.spec)) return paperFit(vp)
	if (!contentBounds(ix, vp, o)) return { centre: vp.centre, scale: vp.scale }
	const b = boxViewport(ix, vp.view, vp.rect, vp.id, o)
	return { centre: b.centre, scale: b.scale }
}

/** What a viewport's view draws (floorplan images left out), in view mm; undefined = nothing. */
function contentBounds(ix: ProjectIndex, vp: Viewport, o: SheetOpts = {}): Bounds | undefined {
	const ps = viewportContent(ix, vp, o).filter((p) => p.k !== 'image')
	if (!ps.length) return undefined
	let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
	for (const p of ps) {
		const pts = p.k === 'line' ? p.pts : p.k === 'circle' ? [p.c] : p.k === 'text' ? [p.at] : []
		for (const q of pts) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y) }
	}
	return Number.isFinite(x0) ? { x0, y0, x1, y1 } : undefined
}

/** A viewport drawn as a box on the paper (backlog "Viewport tool"): it shows `view`, centred on its content, at the
 *  largest standard scale at which that fits the box (1:100 when the view is empty). */
export function boxViewport(ix: ProjectIndex, view: Viewport['view'], rect: Viewport['rect'], id: Id, o: SheetOpts = {}): Viewport {
	const vp: Viewport = { id, view, rect, scale: 100, centre: { x: 0, y: 0 } }
	if (isPaperSpec(view.spec)) return { ...vp, ...paperFit(vp) }
	const b = contentBounds(ix, vp, o)
	if (!b) return vp
	const w = Math.max(1, b.x1 - b.x0), h = Math.max(1, b.y1 - b.y0)
	const scale = SCALES.find((n) => w / n <= rect.w && h / n <= rect.h) ?? SCALES.at(-1)!
	return { ...vp, scale, centre: { x: Math.round((b.x0 + b.x1) / 2), y: Math.round((b.y0 + b.y1) / 2) } }
}

/** A paper view (a schedule, a port grid, a fill section: each drawn from (0, 0)) in its window: at 1:1, its
 *  top-left PAPER_PAD in from the window's. */
export function paperFit(vp: Pick<Viewport, 'rect'>): Pick<Viewport, 'centre' | 'scale'> {
	return { scale: 1, centre: { x: vp.rect.w / 2 - PAPER_PAD, y: vp.rect.h / 2 - PAPER_PAD } }
}

/** A paper view put on a sheet (Properties › Fill › Put on sheet…, a schedule or port grid from its pane): at 1:1,
 *  sized to what it draws (never past the drawing area: a long schedule shows what fits and says how many more), at
 *  the first free spot of the area (`freeSpot`). */
export function paperViewport(ix: ProjectIndex, sheet: Sheet, view: Viewport['view'], id: Id, o: SheetOpts = {}): Viewport {
	const a = drawingArea(ix, sheet, o), inset = 5
	const room = { x: a.x + inset, y: a.y + inset, w: a.w - 2 * inset, h: a.h - 2 * inset }
	// what it draws, text included (its extent, not just its anchor)
	const b = unionBounds(viewportContent(ix, { id, view, rect: room, scale: 1, centre: { x: 0, y: 0 } }, o).filter((p) => p.k !== 'image').map(primBounds))
	const size = b ? { w: Math.min(room.w, Math.ceil(b.x1 + 2 * PAPER_PAD)), h: Math.min(room.h, Math.ceil(b.y1 + 2 * PAPER_PAD)) } : { w: 100, h: 60 }
	const rect = { ...freeSpot(sheet, room, size.w, size.h), ...size }
	return { id, view, rect, ...paperFit({ rect }) }
}

/** Where a new w × h window goes in `room` (the drawing area less its inset): the first spot, row by row from the
 *  top-left in 5 mm steps, that keeps 5 mm clear of every viewport on the sheet (W22: a second "Put on sheet" landed on
 *  top of the first). No room left: the top-left, as before. */
export function freeSpot(sheet: Pick<Sheet, 'viewports'>, room: { x: number; y: number; w: number; h: number }, w: number, h: number): { x: number; y: number } {
	const gap = 5, step = 5, vps = sheet.viewports.map((v) => v.rect)
	const clear = (x: number, y: number) => vps.every((r) => x + w + gap <= r.x || r.x + r.w + gap <= x || y + h + gap <= r.y || r.y + r.h + gap <= y)
	for (let y = room.y; y + h <= room.y + room.h; y += step)
		for (let x = room.x; x + w <= room.x + room.w; x += step) if (clear(x, y)) return { x, y }
	return { x: room.x, y: room.y }
}

/** A model view printed on its own (User 2026-10-15: Ctrl+P on a plan / section / rack view → "the whole view", or the
 *  print ▾'s "on screen"): an unsaved A3 sheet without a title block, its one viewport borderless and named under it
 *  with its scale — landscape unless what's printed is taller than wide. `visible` = what's on screen (absent: the
 *  view's whole extent, at the largest standard scale that fits). The PDF path draws it like any sheet. */
export function printSheet(ix: ProjectIndex, view: Viewport['view'], title: string, visible?: Bounds, o: SheetOpts = {}): Sheet {
	const probe: Viewport = { id: 'print-vp', view, rect: { x: 0, y: 0, w: 1, h: 1 }, scale: 100, centre: { x: 0, y: 0 } }
	const b = visible ?? contentBounds(ix, probe, o)
	const land = !b || b.x1 - b.x0 >= b.y1 - b.y0, m = 10
	const sheet: Sheet = { type: 'sheet', id: 'print', number: '', title, order: 0, paper: { size: 'A3', orientation: land ? 'landscape' : 'portrait', marginMm: m },
		viewports: [], status: 'active', titleBlock: { hidden: true } }
	const { w, h } = paperSize(sheet), rect = { x: m, y: m, w: w - 2 * m, h: h - 2 * m - 8 }   // room under it for its name
	let vp: Viewport
	if (visible) {
		const bw = Math.max(1, visible.x1 - visible.x0), bh = Math.max(1, visible.y1 - visible.y0)
		const scale = SCALES.find((n) => bw / n <= rect.w && bh / n <= rect.h) ?? SCALES.at(-1)!
		vp = { id: 'print-vp', view, rect, scale, centre: { x: Math.round((visible.x0 + visible.x1) / 2), y: Math.round((visible.y0 + visible.y1) / 2) } }
	} else vp = boxViewport(ix, view, rect, 'print-vp', o)
	return { ...sheet, viewports: [{ ...vp, border: false, label: title }] }
}
