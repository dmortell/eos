// C2: the OUTLET SCHEDULE of a model — one row per outlet (label, ports, mount, usage, level, room, X/Y, layer,
// the patch panel it is allocated to (E8), its port labels) + a totals row, exported to Excel. The rows are
// pure (tested); exceljs loads on demand, like drawingListExport.ts.
import type { Model } from '../3dview/types'
import { isOutletEnt, portLabel } from './allocate'

export type OutletRow = { label: string; ports: number; mount: string; usage: string; level: string; room: string; x: number; y: number; layer: string; patch: string; portLabels: string }
const MOUNT: Record<string, string> = { 'outlet-box': 'Rosette / box', 'outlet-wall': 'Wall mount', 'outlet-floor': 'Floorbox' }

/** The model's outlets, sorted by label (natural order: 4A2 before 4A10). `allocated` = outlet id → patch location. */
export function outletRows(model: Model, allocated?: Map<string, string>): OutletRow[] {
	const layer = new Map((model.layers ?? []).map((l) => [l.id, l.name]))
	return (model.shapes ?? []).filter(isOutletEnt).map((e): OutletRow => {
		const ports = Math.max(1, parseInt(e.attrs?.PORTS ?? '1', 10) || 1), label = e.attrs?.LABEL ?? ''
		return {
			label, ports, mount: MOUNT[e.block ?? ''] ?? e.block ?? '', usage: e.attrs?.TYPE ?? '',
			level: e.fill && e.fill !== 'none' ? 'Low' : 'High', room: e.attrs?.NOTE ?? '',
			x: Math.round(e.a?.[0] ?? 0), y: Math.round(e.a?.[1] ?? 0), layer: layer.get(e.layer ?? '') ?? '',
			patch: allocated?.get(e.id) ?? '', portLabels: label ? Array.from({ length: ports }, (_, i) => portLabel(label, i + 1, ports)).join(', ') : '',
		}
	}).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
}

const COLS: { head: string; width: number; get: (r: OutletRow) => string | number }[] = [
	{ head: 'Label', width: 14, get: (r) => r.label },
	{ head: 'Ports', width: 7, get: (r) => r.ports },
	{ head: 'Mount', width: 14, get: (r) => r.mount },
	{ head: 'Usage', width: 12, get: (r) => r.usage },
	{ head: 'Level', width: 7, get: (r) => r.level },
	{ head: 'Room', width: 14, get: (r) => r.room },
	{ head: 'X (mm)', width: 10, get: (r) => r.x },
	{ head: 'Y (mm)', width: 10, get: (r) => r.y },
	{ head: 'Layer', width: 16, get: (r) => r.layer },
	{ head: 'Patch panel', width: 22, get: (r) => r.patch },
	{ head: 'Port labels', width: 30, get: (r) => r.portLabels },
]

export async function exportOutletSchedule(rows: OutletRow[], name: string): Promise<void> {
	const ExcelJS = await import('exceljs')
	const wb = new ExcelJS.Workbook()
	const ws = wb.addWorksheet('Outlets')
	const head = ws.addRow(COLS.map((c) => c.head))
	head.eachCell((cell) => {
		cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
		cell.alignment = { vertical: 'middle' }
	})
	COLS.forEach((c, i) => (ws.getColumn(i + 1).width = c.width))
	for (const r of rows) ws.addRow(COLS.map((c) => c.get(r)))
	const tot = ws.addRow([`${rows.length} outlets`, rows.reduce((s, r) => s + r.ports, 0), '', '', '', '', '', '', '', `${rows.filter((r) => r.patch).length} allocated`, ''])
	tot.font = { bold: true }
	tot.eachCell((cell) => (cell.border = { top: { style: 'thin' } }))
	ws.views = [{ state: 'frozen', ySplit: 1 }]
	const buf = await wb.xlsx.writeBuffer()
	const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
	const a = document.createElement('a')
	a.href = url; a.download = `Outlets_${name.replace(/[^\w-]+/g, '_') || 'model'}.xlsx`; a.click()
	URL.revokeObjectURL(url)
}
