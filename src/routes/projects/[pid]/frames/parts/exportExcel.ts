import ExcelJS from 'exceljs'
import type { RackData, ZoneConfig } from './types'

/** Count how many Excel rows a rack's RU content will produce (excluding title/header) */
function countRackRows(rack: RackData): number {
	const slotRUs = new Set<number>()
	for (const slot of rack.frame.slots) {
		for (let h = 0; h < slot.height; h++) slotRUs.add(slot.ru + h)
	}
	const sortedPanels = rack.panels
	let rows = 0
	for (let ru = rack.frame.totalRU; ru >= 1; ru--) {
		const panel = sortedPanels.find(p => p.ru === ru)
		const slot = rack.frame.slots.find(s => s.ru === ru)
		if (panel) {
			rows += 2 // T + B
		} else if (slot && slot.ru === ru) {
			rows += slot.height
		} else if (!slotRUs.has(ru)) {
			rows += 1
		}
	}
	return rows
}

const RACK_COLS = 26 // 1 RU + 1 Row + 24 ports
const RACK_GAP = 1   // gap column between racks

/** Export patch frame data to an Excel workbook and trigger download */
export async function exportToExcel(racks: RackData[], zones: ZoneConfig[], groupByRoom = false) {
	const wb = new ExcelJS.Workbook()
	const zoneLabel = zones.map(z => `F${String(z.floor).padStart(2, '0')}-Z${z.zone}`).join('_')

	// Group racks by server room if requested, otherwise one sheet per frame
	const rackGroups: { sheetName: string; racks: RackData[] }[] = []
	if (groupByRoom) {
		const byRoom = new Map<string, RackData[]>()
		for (const rack of racks) {
			const list = byRoom.get(rack.frame.serverRoom) ?? []
			list.push(rack)
			byRoom.set(rack.frame.serverRoom, list)
		}
		for (const [room, roomRacks] of byRoom) {
			rackGroups.push({ sheetName: `Room ${room}`, racks: roomRacks })
		}
	} else {
		for (const rack of racks) {
			rackGroups.push({ sheetName: rack.frame.name, racks: [rack] })
		}
	}

	for (const group of rackGroups) {
		const sheetName = group.sheetName.substring(0, 31)
		const ws = wb.addWorksheet(sheetName)

		if (group.racks.length <= 1) {
			// Single rack — simple vertical layout
			setColWidths(ws, 1)
			writeRack(ws, group.racks[0], 1, 1)
		} else {
			// Multiple racks — side by side, bottoms aligned
			const rackRowCounts = group.racks.map(r => countRackRows(r))
			const maxRows = Math.max(...rackRowCounts)
			const headerRows = 3 // title + blank + column header

			for (let ri = 0; ri < group.racks.length; ri++) {
				const colOffset = 1 + ri * (RACK_COLS + RACK_GAP)
				setColWidths(ws, colOffset)

				// Pad shorter racks: offset their content start so RU 1 aligns
				const pad = maxRows - rackRowCounts[ri]
				const startRow = 1 + pad // title row shifts down by pad

				writeRack(ws, group.racks[ri], startRow, colOffset)
			}
		}
	}

	// Generate and download
	const buffer = await wb.xlsx.writeBuffer()
	const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = `PatchFrame_${zoneLabel}.xlsx`
	a.click()
	URL.revokeObjectURL(url)
}

function setColWidths(ws: ExcelJS.Worksheet, colOffset: number) {
	ws.getColumn(colOffset).width = 4     // RU
	ws.getColumn(colOffset + 1).width = 3 // Row (T/B)
	for (let c = 2; c < RACK_COLS; c++) {
		ws.getColumn(colOffset + c).width = 12
	}
}

