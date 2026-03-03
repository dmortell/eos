import ExcelJS from 'exceljs'
import type { RackData, ZoneConfig } from './types'

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

		// Set column widths once per sheet
		ws.getColumn(1).width = 4
		ws.getColumn(2).width = 3
		for (let col = 3; col <= 26; col++) {
			ws.getColumn(col).width = 12
		}

		let row = 1

		for (const rack of group.racks) {
			// Title
			ws.mergeCells(row, 1, row, 26)
			const titleCell = ws.getCell(row, 1)
			titleCell.value = `${rack.frame.name} (${rack.frame.totalRU}U)`
			titleCell.font = { bold: true, size: 14 }
			titleCell.alignment = { horizontal: 'left' }
			row += 2

			// Column header row (port positions 1-24)
			ws.getCell(row, 1).value = 'RU'
			ws.getCell(row, 1).font = { bold: true, size: 8 }
			ws.getCell(row, 1).alignment = { horizontal: 'center' }
			ws.getCell(row, 2).value = 'Row'
			ws.getCell(row, 2).font = { bold: true, size: 8 }

			for (let col = 0; col < 24; col++) {
				const cell = ws.getCell(row, col + 3)
				cell.value = col + 1
				cell.font = { bold: true, size: 7 }
				cell.alignment = { horizontal: 'center' }
			}
			row++

			// Build RU map sorted top-down (highest RU first)
			const slotRUs = new Set<number>()
			for (const slot of rack.frame.slots) {
				for (let h = 0; h < slot.height; h++) slotRUs.add(slot.ru + h)
			}

			// Panels sorted by RU descending (top of frame first)
			const sortedPanels = [...rack.panels].sort((a, b) => b.ru - a.ru)

			// Iterate RUs from top to bottom
			for (let ru = rack.frame.totalRU; ru >= 1; ru--) {
				const panel = sortedPanels.find(p => p.ru === ru)
				const slot = rack.frame.slots.find(s => s.ru === ru)

				if (panel) {
					// Top row
					ws.getCell(row, 1).value = ru
					ws.getCell(row, 1).font = { bold: true, size: 8 }
					ws.getCell(row, 1).alignment = { horizontal: 'center' }
					ws.getCell(row, 2).value = 'T'
					ws.getCell(row, 2).font = { size: 7 }
					for (let col = 0; col < 24; col++) {
						const port = panel.topRow[col]
						if (port) {
							const cell = ws.getCell(row, col + 3)
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
					ws.getCell(row, 2).value = 'B'
					ws.getCell(row, 2).font = { size: 7 }
					for (let col = 0; col < 24; col++) {
						const port = panel.bottomRow[col]
						if (port) {
							const cell = ws.getCell(row, col + 3)
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
					// Slot row
					ws.getCell(row, 1).value = ru
					ws.getCell(row, 1).font = { size: 8 }
					ws.getCell(row, 1).alignment = { horizontal: 'center' }
					ws.mergeCells(row, 2, row, 26)
					const cell = ws.getCell(row, 2)
					cell.value = `${slot.type.replace(/-/g, ' ').toUpperCase()}${slot.label ? ': ' + slot.label : ''}`
					cell.font = { size: 8, italic: true, color: { argb: 'FF888888' } }
					cell.fill = {
						type: 'pattern', pattern: 'solid',
						fgColor: { argb: slot.type === 'device' ? 'FFE8EAF6' : 'FFF5F5F5' }
					}
					ws.getRow(row).height = slot.height * 12
					row++
				} else if (!slotRUs.has(ru)) {
					// Empty RU
					ws.getCell(row, 1).value = ru
					ws.getCell(row, 1).font = { size: 7, color: { argb: 'FFCCCCCC' } }
					ws.getCell(row, 1).alignment = { horizontal: 'center' }
					ws.getRow(row).height = 8
					row++
				}
			}

			// Add spacing between frames when grouped
			if (group.racks.length > 1) {
				row += 2
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

function thinBorder(): Partial<ExcelJS.Borders> {
	const side: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFDDDDDD' } }
	return { top: side, bottom: side, left: side, right: side }
}
