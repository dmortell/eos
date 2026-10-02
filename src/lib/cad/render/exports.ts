// Phase 3.6 spreadsheets: the patch schedule (+ cord BOM) and the cord-ID import, panel labels for label printers,
// and the project BOM (+ rack BOM detail). Each has a PURE table builder (tested) and an `export…` that loads exceljs
// on demand and downloads the file.
import type { ProjectIndex } from '../domain/project'
import type { Cord, Device, Id, PortRef, Rack } from '../domain/types'
import type { CatalogProduct } from '$lib/catalog/types'
import { bom } from '../domain/reports'
import { rackBom } from '../domain/rackBom'
import { racksInOrder } from '../domain/devices'
import { naturalCompare } from '../domain/labels'
import { download, fileSafe } from './download'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const today = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}` }

// ── Patch schedule ────────────────────────────────────────────────────────────────────────────────────────────────

/** Work order: pull → re-route → install → reference. The export and the cord-ID import share this order. */
export const STATUS_ORDER: Cord['status'][] = ['remove', 'change', 'add', 'installed']
const STATUS_TITLE: Record<Cord['status'], string> = { remove: 'REMOVE - pull these cords', change: 'CHANGE - move these cords', add: 'ADD - install these cords', installed: 'INSTALLED - already in place (reference only)' }
const STATUS_BG: Record<Cord['status'], string> = { add: 'FFDBEAFE', change: 'FFFEF3C7', remove: 'FFFEE2E2', installed: 'FFDCFCE7' }
const STATUS_FG: Record<Cord['status'], string> = { add: 'FF2563EB', change: 'FFD97706', remove: 'FFDC2626', installed: 'FF16A34A' }

export const PATCH_HEAD = ['#', 'From Label', 'From Rack', 'From Device', 'From U/Face', 'From Port', 'To Label', 'To Rack', 'To Device', 'To U/Face', 'To Port', 'Cable Type', 'Length (m)', 'Cord ID', 'Status', 'Notes', 'Was From', 'Was To', 'Key']
const PATCH_WIDTHS = [4, 16, 10, 20, 10, 6, 16, 10, 20, 10, 6, 10, 8, 12, 9, 20, 24, 24, 14]

/** The cords of a room (or all), in the export's order: by status group, then From. */
export function cordsForSchedule(ix: ProjectIndex, spaceId?: Id): Cord[] {
	const inRoom = (r: PortRef) => { const d = ix.get(r.on); const rk = d?.type === 'device' ? (ix.get(d.rackId) as Rack | undefined) : undefined; return !spaceId || rk?.spaceId === spaceId }
	return ix.cords.filter((c) => inRoom(c.a) || inRoom(c.b))
		.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || naturalCompare(ix.portPlace(a.a), ix.portPlace(b.a)))
}

export function patchScheduleRows(ix: ProjectIndex, spaceId?: Id, typeLabel: (id: string) => string = (x) => x): { status: Cord['status']; cells: (string | number)[] }[] {
	const end = (r: PortRef) => {
		const d = ix.get(r.on) as Device | undefined
		return [ix.portLabel(r), ix.nameOf(d?.rackId), d?.name ?? '', d ? `U${d.u} ${r.face ?? ''}`.trim() : '', r.port]
	}
	const was = (r?: PortRef) => (r ? ix.portPlace(r) : '')
	return cordsForSchedule(ix, spaceId).map((c, i) => ({
		status: c.status,
		cells: [i + 1, ...end(c.a), ...end(c.b), typeLabel(c.cableType), c.lengthM || '', c.cordId ?? '', c.status[0].toUpperCase() + c.status.slice(1), c.notes ?? '', was(c.previous?.a), was(c.previous?.b), c.id],
	}))
}

export async function exportPatchSchedule(ix: ProjectIndex, projectName: string, room?: { id: Id; name: string }, typeLabel?: (id: string) => string): Promise<number> {
	const rows = patchScheduleRows(ix, room?.id, typeLabel)
	const ExcelJS = await import('exceljs')
	const wb = new ExcelJS.Workbook()
	const ws = wb.addWorksheet('Patch Schedule')
	ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
	const head = ws.addRow(PATCH_HEAD)
	head.font = { bold: true, size: 9 }
	head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
	PATCH_WIDTHS.forEach((w, i) => (ws.getColumn(i + 1).width = w))
	ws.getColumn(PATCH_HEAD.length).hidden = true   // Key: the cord's id, so returned files match back exactly
	const count = (s: Cord['status']) => rows.filter((r) => r.status === s).length
	const sum = ws.addRow([STATUS_ORDER.map((s) => `${count(s)} ${s}`).join('  ·  ')])
	ws.mergeCells(sum.number, 1, sum.number, PATCH_HEAD.length - 1)
	sum.font = { italic: true, size: 9, color: { argb: 'FF6B7280' } }
	for (const s of STATUS_ORDER) {
		const group = rows.filter((r) => r.status === s)
		if (!group.length) continue
		const sec = ws.addRow([`${STATUS_TITLE[s]}  (${group.length})`])
		ws.mergeCells(sec.number, 1, sec.number, PATCH_HEAD.length - 1)
		sec.font = { bold: true, size: 10, color: { argb: STATUS_FG[s] } }
		sec.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_BG[s] } }
		for (const r of group) {
			const row = ws.addRow(r.cells)
			row.font = { size: 9, ...(s === 'remove' ? { strike: true } : {}) }
			row.getCell(15).font = { size: 9, color: { argb: STATUS_FG[s] } }
		}
	}
	ws.views = [{ state: 'frozen', ySplit: 1 }]
	ws.headerFooter = { oddHeader: `&C&BPatch Schedule - ${projectName}${room ? ` - ${room.name}` : ''}`, oddFooter: '&L&D&RPage &P / &N' }

	// cords by type × length × status
	const b = wb.addWorksheet('Bill of Materials')
	const bh = b.addRow(['Cable Type', 'Length (m)', 'Status', 'Quantity'])
	bh.font = { bold: true, size: 10 }
	bh.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
	;[14, 10, 10, 10].forEach((w, i) => (b.getColumn(i + 1).width = w))
	const agg = new Map<string, { type: string; len: number | string; status: string; n: number }>()
	for (const r of rows) { const k = `${r.cells[11]}|${r.cells[12]}|${r.status}`; const e = agg.get(k); if (e) e.n++; else agg.set(k, { type: String(r.cells[11]), len: r.cells[12], status: r.status, n: 1 }) }
	for (const e of [...agg.values()].sort((x, y) => x.type.localeCompare(y.type) || Number(x.len) - Number(y.len))) b.addRow([e.type, e.len || '-', e.status, e.n])
	b.addRow(['', '', 'Total', rows.length]).font = { bold: true }
	download(await wb.xlsx.writeBuffer(), `Patching-${fileSafe(projectName)}${room ? `-${fileSafe(room.name)}` : ''}-${today()}.xlsx`, XLSX)
	return rows.length
}

/**
 * Cord IDs from a returned patch schedule (the vendor fills in "Cord ID"). Rows match by the hidden Key column (the
 * cord's id); a sheet without it (an old export, or Key deleted) falls back to "#" in the export's order — which is
 * only right if the cords haven't changed since. Returns cord id → cord ID.
 */
export async function importCordIds(file: File, ix: ProjectIndex, spaceId?: Id): Promise<{ ids: Map<Id, string>; byKey: boolean }> {
	const ExcelJS = await import('exceljs')
	const wb = new ExcelJS.Workbook()
	await wb.xlsx.load(await file.arrayBuffer())
	const ws = wb.getWorksheet('Patch Schedule') ?? wb.getWorksheet(1)
	if (!ws) throw new Error('No "Patch Schedule" sheet in that file')
	let cordCol = 14, keyCol = 0
	ws.getRow(1).eachCell((cell, col) => {
		const h = String(cell.value ?? '').trim().toLowerCase()
		if (h === 'cord id') cordCol = col
		if (h === 'key') keyCol = col
	})
	const ordered = cordsForSchedule(ix, spaceId), ids = new Map<Id, string>()
	ws.eachRow((row, n) => {
		if (n <= 1) return
		const v = String(row.getCell(cordCol).value ?? '').trim()
		if (!v || v === '—' || v === '-') return
		const key = keyCol ? String(row.getCell(keyCol).value ?? '').trim() : ''
		if (key && ix.get(key)?.type === 'cord') { ids.set(key, v); return }
		const idx = row.getCell(1).value
		if (!keyCol && typeof idx === 'number' && ordered[idx - 1]) ids.set(ordered[idx - 1].id, v)
	})
	return { ids, byKey: !!keyCol }
}

// ── Panel labels (for the label printer) ──────────────────────────────────────────────────────────────────────────

export const LABEL_HEAD = ['Room', 'Rack', 'Panel', 'U', 'Port', 'Label', 'Outlet']

/** Every panel port's label, panel by panel in fill order (room, rack in row order, top U down), ports 1…n. */
export function panelLabelRows(ix: ProjectIndex, spaceId?: Id): (string | number)[][] {
	const rooms = spaceId ? [spaceId] : [...new Set(ix.racks.map((r) => r.spaceId))].sort((a, b) => naturalCompare(ix.nameOf(a), ix.nameOf(b)))
	const out: (string | number)[][] = []
	for (const room of rooms) {
		const rank = new Map(racksInOrder(ix, room).map((r, i) => [r.id, i]))
		const panels = ix.devices.filter((d) => d.kind === 'panel' && rank.has(d.rackId))
			.sort((a, b) => rank.get(a.rackId)! - rank.get(b.rackId)! || b.u + b.heightU - (a.u + a.heightU))
		for (const d of panels) for (let n = 1; n <= d.portCount; n++) {
			const far = ix.farEnd({ on: d.id, port: n }), o = far ? ix.get(far.on) : undefined
			out.push([ix.nameOf(room), ix.nameOf(d.rackId), d.name, d.u, n, ix.portLabel({ on: d.id, port: n }), o?.type === 'outlet' ? o.label : ''])
		}
	}
	return out
}

export async function exportPanelLabels(ix: ProjectIndex, projectName: string, room?: { id: Id; name: string }): Promise<{ rows: number; panels: Id[] }> {
	const rows = panelLabelRows(ix, room?.id)
	const ExcelJS = await import('exceljs')
	const wb = new ExcelJS.Workbook()
	const ws = wb.addWorksheet('Panel labels')
	const head = ws.addRow(LABEL_HEAD)
	head.font = { bold: true, size: 10 }
	head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
	;[14, 12, 24, 5, 6, 22, 12].forEach((w, i) => (ws.getColumn(i + 1).width = w))
	for (const r of rows) ws.addRow(r)
	ws.views = [{ state: 'frozen', ySplit: 1 }]
	download(await wb.xlsx.writeBuffer(), `PanelLabels-${fileSafe(projectName)}${room ? `-${fileSafe(room.name)}` : ''}-${today()}.xlsx`, XLSX)
	const panels = ix.devices.filter((d) => d.kind === 'panel' && (!room || (ix.get(d.rackId) as Rack | undefined)?.spaceId === room.id)).map((d) => d.id)
	return { rows: rows.length, panels }
}

// ── BOM ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function exportBom(ix: ProjectIndex, projectName: string, catalog: CatalogProduct[]): Promise<number> {
	const lines = bom(ix, catalog), racks = rackBom(ix, catalog)
	const ExcelJS = await import('exceljs')
	const wb = new ExcelJS.Workbook()
	const ws = wb.addWorksheet('BOM')
	ws.addRow([`${projectName} - bill of materials (quantities, no prices)`]).font = { bold: true, size: 12 }
	const head = ws.addRow(['Category', 'Item', 'Unit', 'Qty'])
	head.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
	head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
	;[18, 60, 6, 8].forEach((w, i) => (ws.getColumn(i + 1).width = w))
	for (const l of lines) ws.addRow([l.category, l.item, l.unit, l.qty])
	ws.views = [{ state: 'frozen', ySplit: 2 }]
	const r = wb.addWorksheet('Rack BOM')
	const rh = r.addRow(['Group', 'SKU', 'Description', 'Role', 'Qty', 'Link'])
	rh.font = { bold: true, size: 10 }
	rh.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
	;[16, 20, 50, 28, 6, 30].forEach((w, i) => (r.getColumn(i + 1).width = w))
	for (const l of racks) r.addRow([l.group, l.sku, l.description, l.note ?? '', l.qty, l.url ?? ''])
	download(await wb.xlsx.writeBuffer(), `BOM-${fileSafe(projectName)}-${today()}.xlsx`, XLSX)
	return lines.length
}