function writeRack(ws: ExcelJS.Worksheet, rack: RackData, startRow: number, colOffset: number) {
	const c1 = colOffset       // RU column
	const c2 = colOffset + 1   // Row (T/B) column
	const cEnd = colOffset + RACK_COLS - 1 // last port column

	let row = startRow

	// Title
	ws.mergeCells(row, c1, row, cEnd)
	const titleCell = ws.getCell(row, c1)
	titleCell.value = `${rack.frame.name} (${rack.frame.totalRU}U)`
	titleCell.font = { bold: true, size: 14 }
	titleCell.alignment = { horizontal: 'left' }
	row += 2

	// Column header row
	ws.getCell(row, c1).value = 'RU'
	ws.getCell(row, c1).font = { bold: true, size: 8 }
	ws.getCell(row, c1).alignment = { horizontal: 'center' }
	ws.getCell(row, c2).value = 'Row'
	ws.getCell(row, c2).font = { bold: true, size: 8 }
	for (let col = 0; col < 24; col++) {
		const cell = ws.getCell(row, colOffset + 2 + col)
		cell.value = col + 1
		cell.font = { bold: true, size: 7 }
		cell.alignment = { horizontal: 'center' }
	}
	row++

	// Build RU map
	const slotRUs = new Set<number>()
	for (const slot of rack.frame.slots) {
		for (let h = 0; h < slot.height; h++) slotRUs.add(slot.ru + h)
	}
	const sortedPanels = [...rack.panels].sort((a, b) => b.ru - a.ru)

	// Iterate RUs top to bottom
	for (let ru = rack.frame.totalRU; ru >= 1; ru--) {
		const panel = sortedPanels.find(p => p.ru === ru)
		const slot = rack.frame.slots.find(s => s.ru === ru)

		if (panel) {
			// Top row
			ws.getCell(row, c1).value = ru
			ws.getCell(row, c1).font = { bold: true, size: 8 }
			ws.getCell(row, c1).alignment = { horizontal: 'center' }
			ws.getCell(row, c2).value = 'T'
			ws.getCell(row, c2).font = { size: 7 }
			for (let col = 0; col < 24; col++) {
				const port = panel.topRow[col]
				if (port) {
					const cell = ws.getCell(row, colOffset + 2 + col)
					cell.value = port.label
					cell.font = { size: 7, name: 'Consolas' }
					cell.alignment = { horizontal: 'center' }
					cell.fill = {
						type: 'pattern', pattern: 'solid',
						fgColor: { argb: port.serverRoom === 'B' ? 'FFE8D5F5' : 'FFD5E8F5' }
					}
					cell.border = thinBorder()
				}
			}
			ws.getRow(row).height = 14
			row++

			// Bottom row
			ws.getCell(row, c2).value = 'B'
			ws.getCell(row, c2).font = { size: 7 }
			for (let col = 0; col < 24; col++) {
				const port = panel.bottomRow[col]
				if (port) {
					const cell = ws.getCell(row, colOffset + 2 + col)
					cell.value = port.label
					cell.font = { size: 7, name: 'Consolas' }
					cell.alignment = { horizontal: 'center' }
					cell.fill = {
						type: 'pattern', pattern: 'solid',
						fgColor: { argb: port.serverRoom === 'B' ? 'FFE8D5F5' : 'FFD5E8F5' }
					}
					cell.border = thinBorder()
				}
			}
			ws.getRow(row).height = 14
			row++
		} else if (slot && slot.ru === ru) {
			// Slot rows — one per RU
			const slotStartRow = row
			const slotFill: ExcelJS.Fill = {
				type: 'pattern', pattern: 'solid',
				fgColor: { argb: slot.type === 'device' ? 'FFE8EAF6' : 'FFF5F5F5' }
			}
			for (let h = slot.height - 1; h >= 0; h--) {
				ws.getCell(row, c1).value = slot.ru + h
				ws.getCell(row, c1).font = { size: 7 }
				ws.getCell(row, c1).alignment = { horizontal: 'center' }
				ws.getRow(row).height = 14
				for (let c = c2; c <= cEnd; c++) {
					ws.getCell(row, c).fill = slotFill
				}
				row++
			}
			// Merge for label
			if (slot.height > 1) {
				ws.mergeCells(slotStartRow, c2, slotStartRow + slot.height - 1, cEnd)
			} else {
				ws.mergeCells(slotStartRow, c2, slotStartRow, cEnd)
			}
			const cell = ws.getCell(slotStartRow, c2)
			cell.value = `${slot.type.replace(/-/g, ' ').toUpperCase()}${slot.label ? ': ' + slot.label : ''}`
			cell.font = { size: 8, italic: true, color: { argb: 'FF888888' } }
			cell.alignment = { vertical: 'middle' }
			cell.fill = slotFill
		} else if (!slotRUs.has(ru)) {
			// Empty RU
			ws.getCell(row, c1).value = ru
			ws.getCell(row, c1).font = { size: 7, color: { argb: 'FFCCCCCC' } }
			ws.getCell(row, c1).alignment = { horizontal: 'center' }
			ws.getRow(row).height = 14
			row++
		}
	}
}

function thinBorder(): Partial<ExcelJS.Borders> {
	const side: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFDDDDDD' } }
	return { top: side, bottom: side, left: side, right: side }
}
