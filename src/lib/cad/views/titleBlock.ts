// The TITLE BLOCK drawn on a sheet (Phase 4.2): Pages' three layouts as display-list prims in paper mm, so the
// screen and the PDF draw the same thing — a STRIP down the right (default), a BAND along the bottom, or a COMPACT box
// in the bottom-right corner. The full-width items in their order (logo images, logo text, the drawing office's block,
// wide fields — all placed like fields, User 2026-10-05), the revision table, then the half-width fields as a grid.
// Returns the prims and the area it takes.
import type { TbShown, TbCell } from '../domain/titleBlock'
import type { Prim, Bounds } from './display'

const CELL_H = 8, LABEL = 1.8, VALUE = 2.6, PAD = 1.5
const REV_HEAD = 3.5, REV_ROW = 3.8
const COMPANY_NAME = 3, COMPANY_LINE = 2

/** Text cut to fit a width, with an ellipsis: ≈ 0.6 em per Latin character, 1 em per full-width one (Japanese). */
const em = (ch: string) => (ch.charCodeAt(0) >= 0x2e80 ? 1 : 0.6)
const fit = (t: string, width: number, size: number) => {
	const chars = [...t]
	let w = 0, n = 0
	for (const ch of chars) { if ((w += em(ch) * size) > width) break; n++ }
	return n >= chars.length ? t : chars.slice(0, Math.max(1, n - 1)).join('') + '…'
}
const box = (x0: number, y0: number, x1: number, y1: number, cls: string): Prim => ({ k: 'line', pts: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], closed: true, cls })
const rule = (x0: number, y0: number, x1: number, y1: number): Prim => ({ k: 'line', pts: [{ x: x0, y: y0 }, { x: x1, y: y1 }], cls: 'tb-rule' })

/** One cell: a small grey label over its value — or a logo field's image (no label), fitted in the cell, centred. */
function cell(out: Prim[], x: number, y: number, w: number, c: TbCell, h = CELL_H): void {
	if (c.image) {
		const ih = Math.min(c.image.h ?? 10, h - 2 * PAD)
		out.push({ k: 'image', url: c.image.src, x: x + PAD, y: y + (h - ih) / 2, w: w - 2 * PAD, h: ih, fit: 'contain' })
		return
	}
	if (c.kind === 'logoText') {   // the logo text: big and bold, in the middle of its row
		out.push({ k: 'text', at: { x: x + PAD + 0.5, y: y + h / 2 + 2.4 }, text: fit(c.value, w - 2 * PAD, 7), size: 7, cls: 'tb-logo' })
		return
	}
	if (c.kind === 'company') {   // the drawing office: its name bold, then address / contact, one line each
		let cy = y + PAD + COMPANY_NAME
		;(c.lines ?? []).forEach((line, i) => {
			const size = i === 0 ? COMPANY_NAME : COMPANY_LINE
			out.push({ k: 'text', at: { x: x + PAD, y: cy }, text: fit(line, w - 2 * PAD, size), size, cls: i === 0 ? 'tb-company-name' : 'tb-company' })
			cy += i === 0 ? COMPANY_NAME * 1.4 : COMPANY_LINE * 1.5
		})
		return
	}
	out.push({ k: 'text', at: { x: x + PAD, y: y + PAD + LABEL }, text: fit(c.label.toUpperCase(), w - 2 * PAD, LABEL), size: LABEL, cls: 'tb-label' })
	out.push({ k: 'text', at: { x: x + PAD, y: y + CELL_H - PAD - 0.4 }, text: fit(c.value, w - 2 * PAD, VALUE), size: VALUE, cls: 'tb-value' })
}
/** A full-width row's height: a logo as tall as its image, the logo text 12 mm, the company block its lines (+ padding). */
const rowH = (c: TbCell) => (c.image ? Math.max(CELL_H, (c.image.h ?? 10) + 2 * PAD)
	: c.kind === 'logoText' ? Math.max(CELL_H, 16)
	: c.kind === 'company' ? Math.max(CELL_H, 2 * PAD + COMPANY_NAME * 1.4 + ((c.lines?.length ?? 1) - 1) * COMPANY_LINE * 1.5)
	: CELL_H)
/** Its column's width in the band layout. */
const colW = (c: TbCell) => (c.image ? 40 : c.kind === 'logoText' ? Math.min(60, 8 + c.value.length * 4.5) : c.kind === 'company' ? 55 : 50)
const revsH = (s: TbShown) => (s.revisions?.length ? REV_HEAD + s.revisions.length * REV_ROW : 0)

