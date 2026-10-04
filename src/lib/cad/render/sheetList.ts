// Excel of the sheet register (Phase 4.4 — ported from Pages' drawingListExport.ts): the rows as shown (filtered,
// sorted), or just the selection. exceljs is loaded on demand.
import { revisionColumns, type SheetRow } from '../domain/sheetList'
import { download, fileSafe } from './download'

const COLS: { head: string; width: number; get: (r: SheetRow) => string | number }[] = [
	{ head: 'Sheet No.', width: 14, get: (r) => r.number },
	{ head: 'Title', width: 40, get: (r) => r.title },
	{ head: 'Place', width: 22, get: (r) => r.place },
	{ head: 'Kind', width: 12, get: (r) => r.kind },
	{ head: 'Discipline', width: 14, get: (r) => r.discipline },
	{ head: 'Tags', width: 22, get: (r) => r.tags.join(', ') },
	{ head: 'Rev', width: 6, get: (r) => r.rev },
	{ head: 'Size', width: 8, get: (r) => r.size },
	{ head: 'Scale', width: 10, get: (r) => r.scale },
	{ head: 'Status', width: 10, get: (r) => r.status },
]

export async function exportSheetRows(rows: SheetRow[], projectName: string): Promise<void> {
	const ExcelJS = await import('exceljs')
	const wb = new ExcelJS.Workbook()
	const ws = wb.addWorksheet('Sheets')
	// then a date column per revision issued (P1, P2, C1 …): when each sheet got it
	const revs = revisionColumns(rows)
	const head = ws.addRow([...COLS.map((c) => c.head), ...revs.map((v) => v.code)])
	head.eachCell((cell) => {
		cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
	})
	COLS.forEach((c, i) => (ws.getColumn(i + 1).width = c.width))
	revs.forEach((_, i) => (ws.getColumn(COLS.length + i + 1).width = 11))
	for (const r of rows) ws.addRow([...COLS.map((c) => c.get(r)), ...revs.map((v) => v.dateOf(r))])
	ws.views = [{ state: 'frozen', ySplit: 1 }]
	download(await wb.xlsx.writeBuffer(), `Sheets_${fileSafe(projectName)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
}
