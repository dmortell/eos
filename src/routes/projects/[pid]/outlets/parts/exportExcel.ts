import ExcelJS from 'exceljs'
import type { OutletConfig } from './types'
import { USAGE_COLORS, CABLE_COLORS, MOUNT_LABELS } from './constants'

/** Export outlets list to Excel and trigger download */
export async function exportOutletsToExcel(outlets: OutletConfig[], projectName: string, floorLabel: string) {
	const wb = new ExcelJS.Workbook()
	const ws = wb.addWorksheet('Outlets')

	// Print settings
	ws.pageSetup = {
		paperSize: 9, // A4
		orientation: 'landscape',
		fitToPage: true,
		fitToWidth: 1,
		fitToHeight: 0,
		margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
	}

	const headers = ['#', 'Label', 'Zone', 'Room', 'Usage', 'Ports', 'Cable', 'Mount', 'Level', 'Port Labels']
	const colWidths = [5, 12, 6, 10, 12, 6, 10, 10, 6, 40]

	// Title row
	ws.mergeCells(1, 1, 1, headers.length)
	const titleCell = ws.getCell(1, 1)
	titleCell.value = `${projectName} — ${floorLabel} Outlets`
	titleCell.font = { bold: true, size: 13 }
	titleCell.alignment = { horizontal: 'left' }

	// Header row
	const headerRow = 3
	for (let i = 0; i < headers.length; i++) {
		const cell = ws.getCell(headerRow, i + 1)
		cell.value = headers[i]
		cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4B5563' } }
		cell.alignment = { horizontal: 'center' }
		ws.getColumn(i + 1).width = colWidths[i]
	}

	// Sort outlets by label, then by id
	const sorted = [...outlets].sort((a, b) => (a.label ?? a.id).localeCompare(b.label ?? b.id))

	// Data rows
	for (let i = 0; i < sorted.length; i++) {
		const o = sorted[i]
		const row = headerRow + 1 + i
		const usageLabel = USAGE_COLORS[o.usage]?.label ?? o.usage
		const cableLabel = CABLE_COLORS[o.cableType]?.label ?? o.cableType
		const mountLabel = MOUNT_LABELS[o.mountType as keyof typeof MOUNT_LABELS] ?? o.mountType

		ws.getCell(row, 1).value = i + 1
		ws.getCell(row, 2).value = o.label ?? ''
		ws.getCell(row, 3).value = o.roomNumber?.replace(/^.*\./, '') ?? ''
		ws.getCell(row, 4).value = o.roomNumber ?? ''
		ws.getCell(row, 5).value = usageLabel
		ws.getCell(row, 6).value = o.portCount
		ws.getCell(row, 7).value = cableLabel
		ws.getCell(row, 8).value = mountLabel
		ws.getCell(row, 9).value = o.level === 'high' ? 'H' : 'L'
		ws.getCell(row, 10).value = o.portLabels?.join(', ') ?? ''

		// Usage color dot
		const uc = USAGE_COLORS[o.usage]
		if (uc) {
			ws.getCell(row, 5).font = { size: 9, color: { argb: 'FF' + uc.stroke.slice(1) } }
		}

		// Alternating row fill
		if (i % 2 === 1) {
			for (let c = 1; c <= headers.length; c++) {
				ws.getCell(row, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }
			}
		}

		// Font for all cells
		for (let c = 1; c <= headers.length; c++) {
			const cell = ws.getCell(row, c)
			if (!cell.font?.color) cell.font = { size: 9 }
			cell.alignment = { horizontal: c === 10 ? 'left' : 'center' }
		}
	}

	// Summary row
	const summaryRow = headerRow + 1 + sorted.length + 1
	ws.getCell(summaryRow, 1).value = `Total: ${sorted.length} outlets, ${sorted.reduce((s, o) => s + o.portCount, 0)} ports`
	ws.getCell(summaryRow, 1).font = { bold: true, size: 9 }
	ws.mergeCells(summaryRow, 1, summaryRow, headers.length)

	// Generate and download
	const safeName = (projectName || 'project').replace(/[^a-zA-Z0-9_-]/g, '_')
	const safeFloor = (floorLabel || 'floor').replace(/[^a-zA-Z0-9_-]/g, '_')
	const filename = `${safeName}-outlets-${safeFloor}.xlsx`

	const buffer = await wb.xlsx.writeBuffer()
	const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = filename
	a.click()
	URL.revokeObjectURL(url)
}
