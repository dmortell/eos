import ExcelJS from 'exceljs'
import type { PatchConnection, CustomCableType } from './types'
import { getCableType } from './constants'

function dateStr() {
	const d = new Date()
	return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

interface ExportOptions {
	connections: PatchConnection[]
	racks: any[]
	devices: any[]
	customCableTypes: CustomCableType[]
	projectName: string
	floor: number
	room: string
}

function rackLabel(racks: any[], rackId: string): string {
	return racks.find((r: any) => r.id === rackId)?.label || ''
}

function deviceLabel(devices: any[], deviceId: string): string {
	const d = devices.find((d: any) => d.id === deviceId)
	return d?.label || d?.type || ''
}

function deviceUFace(devices: any[], deviceId: string, face: string): string {
	const d = devices.find((d: any) => d.id === deviceId)
	if (!d) return ''
	return `U${d.positionU} ${face}`
}

function fmtPort(devices: any[], deviceId: string, portIndex: number){
	if (portIndex <= 0) return ''
	// const d = devices.find((d: any) => d.id === deviceId)
	// const count = d?.portCount ?? 0
	// const padW = count >= 100 ? 3 : count >= 10 ? 2 : 1
	// return String(portIndex).padStart(padW, '0')
	return portIndex
}

/** Export patch schedule and BOM to Excel */
export async function exportPatchExcel(opts: ExportOptions) {
	const { connections, racks, devices, customCableTypes, projectName, floor, room } = opts
	const wb = new ExcelJS.Workbook()
	const filename = `Patching-${projectName || 'export'}-F${floor}R${room}-${dateStr()}.xlsx`

	// ── Sheet 1: Patch Schedule ──
	const ws = wb.addWorksheet('Patch Schedule')
	ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }

	const title = `Patch Schedule — ${projectName || 'Export'} — F${floor} Room ${room}`

	// Header row
	const headers = [
		'#', 'From Rack', 'From Device', 'From U/Face', 'From Port',
		'To Rack', 'To Device', 'To U/Face', 'To Port',
		'Cable Type', 'Length (m)', 'Status', 'Cord ID', 'Notes',
	]
	const headerRow = ws.addRow(headers)
	headerRow.font = { bold: true, size: 9 }
	headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
	headerRow.alignment = { horizontal: 'center', vertical: 'middle' }

	// Set column widths
	ws.columns = [
		{ width: 4 },   // #
		{ width: 10 },  // From Rack
		{ width: 20 },  // From Device
		{ width: 10 },  // From U/Face
		{ width: 6 },   // From Port
		{ width: 10 },  // To Rack
		{ width: 20 },  // To Device
		{ width: 10 },  // To U/Face
		{ width: 6 },   // To Port
		{ width: 10 },  // Cable Type
		{ width: 8 },   // Length
		{ width: 9 },   // Status
		{ width: 12 },  // Cord ID
		{ width: 20 },  // Notes
	]

	// Data rows
	connections.forEach((c, i) => {
		const ct = getCableType(c.cableType, customCableTypes)
		const row = ws.addRow([
			i + 1,
			rackLabel(racks, c.fromPortRef.rackId),
			deviceLabel(devices, c.fromPortRef.deviceId),
			deviceUFace(devices, c.fromPortRef.deviceId, c.fromPortRef.face),
			fmtPort(devices, c.fromPortRef.deviceId, c.fromPortRef.portIndex),
			rackLabel(racks, c.toPortRef.rackId),
			deviceLabel(devices, c.toPortRef.deviceId),
			deviceUFace(devices, c.toPortRef.deviceId, c.toPortRef.face),
			fmtPort(devices, c.toPortRef.deviceId, c.toPortRef.portIndex),
			ct.label,
			c.lengthMeters || '',
			c.status,
			c.cordId || '',
			c.notes || '',
		])
		row.font = { size: 9 }
		row.alignment = { vertical: 'middle' }

		// Color the status cell
		const statusCell = row.getCell(12)
		if (c.status === 'installed') {
			statusCell.font = { size: 9, color: { argb: 'FF16A34A' } }
		} else {
			statusCell.font = { size: 9, color: { argb: 'FFD97706' } }
		}
	})

	// Freeze header row + print titles (repeat row 1 on every printed page)
	ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 0, topLeftCell: 'A2', activeCell: 'A2' }]
	ws.pageSetup.printTitlesRow = '1:1'
	ws.headerFooter = {
		oddHeader: `&C&B${title}`,
		oddFooter: '&L&D&RPage &P / &N',
	}

	// ── Sheet 2: Bill of Materials ──
	const bom = wb.addWorksheet('Bill of Materials')
	bom.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }

	// Aggregate by cable type + length
	const bomMap = new Map<string, { type: string; label: string; length: number; count: number; status: string }>()
	for (const c of connections) {
		const ct = getCableType(c.cableType, customCableTypes)
		const key = `${c.cableType}:${c.lengthMeters}:${c.status}`
		const entry = bomMap.get(key)
		if (entry) {
			entry.count++
		} else {
			bomMap.set(key, { type: c.cableType, label: ct.label, length: c.lengthMeters, count: 1, status: c.status })
		}
	}

	const bomHeaders = ['Cable Type', 'Length (m)', 'Status', 'Quantity']
	const bomHeaderRow = bom.addRow(bomHeaders)
	bomHeaderRow.font = { bold: true, size: 10 }
	bomHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }

	bom.columns = [{ width: 14 }, { width: 10 }, { width: 10 }, { width: 10 }]

	// Sort BOM entries
	const bomEntries = [...bomMap.values()].sort((a, b) =>
		a.label.localeCompare(b.label) || a.length - b.length || a.status.localeCompare(b.status)
	)
	for (const entry of bomEntries) {
		const row = bom.addRow([entry.label, entry.length || '—', entry.status, entry.count])
		row.font = { size: 10 }
	}

	// Total row
	const totalRow = bom.addRow(['', '', 'Total', connections.length])
	totalRow.font = { bold: true, size: 10 }

	bom.views = [{ state: 'frozen', ySplit: 1, xSplit: 0, topLeftCell: 'A2', activeCell: 'A2' }]
	bom.pageSetup.printTitlesRow = '1:1'
	bom.headerFooter = {
		oddHeader: `&C&BBill of Materials — ${projectName || 'Export'} — F${floor} Room ${room}`,
		oddFooter: '&L&D&RPage &P / &N',
	}

	// ── Download ──
	const buffer = await wb.xlsx.writeBuffer()
	const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = filename
	a.click()
	URL.revokeObjectURL(url)
}
