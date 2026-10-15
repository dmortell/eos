// The outlet schedule as a spreadsheet (replaces Outlets' Excel export). `scheduleTable` is pure (tested);
// `exportOutletSchedule` loads exceljs on demand and downloads the file.
import type { ProjectIndex } from '../domain/project'
import type { Id } from '../domain/types'
import { outletSchedule, type OutletRow } from '../domain/reports'
import { fileSafe, saveFile } from './download'

interface Col { head: string; width: number; get: (r: OutletRow) => string | number }

const COLS: Col[] = [
	{ head: 'Level', width: 8, get: (r) => r.level },
	{ head: 'Zone', width: 10, get: (r) => r.zone },
	{ head: 'Room', width: 10, get: (r) => r.room },
	{ head: 'Outlet', width: 14, get: (r) => r.label },
	{ head: 'Usage', width: 10, get: (r) => r.usage },
	{ head: 'Tier', width: 6, get: (r) => (r.tier === 'high' ? 'High' : 'Low') },
	{ head: 'Mount', width: 8, get: (r) => r.mount },
	{ head: 'Height (FFL+)', width: 10, get: (r) => r.heightMm ?? '' },
	{ head: 'Ports', width: 6, get: (r) => r.ports.length },
	{ head: 'Port labels', width: 40, get: (r) => r.ports.map((p) => p.label).join('\n') },
	{ head: 'Cable', width: 10, get: (r) => [...new Set(r.ports.map((p) => p.cableType))].join(', ') },
	{ head: 'Server room', width: 12, get: (r) => [...new Set(r.ports.map((p) => p.serverRoom).filter(Boolean))].join(', ') },
	{ head: 'Patched to', width: 34, get: (r) => r.ports.map((p) => p.patchedTo).join('\n') },
	{ head: 'On plan', width: 7, get: (r) => (r.placed ? 'Yes' : '') },
	{ head: 'X (mm)', width: 9, get: (r) => r.x ?? '' },
	{ head: 'Y (mm)', width: 9, get: (r) => r.y ?? '' },
]

export function scheduleTable(ix: ProjectIndex, levelId?: Id): { head: string[]; widths: number[]; body: (string | number)[][]; totals: string } {
	const { rows, totals } = outletSchedule(ix, levelId)
	const usage = Object.entries(totals.byUsage).map(([k, n]) => `${k} ${n}`).join(', ')
	return {
		head: COLS.map((c) => c.head),
		widths: COLS.map((c) => c.width),
		body: rows.map((r) => COLS.map((c) => c.get(r))),
		totals: `${totals.outlets} outlets, ${totals.ports} ports${usage ? ` (${usage})` : ''}`,
	}
}

export async function exportOutletSchedule(ix: ProjectIndex, projectName: string, level?: { id: Id; name: string }): Promise<boolean> {
	const f = await outletScheduleFile(ix, projectName, level)
	return !!await saveFile(f.data, f.name, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', { what: 'Outlet schedule', scope: level?.name })
}
/** The outlet schedule workbook (the download's; attached to an issue, W21). */
export async function outletScheduleFile(ix: ProjectIndex, projectName: string, level?: { id: Id; name: string }): Promise<{ data: ArrayBuffer; name: string }> {
	const t = scheduleTable(ix, level?.id)
	const ExcelJS = await import('exceljs')
	const wb = new ExcelJS.Workbook()
	const ws = wb.addWorksheet('Outlet schedule')
	ws.addRow([`${projectName}${level ? ` — ${level.name}` : ''} — outlet schedule`]).font = { bold: true, size: 12 }
	ws.addRow([t.totals]).font = { italic: true, size: 10, color: { argb: 'FF555555' } }
	const head = ws.addRow(t.head)
	head.eachCell((cell) => {
		cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
	})
	t.widths.forEach((w, i) => (ws.getColumn(i + 1).width = w))
	for (const r of t.body) ws.addRow(r).alignment = { vertical: 'top', wrapText: true }
	ws.views = [{ state: 'frozen', ySplit: 3 }]
	return { data: (await wb.xlsx.writeBuffer()) as ArrayBuffer, name: `Outlets_${fileSafe(projectName)}${level ? `_${fileSafe(level.name)}` : ''}.xlsx` }
}
