// The COVER PAGE / TRANSMITTAL of an issue (sheets-organising slice 8; Dave D5: the size of the package's first sheet,
// with the project's title block): the project, the issue, its purpose and date, who gets it, a note, then the
// drawing register — No., title, revision, size, and New revision / As last issued / Withdrawn. A long register flows
// onto more pages of the same size. Drawn as display lists like any sheet (a stand-in sheet with no viewports gives
// the paper, border and title block), so it goes through the same PDF path and is frozen with the issue. Pure; tested
// in transmittalPage.test.ts.
import type { Sheet } from '../domain/drawing'
import type { ProjectIndex } from '../domain/project'
import type { Prim } from './display'
import { sheetDisplayList, sheetTitleBlock, paperSize, type SheetOpts } from './sheet'
import { titleBlockPrims } from './titleBlock'

export interface CoverRow { number: string; title: string; rev: string; size: string; status: 'New revision' | 'As last issued' | 'Withdrawn' }
export interface CoverData {
	project: string; tag: string; name: string; purpose: string; date: string
	recipients?: { name: string; org?: string }[]; note?: string; rows: CoverRow[]
	/** The floorplan files the sheets are drawn over (W4): "Floorplans: …" under the note. */
	floorplans?: string[]
}

const ROW = 6.5, TXT = 3, HEAD = 3.2
/** The cover's pages, each `{ w, h, prims }` like a sheet's. `first` = the package's first sheet (its paper). */
export function coverPages(ix: ProjectIndex, first: Sheet, d: CoverData, o: SheetOpts = {}): { w: number; h: number; prims: Prim[] }[] {
	const stand: Sheet = { ...first, id: 'cover', number: '', title: `TRANSMITTAL — ${d.tag}`, viewports: [], revisions: undefined, titleBlock: { ...first.titleBlock, hidden: undefined } }
	const { w, h } = paperSize(stand), m = stand.paper.marginMm
	const base = sheetDisplayList(ix, stand, o).filter((p) => p.k === 'image' || p.cls !== 'paper-margin')
	// the space the title block leaves: above it (a block along the bottom) or beside it (a strip on the right)
	const a = titleBlockPrims(sheetTitleBlock(ix, stand, o), w, h, m).area
	const free = !a ? { x0: m, y0: m, x1: w - m, y1: h - m }
		: a.x0 <= m + 0.01 && a.x1 >= w - m - 0.01 ? { x0: m, y0: m, x1: w - m, y1: a.y0 } : { x0: m, y0: m, x1: a.x0, y1: h - m }
	const x0 = free.x0 + 8, x1 = free.x1 - 8, top = free.y0 + 10, bottom = free.y1 - 8
	const text = (x: number, y: number, t: string, size = TXT, cls = 'tb-value'): Prim => ({ k: 'text', at: { x, y }, text: t, size, cls })
	const line = (y: number): Prim => ({ k: 'line', pts: [{ x: x0, y }, { x: x1, y }], cls: 'tb-rule' })
	// columns: No. · Title · Rev · Size · This issue
	const cw = x1 - x0, cols = [x0, x0 + cw * 0.14, x0 + cw * 0.66, x0 + cw * 0.74, x0 + cw * 0.82]
	const header = (page: number, pages: number): { prims: Prim[]; y: number } => {
		const out: Prim[] = []
		let y = top
		out.push(text(x0, y, d.project, 7, 'tb-title')); y += 10
		out.push(text(x0, y, `TRANSMITTAL — ${d.tag} · ${d.name}${pages > 1 ? `  (page ${page} of ${pages})` : ''}`, 4.5, 'tb-title')); y += 8
		if (page === 1) {
			out.push(text(x0, y, `Purpose: ${d.purpose}      Date: ${d.date}`, 3.5)); y += 6
			if (d.recipients?.length) { out.push(text(x0, y, 'To:', 3.5)); for (const r of d.recipients) { out.push(text(x0 + 12, y, r.org ? `${r.name}, ${r.org}` : r.name, 3.5)); y += 5.5 } }
			if (d.note) { out.push(text(x0, y, d.note, 3.5)); y += 6 }
			if (d.floorplans?.length) { out.push(text(x0, y, `Floorplans: ${d.floorplans.join(', ')}`, 3)); y += 5.5 }
			y += 4
		}
		;['No.', 'Title', 'Rev', 'Size', 'This issue'].forEach((t, i) => out.push(text(cols[i] + 1, y, t, HEAD, 'tb-label')))
		y += 2; out.push(line(y))
		return { prims: out, y }
	}
	// rows per page: page 1 has the details above the table, later pages only the titles
	const firstY = header(1, 1).y, laterY = header(2, 2).y
	const per1 = Math.max(1, Math.floor((bottom - firstY) / ROW)), perN = Math.max(1, Math.floor((bottom - laterY) / ROW))
	const pages = d.rows.length <= per1 ? 1 : 1 + Math.ceil((d.rows.length - per1) / perN)
	const out: { w: number; h: number; prims: Prim[] }[] = []
	let i = 0
	for (let p = 1; p <= pages; p++) {
		const hd = header(p, pages), prims = [...base, ...hd.prims]
		let y = hd.y
		for (const end = Math.min(d.rows.length, i + (p === 1 ? per1 : perN)); i < end; i++) {
			const r = d.rows[i]
			y += ROW
			;[r.number, r.title, r.rev, r.size, r.status].forEach((t, k) => prims.push(text(cols[k] + 1, y - 1.8, t, TXT, k === 4 && r.status === 'Withdrawn' ? 'tb-value cover-withdrawn' : 'tb-value')))
			prims.push(line(y))
		}
		out.push({ w, h, prims })
	}
	return out
}

