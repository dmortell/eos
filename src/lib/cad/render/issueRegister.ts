// The ISSUE REGISTER as Excel (backlog "Issue register for the PM"): every sheet that went out, a column per issue with
// the revision it went at (bold = a new revision in that issue, red "withdrawn"), or — latest only — one column with
// each sheet's last revision, issue and date. exceljs is loaded on demand.
import type { Issue } from '../domain/drawing'
import { issueRegister } from '../domain/issue'
import { fileSafe, saveFile } from './download'

export async function exportIssueRegister(issues: Issue[], projectName: string, latest: boolean): Promise<void> {
	const ExcelJS = await import('exceljs')
	const reg = issueRegister(issues, latest)
	const wb = new ExcelJS.Workbook()
	const ws = wb.addWorksheet('Release register')
	ws.addRow([`${projectName} — release register${latest ? ' (latest)' : ''}`]).font = { bold: true, size: 14 }
	ws.addRow([`As of ${new Date().toISOString().slice(0, 10)} · ${issues.length} release(s)`])
	ws.addRow([])
	const head = ws.addRow(['Sheet No.', 'Title', ...reg.columns.map((c) => (c.date ? `${c.head}\n${c.date}` : c.head))])
	head.height = latest ? 18 : 30
	head.eachCell((cell) => {
		cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
		cell.alignment = { wrapText: true, vertical: 'middle' }
	})
	for (const r of reg.rows) {
		const row = ws.addRow([r.number, r.title, ...r.cells.map((c) => (c === 'withdrawn' ? 'withdrawn' : c?.rev ?? ''))])
		r.cells.forEach((c, i) => {
			const cell = row.getCell(i + 3)
			cell.alignment = { horizontal: 'center' }
			if (c === 'withdrawn') cell.font = { color: { argb: 'FFB91C1C' } }
			else if (c?.new) cell.font = { bold: true }
		})
	}
	ws.getColumn(1).width = 14
	ws.getColumn(2).width = 40
	reg.columns.forEach((_, i) => (ws.getColumn(i + 3).width = latest ? 30 : 16))
	await saveFile(await wb.xlsx.writeBuffer(), `ReleaseRegister_${fileSafe(projectName)}${latest ? '_latest' : ''}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', { what: `Release register${latest ? ' latest' : ''}` })
}
