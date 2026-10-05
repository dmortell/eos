// PRINTED PANEL SHEETS (backlog "Printable panels with their labels", Dave 2026-10-06): a room's patch panels on A4
// landscape pages for the installer — each panel a grid of its ports, 24 across like the real panel, every cell with
// its port number and its label (stacked, as big as fits). Panels in fill order (racks in row order, top U down), as
// many to a page as fit. A display list in paper mm, printed by render/pdf.ts like a sheet. Pure; tested in
// panelSheets.test.ts.
import type { ProjectIndex } from '../domain/project'
import type { Device, Id } from '../domain/types'
import type { Prim } from './display'
import type { PdfPage } from '../render/pdf'
import { panelsInFillOrder } from '../domain/devices'
import { labelLines } from './rackRow'

const PAGE = { w: 297, h: 210 }, M = 10, TOP = 20
/** A port cell (mm): 24 across fill the page's width; tall enough for three stacked lines. */
const CELL_W = (PAGE.w - 2 * M) / 24, CELL_H = 13, TITLE_H = 6, GAP = 5

/** The panel's port grid: 24 a row (fewer ports: one row), numbered along rows or down columns as the panel is. */
function grid(d: Device): { rows: number; cols: number; at: (n: number) => [number, number] } {
	const rows = Math.max(1, Math.ceil(d.portCount / 24)), cols = Math.ceil(d.portCount / rows)
	return { rows, cols, at: (n) => (d.portNumbering === 'column' ? [(n - 1) % rows, Math.floor((n - 1) / rows)] : [Math.floor((n - 1) / cols), (n - 1) % cols]) }
}

/** The text size (mm) that fits these lines in a cell. */
function fitSize(lines: string[]): number {
	const chars = Math.max(...lines.map((l) => l.length), 1)
	return Math.min(2.6, (CELL_W - 1.2) / (chars * 0.58), (CELL_H - 4.2) / (lines.length * 1.2))
}

function panelPrims(ix: ProjectIndex, d: Device, y0: number): Prim[] {
	const out: Prim[] = [], g = grid(d)
	out.push({ k: 'text', at: { x: M, y: y0 + 4 }, text: `${ix.nameOf(d.rackId)} · ${d.name} · U${d.u} · ${d.portCount} ports`, size: 3.2, cls: 'device-label', src: d.id })
	for (let n = 1; n <= d.portCount; n++) {
		const [r, c] = g.at(n), x = M + c * CELL_W, y = y0 + TITLE_H + r * CELL_H
		const label = ix.portLabel({ on: d.id, port: n })
		out.push({ k: 'line', pts: [{ x, y }, { x: x + CELL_W, y }, { x: x + CELL_W, y: y + CELL_H }, { x, y: y + CELL_H }], closed: true, fill: true, cls: label ? 'port port-labelled' : 'port', src: d.id, sub: String(n) })
		out.push({ k: 'text', at: { x: x + 0.8, y: y + 2.2 }, text: String(n), size: 1.8, cls: 'u-label' })
		if (!label) continue
		const lines = labelLines(label).full, size = fitSize(lines), lh = size * 1.2, top = y + 2.6 + (CELL_H - 2.6 - lines.length * lh) / 2 + size
		lines.forEach((t, i) => out.push({ k: 'text', at: { x: x + CELL_W / 2, y: top + i * lh }, text: t, size, anchor: 'middle', cls: 'port-label' }))
	}
	return out
}

/** A room's panels as pages; `title` heads each page (project · room), `date` goes top right with the page number. */
export function panelPages(ix: ProjectIndex, spaceId: Id, o: { title: string; date: string }): { pages: PdfPage[]; panels: Device[] } {
	const panels = panelsInFillOrder(ix, spaceId).filter((d) => d.portCount > 0)
	const bodies: Prim[][] = []
	let y = TOP, page: Prim[] | null = null
	for (const d of panels) {
		const h = TITLE_H + grid(d).rows * CELL_H
		if (!page || (y + h > PAGE.h - M && y > TOP)) { page = []; bodies.push(page); y = TOP }
		page.push(...panelPrims(ix, d, y))
		y += h + GAP
	}
	const pages = bodies.map((body, i): PdfPage => ({ ...PAGE, prims: [
		{ k: 'text', at: { x: M, y: M + 2 }, text: o.title, size: 4, cls: 'tb-value' },
		{ k: 'text', at: { x: PAGE.w - M, y: M + 2 }, text: `${o.date} · ${i + 1} / ${bodies.length}`, size: 2.8, anchor: 'end', cls: 'tb-label' },
		{ k: 'line', pts: [{ x: M, y: M + 4.5 }, { x: PAGE.w - M, y: M + 4.5 }], cls: 'tb-rule' },
		...body,
	] }))
	return { pages, panels }
}