function revisionTable(out: Prim[], s: TbShown, x: number, y: number, w: number): void {
	const cols = [0, 0.2, 0.54].map((f) => x + f * w), heads = ['REV', 'DATE', 'NOTE']
	heads.forEach((t, i) => out.push({ k: 'text', at: { x: cols[i] + PAD, y: y + REV_HEAD - 0.9 }, text: t, size: 1.6, cls: 'tb-label' }))
	out.push(rule(x, y + REV_HEAD, x + w, y + REV_HEAD))
	s.revisions!.forEach((r, j) => {
		const ry = y + REV_HEAD + (j + 1) * REV_ROW
		// what changed (sheets-organising slice 7), else the issue's purpose — old revisions read as before
		;[r.code, r.date, r.desc ?? r.note ?? ''].forEach((t, i) => {
			const cw = (i < 2 ? cols[i + 1] : x + w) - cols[i]
			out.push({ k: 'text', at: { x: cols[i] + PAD, y: ry - 1 }, text: fit(t, cw - 2 * PAD, 2), size: 2, cls: 'tb-value' })
		})
		out.push(rule(x, ry, x + w, ry))
	})
}

/** Half-width cells `perRow` across, rows of CELL_H, from (x, y). */
function grid(out: Prim[], cells: TbShown['cells'], x: number, y: number, w: number, perRow: number): void {
	const cw = w / perRow
	cells.forEach((c, i) => {
		const cx = x + (i % perRow) * cw, cy = y + Math.floor(i / perRow) * CELL_H
		cell(out, cx, cy, cw, c)
		if (i % perRow) out.push(rule(cx, cy, cx, cy + CELL_H))
		out.push(rule(x, cy + CELL_H, x + w, cy + CELL_H))
	})
}

/**
 * The block for a paper `w × h` with margin `m`. Nothing is drawn (and no area taken) when the sheet hides it; the
 * template's `border` prints a hairline along the margin either way.
 */
export function titleBlockPrims(s: TbShown, w: number, h: number, m: number): { prims: Prim[]; area?: Bounds } {
	const out: Prim[] = []
	if (s.border) out.push(box(m, m, w - m, h - m, 'tb-border'))
	if (s.hidden) return { prims: out }
	const wide = s.cells.filter((c) => c.wide), half = s.cells.filter((c) => !c.wide)
	const innerW = w - 2 * m

	if (s.layout === 'horizontal') {
		// a band along the bottom: each full-width item (logos, logo text, company, wide fields, in their order) |
		// revisions | the grid (4 across)
		const gridRows = Math.ceil(half.length / 4)
		const bandH = Math.max(24, gridRows * CELL_H, revsH(s), ...wide.map(rowH))
		const y0 = h - m - bandH, cols: { w: number; draw: (x: number, cw: number) => void }[] = []
		for (const c of wide) cols.push({ w: colW(c), draw: (x, cw) => cell(out, x, y0, cw, c, c.image || c.kind ? bandH : CELL_H) })
		if (s.revisions) cols.push({ w: 60, draw: (x, cw) => revisionTable(out, s, x, y0, cw) })
		const used = cols.reduce((a, c) => a + c.w, 0)
		if (half.length) cols.push({ w: Math.max(80, innerW - used), draw: (x, cw) => grid(out, half, x, y0, cw, 4) })
		let x = m
		const scale = Math.min(1, innerW / cols.reduce((a, c) => a + c.w, 0))
		for (const [i, c] of cols.entries()) {
			const cw = c.w * scale
			c.draw(x, cw)
			if (i < cols.length - 1) out.push(rule(x + cw, y0, x + cw, h - m))
			x += cw
		}
		out.unshift({ k: 'line', pts: [{ x: m, y: y0 }, { x: w - m, y: y0 }, { x: w - m, y: h - m }, { x: m, y: h - m }], closed: true, fill: true, cls: 'tb-frame' })
		return { prims: out, area: { x0: m, y0, x1: w - m, y1: h - m } }
	}

	// a strip down the right, or (compact) a box in the bottom-right corner; same sections top to bottom
	const compact = s.layout === 'compact'
	const W = compact ? Math.max(70, innerW * 0.34) : Math.min(80, Math.max(50, innerW * 0.16))
	const x0 = w - m - W, x1 = w - m
	const topH = wide.reduce((a, c) => a + rowH(c), 0)
	const bottomH = revsH(s) + Math.ceil(half.length / 2) * CELL_H
	const y0 = compact ? h - m - topH - bottomH : m, y1 = h - m
	let y = y0
	for (const c of wide) { cell(out, x0, y, W, c, rowH(c)); y += rowH(c); out.push(rule(x0, y, x1, y)) }
	// the revisions and the grid sit at the bottom (the strip's free space is above them)
	let yb = y1 - Math.ceil(half.length / 2) * CELL_H
	if (half.length) { out.push(rule(x0, yb, x1, yb)); grid(out, half, x0, yb, W, 2) }
	if (s.revisions) { yb -= revsH(s); out.push(rule(x0, yb, x1, yb)); revisionTable(out, s, x0, yb, W) }
	out.unshift({ k: 'line', pts: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], closed: true, fill: true, cls: 'tb-frame' })
	return { prims: out, area: { x0, y0, x1, y1 } }
}
