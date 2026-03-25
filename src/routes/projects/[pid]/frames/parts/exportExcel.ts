import ExcelJS from 'exceljs'
import { formatFloor } from './engine'
import type { RackData, ZoneConfig, LocType } from './types'

/** Excel fill colors per location type — matches the HTML drawing palette */
const LOC_TYPE_FILLS: Record<string, { bg: string; text: string }> = {
	'N/A':  { bg: 'FFF0F0F0', text: 'FF999999' },
	desk:   { bg: 'FFDBEAFE', text: 'FF2563EB' },
	AP:     { bg: 'FFDCFCE7', text: 'FF16A34A' },
	PR:     { bg: 'FFFEF3C7', text: 'FFEA580C' },
	RS:     { bg: 'FFF3E8FF', text: 'FF9333EA' },
	FR:     { bg: 'FFFEE2E2', text: 'FFDC2626' },
	WC:     { bg: 'FFCFFAFE', text: 'FF0891B2' },
	TV:     { bg: 'FFFCE7F3', text: 'FFDB2777' },
	LK:     { bg: 'FFFEF3C7', text: 'FFD97706' },
}
const DEFAULT_FILL = { bg: 'FFDBEAFE', text: 'FF2563EB' }

const RACK_COLS = 25 // 1 RU + 24 ports
const RACK_GAP = 1   // gap column between racks
const ROWS_PER_RU = 2 // every RU uses 2 Excel rows

/** Export patch frame data to an Excel workbook and trigger download */
export async function exportToExcel(racks: RackData[], zones: ZoneConfig[], groupByRoom = false, floorFormat = 'L01', reservations?: Map<string, LocType>) {
	const wb = new ExcelJS.Workbook()
	const floor = zones[0]?.floor ?? 1
	const floorStr = formatFloor(floor, floorFormat)

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
			rackGroups.push({ sheetName: `${floorStr} Room ${room}`, racks: roomRacks })
		}
	} else {
		for (const rack of racks) {
			rackGroups.push({ sheetName: `${floorStr} ${rack.frame.name}`, racks: [rack] })
		}
	}

	const filename = `PatchFrames-${dateStr()}.xlsx`

	for (const group of rackGroups) {
		const sheetName = group.sheetName.substring(0, 31)
		const ws = wb.addWorksheet(sheetName)

		// Print settings: A3 landscape, fit on one page, narrow margins
		ws.pageSetup = {
			paperSize: 8 as ExcelJS.PaperSize, // A3
			orientation: 'landscape',
			fitToPage: true,
			fitToWidth: 1,
			fitToHeight: 1,
			margins: {
				left: 0.25, right: 0.25,
				top: 0.5, bottom: 0.5,
				header: 0.3, footer: 0.3,
			},
		}
		ws.headerFooter = {
			oddFooter: `&L${filename}&R&P / &N`,
		}

		if (group.racks.length <= 1) {
			setColWidths(ws, 1)
			writeRack(ws, group.racks[0], 1, 1, floorStr, reservations)
		} else {
			// Multiple racks side by side, bottoms aligned
			const maxRU = Math.max(...group.racks.map(r => r.frame.totalRU))

			for (let ri = 0; ri < group.racks.length; ri++) {
				const colOffset = 1 + ri * (RACK_COLS + RACK_GAP)
				setColWidths(ws, colOffset)

				// Pad shorter racks so RU 1 aligns at the bottom
				const pad = (maxRU - group.racks[ri].frame.totalRU) * ROWS_PER_RU
				writeRack(ws, group.racks[ri], 1 + pad, colOffset, floorStr, reservations)
			}
		}
	}

	// Generate and download
	const buffer = await wb.xlsx.writeBuffer()
	const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = filename
	a.click()
	URL.revokeObjectURL(url)
}

function setColWidths(ws: ExcelJS.Worksheet, colOffset: number) {
	ws.getColumn(colOffset).width = 4 // RU column
	for (let c = 1; c < RACK_COLS; c++) {
		ws.getColumn(colOffset + c).width = 12
	}
}

