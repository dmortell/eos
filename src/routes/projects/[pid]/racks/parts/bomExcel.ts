/**
 * Excel BOM export — writes a two-sheet workbook:
 *  1. "Row BOM" — every line per row (for negotiating with installers)
 *  2. "Consolidated" — aggregated totals across the whole project
 *
 * Uses ExcelJS (already a project dep via frames/exportExcel.ts).
 */
import ExcelJS from 'exceljs'
import type { BOMLine } from './bom'

function dateStr(): string {
	const d = new Date()
	return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

function ensureClientDownload(buffer: ArrayBuffer, filename: string) {
	const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = filename
	document.body.appendChild(a)
	a.click()
	a.remove()
	URL.revokeObjectURL(url)
}

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } }
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' } }

function addSheet(
	wb: ExcelJS.Workbook,
	name: string,
	columns: { header: string; key: string; width: number }[],
	rows: Record<string, unknown>[],
) {
	const ws = wb.addWorksheet(name)
	ws.columns = columns
	const headerRow = ws.getRow(1)
	headerRow.values = columns.map(c => c.header)
	headerRow.eachCell(cell => {
		cell.fill = HEADER_FILL
		cell.font = HEADER_FONT
		cell.alignment = { vertical: 'middle' }
	})
	headerRow.height = 18
	ws.views = [{ state: 'frozen', ySplit: 1 }]
	for (const row of rows) ws.addRow(row)
	// Zebra striping
	ws.eachRow({ includeEmpty: false }, (row, idx) => {
		if (idx === 1) return
		if (idx % 2 === 0) {
			row.eachCell(cell => {
				cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
			})
		}
	})
	return ws
}

/**
 * Export two sheets: row-level BOM and consolidated totals.
 * `projectName` / `roomLabel` go into the filename and a header on each sheet.
 */
export async function exportBomToExcel(
	rowLines: BOMLine[],
	consolidated: BOMLine[],
	opts: { projectName?: string; floorLabel?: string; roomLabel?: string } = {},
): Promise<void> {
	const wb = new ExcelJS.Workbook()
	wb.creator = 'EOS'
	wb.created = new Date()

	// ── Row BOM ──
	addSheet(
		wb,
		'Row BOM',
		[
			{ header: 'Row', key: 'row', width: 12 },
			{ header: 'Group', key: 'group', width: 16 },
			{ header: 'SKU', key: 'sku', width: 22 },
			{ header: 'Description', key: 'description', width: 60 },
			{ header: 'Qty', key: 'qty', width: 8 },
			{ header: 'Note', key: 'note', width: 28 },
			{ header: 'Link', key: 'link', width: 40 },
		],
		rowLines.map(l => ({
			row: l.rowLabel ?? '',
			group: l.group,
			sku: l.sku,
			description: l.description,
			qty: l.qty,
			note: l.note ?? '',
			link: l.productUrl ?? '',
		})),
	)

	// ── Consolidated ──
	addSheet(
		wb,
		'Consolidated',
		[
			{ header: 'Group', key: 'group', width: 16 },
			{ header: 'SKU', key: 'sku', width: 22 },
			{ header: 'Description', key: 'description', width: 60 },
			{ header: 'Qty', key: 'qty', width: 8 },
			{ header: 'Note', key: 'note', width: 28 },
			{ header: 'Link', key: 'link', width: 40 },
		],
		consolidated.map(l => ({
			group: l.group,
			sku: l.sku,
			description: l.description,
			qty: l.qty,
			note: l.note ?? '',
			link: l.productUrl ?? '',
		})),
	)

	// ── Notice sheet ──
	const notice = wb.addWorksheet('Notice')
	notice.getRow(1).values = ['Section', 'Details']
	notice.getRow(2).values = ['Project', opts.projectName ?? '—']
	notice.getRow(3).values = ['Scope', `${opts.floorLabel ?? ''} ${opts.roomLabel ?? ''}`.trim() || '—']
	notice.getRow(4).values = ['Generated', new Date().toISOString()]
	notice.getRow(5).values = ['Notice', 'This BOM is a planning aid. Verify all selections and quantities against maker documentation before ordering.']
	notice.columns = [{ width: 14 }, { width: 80 }]
	notice.getRow(1).eachCell(cell => { cell.fill = HEADER_FILL; cell.font = HEADER_FONT })

	// ── Filename ──
	const slug = [opts.projectName, opts.floorLabel, opts.roomLabel, 'BOM', dateStr()]
		.filter(Boolean)
		.join('-')
		.replace(/[\\/:*?"<>|]/g, '')
		.replace(/\s+/g, '_')
	const filename = `${slug}.xlsx`

	const buf = await wb.xlsx.writeBuffer()
	ensureClientDownload(buf as ArrayBuffer, filename)
}
