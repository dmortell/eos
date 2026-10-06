// The TRANSMITTAL of an issue (Phase 4.6) as Excel: the package header (project, package, purpose, date, to, PDF),
// then each sheet with the revision it went at and whether that revision is new in this package.
import type { Issue } from '../domain/drawing'
import { transmittalRows, issueTag } from '../domain/issue'
import { download, fileSafe } from './download'

/** `number` = the issue's number (domain/issue issueNumbers): in the header and the file name. */
export async function exportTransmittal(issue: Issue, projectName: string, number?: number): Promise<void> {
	const ExcelJS = await import('exceljs')
	const wb = new ExcelJS.Workbook()
	const ws = wb.addWorksheet('Transmittal')
	ws.addRow(['Transmittal']).font = { bold: true, size: 14 }
	for (const [k, v] of [['Project', projectName], ['Issue No.', number ? String(number) : ''], ['Package', issue.name], ['Purpose', issue.purpose], ['Date', issue.date], ['To', issue.to ?? ''], ['Note', issue.note ?? ''], ['PDF', issue.file?.name ?? '']]) {
		const r = ws.addRow([k, v])
		r.getCell(1).font = { bold: true }
	}
	ws.addRow([])
	const head = ws.addRow(['Sheet No.', 'Title', 'Rev', 'Size', 'This issue'])
	head.eachCell((cell) => {
		cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
	})
	for (const s of transmittalRows(issue)) ws.addRow([s.number, s.title, s.rev, s.size, s.changed ? 'New revision' : 'As last issued'])
	// sheets of the package's last issue that aren't in this one (sheets-organising slice 8)
	for (const s of issue.withdrawn ?? []) ws.addRow([s.number, s.title, s.rev, '', 'Withdrawn']).getCell(5).font = { color: { argb: 'FFB91C1C' } }
	;[14, 44, 6, 8, 16].forEach((w, i) => (ws.getColumn(i + 1).width = w))
	download(await wb.xlsx.writeBuffer(), `Transmittal_${fileSafe(`${projectName} ${number ? `${issueTag(number)} ` : ''}${issue.name} ${issue.date}`)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
}