function writeRack(ws: ExcelJS.Worksheet, rack: RackData, startRow: number, colOffset: number, floorStr: string, reservations?: Map<string, LocType>) {
	const c1 = colOffset          // RU column
	const cPort1 = colOffset + 1  // first port column
	const cEnd = colOffset + RACK_COLS - 1

	let row = startRow

	// Title
	ws.mergeCells(row, c1, row, cEnd)
	const titleCell = ws.getCell(row, c1)
	titleCell.value = `${floorStr} Room ${rack.frame.serverRoom} — ${rack.frame.name} (${rack.frame.totalRU}U)`
	titleCell.font = { bold: true, size: 14 }
	titleCell.alignment = { horizontal: 'left' }
	row += 2

	// Column header row
	const headerRow = row
	ws.getCell(row, c1).value = 'RU'
	ws.getCell(row, c1).font = { bold: true, size: 8 }
	ws.getCell(row, c1).alignment = { horizontal: 'center' }
	for (let col = 0; col < 24; col++) {
		const cell = ws.getCell(row, cPort1 + col)
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

	// Iterate RUs top to bottom — every RU gets exactly 2 Excel rows
	for (let ru = rack.frame.totalRU; ru >= 1; ru--) {
		const panel = sortedPanels.find(p => p.ru === ru)
		const slot = rack.frame.slots.find(s => s.ru === ru)

		if (panel) {
			const blockStart = row
			const frameId = rack.frame.id
			// Panel: upper row
			ws.getCell(row, c1).value = ru
			ws.getCell(row, c1).font = { bold: true, size: 8 }
			ws.getCell(row, c1).alignment = { horizontal: 'center' }
			for (let col = 0; col < panel.topRow.length; col++) {
				const port = panel.topRow[col]
				if (port) {
					writePortCell(ws.getCell(row, cPort1 + col), port)
				} else {
					const resType = reservations?.get(`${frameId}:${ru}:top:${col}`)
					if (resType) writeReservedCell(ws.getCell(row, cPort1 + col), resType)
				}
			}
			ws.getRow(row).height = 14
			row++

			// Panel: lower row — always emit to maintain 2 rows per RU
			if (panel.bottomRow.length > 0) {
				for (let col = 0; col < panel.bottomRow.length; col++) {
					const port = panel.bottomRow[col]
					if (port) {
						writePortCell(ws.getCell(row, cPort1 + col), port)
					} else {
						const resType = reservations?.get(`${frameId}:${ru}:bottom:${col}`)
						if (resType) writeReservedCell(ws.getCell(row, cPort1 + col), resType)
					}
				}
			}
			ws.getRow(row).height = 14
			row++
			applyBlockBorder(ws, blockStart, row - 1, c1, cEnd)
		} else if (slot && slot.ru === ru) {
			// Slot: 2 rows per RU of slot height
			const totalSlotRows = slot.height * ROWS_PER_RU
			const blockStart = row
			const slotFill: ExcelJS.Fill = {
				type: 'pattern', pattern: 'solid',
				fgColor: { argb: slot.type === 'device' ? 'FFE8EAF6' : 'FFF5F5F5' }
			}
			for (let h = slot.height - 1; h >= 0; h--) {
				// Row 1 of this RU: show RU number
				ws.getCell(row, c1).value = slot.ru + h
				// ws.getCell(row, c1).font = { size: 7 }
				ws.getCell(row, c1).font = { bold: true, size: 8 }
				ws.getCell(row, c1).alignment = { horizontal: 'center' }
				ws.getRow(row).height = 14
				for (let c = cPort1; c <= cEnd; c++) ws.getCell(row, c).fill = slotFill
				row++
				// Row 2 of this RU
				ws.getRow(row).height = 14
				for (let c = cPort1; c <= cEnd; c++) ws.getCell(row, c).fill = slotFill
				row++
			}
			// Merge port columns across all slot rows for the label
			ws.mergeCells(blockStart, cPort1, blockStart + totalSlotRows - 1, cEnd)
			const cell = ws.getCell(blockStart, cPort1)
			cell.value = `${slot.type.replace(/-/g, ' ').toUpperCase()}${slot.label ? ': ' + slot.label : ''}`
			cell.font = { size: 8, italic: true, color: { argb: 'FF888888' } }
			// cell.alignment = { vertical: 'middle' }
			cell.fill = slotFill
			applyBlockBorder(ws, blockStart, row - 1, c1, cEnd)
		} else if (!slotRUs.has(ru)) {
			// Empty RU: 2 rows
			const blockStart = row
			ws.getCell(row, c1).value = ru
			// ws.getCell(row, c1).font = { size: 7, color: { argb: 'FFCCCCCC' } }
			ws.getCell(row, c1).font = { bold: true, size: 8 }
			ws.getCell(row, c1).alignment = { horizontal: 'center' }
			ws.getRow(row).height = 14
			row++
			ws.getRow(row).height = 14
			row++
			applyBlockBorder(ws, blockStart, row - 1, c1, cEnd)
		}
	}

	const bodyEndRow = row - 1

	// Medium rack outline
	applyRackOutline(ws, headerRow, bodyEndRow, c1, cEnd)

	// Header bottom separator
	const headerSep: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF999999' } }
	for (let c = c1; c <= cEnd; c++) {
		mergeBorder(ws.getCell(headerRow, c), { bottom: headerSep })
	}

	// RU column right separator
	const ruSep: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFAAAAAA' } }
	for (let r = headerRow; r <= bodyEndRow; r++) {
		mergeBorder(ws.getCell(r, c1), { right: ruSep })
	}
}

/** Write a reserved-but-unallocated port cell with the reservation type color and a dashed border */
function writeReservedCell(cell: ExcelJS.Cell, type: LocType) {
	const colors = LOC_TYPE_FILLS[type] ?? DEFAULT_FILL
	// cell.value = type
	cell.font = { size: 7, name: 'Consolas', italic: false, color: { argb: colors.text } }
	cell.alignment = { horizontal: 'center' }
	cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.bg } }
	// const side: Partial<ExcelJS.Border> = { style: 'dotted', color: { argb: colors.text } }
	// cell.border = { top: side, bottom: side, left: side, right: side }
	cell.border = portBorder()
}

