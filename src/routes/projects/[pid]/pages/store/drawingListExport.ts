// Excel export of the drawing management dialog's rows (drawings-plan §5, phase 6) — the rows as shown
// (filtered, sorted), or just the selection. exceljs is loaded on demand, like $lib/versioning/export.ts.
import type { SheetRow } from './drawingList'

const COLS: { head: string; width: number; get: (r: SheetRow) => string }[] = [
	{ head: 'Drawing No.', width: 16, get: (r) => r.number },
	{ head: 'Title', width: 40, get: (r) => r.title },
	{ head: 'Place', width: 30, get: (r) => r.placePath },
	{ head: 'Kind', width: 12, get: (r) => r.kind },
	{ head: 'Discipline', width: 14, get: (r) => r.discipline },
	{ head: 'Tags', width: 24, get: (r) => r.tags.join(', ') },
	{ head: 'Status', width: 10, get: (r) => r.status },
	{ head: 'Rev', width: 8, get: (r) => r.rev },
	{ head: 'Size', width: 9, get: (r) => r.size },
	{ head: 'Scale', width: 9, get: (r) => r.scale },
	{ head: 'Updated', width: 12, get: (r) => r.updatedAt.slice(0, 10) },
]

export async function exportDrawingRows(rows: SheetRow[], projectName: string): Promise<void> {
	const ExcelJS = await import('exceljs')
	const wb = new ExcelJS.Workbook()
	const ws = wb.addWorksheet('Drawings')
	const head = ws.addRow(COLS.map((c) => c.head))
	head.eachCell((cell) => {
		cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
		cell.alignment = { vertical: 'middle' }
	})
	COLS.forEach((c, i) => (ws.getColumn(i + 1).width = c.width))
	for (const r of rows) ws.addRow(COLS.map((c) => c.get(r)))
	ws.views = [{ state: 'frozen', ySplit: 1 }]
	const buf = await wb.xlsx.writeBuffer()
	const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
	const a = document.createElement('a')
	a.href = url; a.download = `Drawings_${projectName.replace(/[^\w-]+/g, '_') || 'project'}.xlsx`; a.click()
	URL.revokeObjectURL(url)
}
