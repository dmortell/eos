/**
 * @file src/lib/versioning/export.ts
 * @description Excel export for the Master Drawing List using exceljs.
 */

import type { Firestore } from '$lib'
import { getDrawingListWithRevisions } from './service'

export async function exportDrawingListToExcel(db: Firestore, projectId: string): Promise<void> {
	const ExcelJS = await import('exceljs')
	const data = await getDrawingListWithRevisions(db, projectId)

	const maxRevs = Math.max(1, ...data.map(d => d.revisions.length))

	const workbook = new ExcelJS.Workbook()
	const sheet = workbook.addWorksheet('Drawing List')

	// Build header row
	const headers = ['#', 'Drawing No.', 'Drawing Title / Description', 'Tool', 'Size', 'Scale']
	for (let i = 0; i < maxRevs; i++) {
		headers.push(`Rev ${String.fromCharCode(65 + i)}`)
	}
	const headerRow = sheet.addRow(headers)

	// Style header
	headerRow.eachCell((cell) => {
		cell.font = { bold: true, size: 10 }
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
		cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
		cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
		cell.border = {
			bottom: { style: 'thin', color: { argb: 'FF333333' } },
		}
	})

	// Set column widths
	sheet.getColumn(1).width = 5    // #
	sheet.getColumn(2).width = 32   // Drawing No.
	sheet.getColumn(3).width = 45   // Title
	sheet.getColumn(4).width = 18   // Tool
	sheet.getColumn(5).width = 8    // Size
	sheet.getColumn(6).width = 10   // Scale
	for (let i = 0; i < maxRevs; i++) {
		sheet.getColumn(7 + i).width = 14
	}

	// Data rows
	data.forEach((drawing, idx) => {
		const row: (string | number)[] = [
			idx + 1,
			drawing.drawingNumber ?? '',
			drawing.title ?? '',
			drawing.toolType ?? '',
			drawing.sheetSize ?? '',
			drawing.scale ?? '',
		]

		// Revision date columns
		for (let i = 0; i < maxRevs; i++) {
			const rev = drawing.revisions[i]
			if (rev) {
				const d = new Date(rev.issuedAt)
				row.push(d.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }))
			} else {
				row.push('')
			}
		}

		const dataRow = sheet.addRow(row)
		dataRow.eachCell((cell, colNumber) => {
			cell.font = { size: 10 }
			cell.alignment = { vertical: 'middle' }
			if (colNumber >= 7) {
				cell.alignment = { vertical: 'middle', horizontal: 'center' }
			}
			cell.border = {
				bottom: { style: 'hair', color: { argb: 'FFCCCCCC' } },
			}
		})
	})

	// Freeze header row
	sheet.views = [{ state: 'frozen', ySplit: 1 }]

	// Generate and download
	const buffer = await workbook.xlsx.writeBuffer()
	const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = `Drawing_List_${projectId}.xlsx`
	a.click()
	URL.revokeObjectURL(url)
}