/** Write a single port cell with location-type color */
function writePortCell(cell: ExcelJS.Cell, port: { label: string; locationType: string }) {
	const colors = LOC_TYPE_FILLS[port.locationType] ?? DEFAULT_FILL
	cell.value = port.label
	cell.font = { size: 7, name: 'Consolas', color: { argb: colors.text } }
	cell.alignment = { horizontal: 'center' }
	cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.bg } }
	cell.border = portBorder()
}

/** Light border for individual port cells */
function portBorder(): Partial<ExcelJS.Borders> {
	const side: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFDDDDDD' } }
	return { top: side, bottom: side, left: side, right: side }
}

/** Thin border around a block (panel, slot, or empty RU) */
function applyBlockBorder(ws: ExcelJS.Worksheet, rowStart: number, rowEnd: number, c1: number, cEnd: number) {
	const side: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFBBBBBB' } }
	for (let c = c1; c <= cEnd; c++) {
		mergeBorder(ws.getCell(rowStart, c), { top: side })
		mergeBorder(ws.getCell(rowEnd, c), { bottom: side })
	}
	for (let r = rowStart; r <= rowEnd; r++) {
		mergeBorder(ws.getCell(r, c1), { left: side })
		mergeBorder(ws.getCell(r, cEnd), { right: side })
	}
}

/** Medium border around the entire rack (header + body) */
function applyRackOutline(ws: ExcelJS.Worksheet, rowStart: number, rowEnd: number, c1: number, cEnd: number) {
	const side: Partial<ExcelJS.Border> = { style: 'medium', color: { argb: 'FF888888' } }
	for (let c = c1; c <= cEnd; c++) {
		mergeBorder(ws.getCell(rowStart, c), { top: side })
		mergeBorder(ws.getCell(rowEnd, c), { bottom: side })
	}
	for (let r = rowStart; r <= rowEnd; r++) {
		mergeBorder(ws.getCell(r, c1), { left: side })
		mergeBorder(ws.getCell(r, cEnd), { right: side })
	}
}

/** Merge border sides into a cell's existing border without overwriting other sides */
function mergeBorder(cell: ExcelJS.Cell, sides: Partial<ExcelJS.Borders>) {
	cell.border = { ...(cell.border ?? {}), ...sides }
}

function dateStr(): string {
	const d = new Date()
	return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}
