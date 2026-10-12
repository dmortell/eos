// Phase 3.6 spreadsheets: the patch schedule (+ cord BOM) and the cord-ID import, panel labels for label printers,
// the port map for VLAN assignment, and the project BOM (+ rack BOM detail). Each has a PURE table builder (tested) and an `export…` that loads exceljs
// on demand and downloads the file.
import type { ProjectIndex } from '../domain/project'
import type { Cord, Device, Id, PortRef, Rack } from '../domain/types'
import type { CatalogProduct } from '$lib/catalog/types'
import { bom, cordBom } from '../domain/reports'
import { replacedText } from '../domain/cords'
import type { Route } from '../domain/routing'
import { rackBom, type RackBomLine } from '../domain/rackBom'
import { panelsInFillOrder } from '../domain/devices'
import { naturalCompare } from '../domain/labels'
import { download, fileSafe } from './download'
import { scheduleTotals, type CableRow } from '../domain/cableSchedule'
import { portMapRows } from '../domain/portMap'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const today = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}` }

// ── Patch schedule ────────────────────────────────────────────────────────────────────────────────────────────────

/** Work order: pull → re-route → install → reference. The export and the cord-ID import share this order. */
export const STATUS_ORDER: Cord['status'][] = ['remove', 'replace', 'change', 'add', 'installed']
export const STATUS_TITLE: Record<Cord['status'], string> = { remove: 'REMOVE - pull these cords', replace: 'REPLACE - swap these cords for the type / colour / length shown (same ends)', change: 'CHANGE - move these cords', add: 'ADD - install these cords', installed: 'INSTALLED - already in place (reference only)' }
const STATUS_BG: Record<Cord['status'], string> = { add: 'FFDBEAFE', replace: 'FFF3E8FF', change: 'FFFEF3C7', remove: 'FFFEE2E2', installed: 'FFDCFCE7' }
export const STATUS_FG: Record<Cord['status'], string> = { add: 'FF2563EB', replace: 'FF9333EA', change: 'FFD97706', remove: 'FFDC2626', installed: 'FF16A34A' }

/** Each end: device, label, then where it is — rack, U, face, port (Dave 2026-10-11). */
export const PATCH_HEAD = ['#', 'From Device', 'From Label', 'From Rack', 'From U', 'From Face', 'From Port', 'To Device', 'To Label', 'To Rack', 'To U', 'To Face', 'To Port', 'Cable Type', 'Length (m)', 'Cord ID', 'Status', 'Notes', 'Was From', 'Was To', 'Key']
const PATCH_WIDTHS = [4, 20, 16, 10, 5, 6, 6, 20, 16, 10, 5, 6, 6, 10, 8, 12, 9, 20, 24, 24, 14]

/** The server room a cord is in (a cord stays in one room): its From end's rack's room. */
export function cordRoom(ix: ProjectIndex, c: Cord): Id | undefined {
	const room = (r: PortRef) => { const d = ix.get(r.on); const rk = d?.type === 'device' ? (ix.get(d.rackId) as Rack | undefined) : undefined; return rk?.spaceId }
	return room(c.a) ?? room(c.b)
}

/** The order inside each status group (the export dialog): From label (default, D7 review 2026-10-11), From place
 *  (rack · U · port), To label, or cord ID. Blanks go last; ties fall back to the From place. */
export type ScheduleSort = 'fromLabel' | 'fromPlace' | 'toLabel' | 'cordId'
export const SCHEDULE_SORTS: [ScheduleSort, string][] = [['fromLabel', 'From label'], ['fromPlace', 'From rack / U / port'], ['toLabel', 'To label'], ['cordId', 'Cord ID']]

/** Cords in the export's order: by status group, then `by`. */
export function orderForSchedule(ix: ProjectIndex, cords: Cord[], by: ScheduleSort = 'fromLabel'): Cord[] {
	const key = (c: Cord) => (by === 'fromLabel' ? ix.portLabel(c.a) : by === 'toLabel' ? ix.portLabel(c.b) : by === 'cordId' ? (c.cordId ?? '') : '')
	const keys = new Map(cords.map((c) => [c.id, key(c)]))
	const k = (c: Cord) => keys.get(c.id) ?? ''
	return [...cords].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || +!k(a) - +!k(b) || naturalCompare(k(a), k(b)) || naturalCompare(ix.portPlace(a.a), ix.portPlace(b.a)))
}

/** The cords of a room (or all), in the export's order. */
export function cordsForSchedule(ix: ProjectIndex, spaceId?: Id, by?: ScheduleSort): Cord[] {
	const inRoom = (r: PortRef) => { const d = ix.get(r.on); const rk = d?.type === 'device' ? (ix.get(d.rackId) as Rack | undefined) : undefined; return !spaceId || rk?.spaceId === spaceId }
	return orderForSchedule(ix, ix.cords.filter((c) => inRoom(c.a) || inRoom(c.b)), by)
}

/** One worksheet of the patch schedule: a room's cords (or a selection's). */
export interface ScheduleSheet { name: string; cords: Cord[] }

/** The worksheets: a sheet per room (rooms A → Z; D4, Dave 2026-10-11), or one sheet for them all, each in the
 *  export's order. */
export function scheduleSheets(ix: ProjectIndex, cords: Cord[], perRoom: boolean, name = 'Patch Schedule', by?: ScheduleSort): ScheduleSheet[] {
	if (!perRoom) return [{ name, cords: orderForSchedule(ix, cords, by) }]
	const rooms = new Map<Id | undefined, Cord[]>()
	for (const c of cords) { const r = cordRoom(ix, c); rooms.set(r, [...(rooms.get(r) ?? []), c]) }
	return [...rooms].map(([r, cs]) => ({ name: r ? ix.nameOf(r) : 'No room', cords: orderForSchedule(ix, cs, by) })).sort((a, b) => naturalCompare(a.name, b.name))
}

/** A worksheet name Excel accepts: ≤ 31 characters, none of : \ / ? * [ ], unique in the book. */
export function sheetName(name: string, taken: Set<string>): string {
	const base = name.replace(/[:\\/?*[\]]/g, '-').slice(0, 31).trim() || 'Sheet'
	let n = base
	for (let i = 2; taken.has(n.toLowerCase()); i++) n = `${base.slice(0, 31 - String(i).length - 1)} ${i}`
	taken.add(n.toLowerCase())
	return n
}

export function patchScheduleRows(ix: ProjectIndex, cords: Cord[] = cordsForSchedule(ix), typeLabel: (id: string) => string = (x) => x): { status: Cord['status']; cells: (string | number)[] }[] {
	const end = (r: PortRef) => {
		const d = ix.get(r.on) as Device | undefined
		return [d?.name ?? '', ix.portLabel(r), ix.nameOf(d?.rackId), d?.u ?? '', r.face ?? '', r.port]
	}
	const was = (r?: PortRef) => (r ? ix.portPlace(r) : '')
	return cords.map((c, i) => ({
		status: c.status,
		cells: [i + 1, ...end(c.a), ...end(c.b), typeLabel(c.cableType), c.lengthM || '', c.cordId ?? '', c.status[0].toUpperCase() + c.status.slice(1), c.notes ?? '', ...(c.status === 'replace' ? [replacedText(c, typeLabel), ''] : [was(c.previous?.a), was(c.previous?.b)]), c.id],
	}))
}

/** The patch schedule as Excel: a worksheet per `sheets` entry (a room, or one for a selection), each grouped in work
 *  order, plus the cord BOM over them all. `tag` names the file ("33IDF2", "changes"). Returns the cords written. */
export async function exportPatchSchedule(ix: ProjectIndex, projectName: string, sheets: ScheduleSheet[], typeLabel?: (id: string) => string, tag?: string): Promise<number> {
	const ExcelJS = await import('exceljs')
	const wb = new ExcelJS.Workbook(), taken = new Set<string>(['bill of materials'])
	const all: Cord[] = []
	for (const s of sheets) {
		if (!s.cords.length) continue
		all.push(...s.cords)
		addPatchSheet(wb.addWorksheet(sheetName(s.name, taken)), patchScheduleRows(ix, s.cords, typeLabel), `Patch Schedule - ${projectName}${sheets.length > 1 || s.name !== 'Patch Schedule' ? ` - ${s.name}` : ''}`)
	}

	// cords by type × length × status
	const b = wb.addWorksheet('Bill of Materials')
	const bh = b.addRow(['Cable Type', 'Length (m)', 'Status', 'Quantity'])
	bh.font = { bold: true, size: 10 }
	bh.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
	;[14, 10, 10, 10].forEach((w, i) => (b.getColumn(i + 1).width = w))
	for (const l of cordBom(all, typeLabel))
		for (const s of STATUS_ORDER) if (l.n[s]) b.addRow([l.type, l.lengthM || '-', s, l.n[s]])
	b.addRow(['', '', 'Total', all.length]).font = { bold: true }
	download(await wb.xlsx.writeBuffer(), `Patching-${fileSafe(projectName)}${tag ? `-${fileSafe(tag)}` : ''}-${today()}.xlsx`, XLSX)
	return all.length
}

function addPatchSheet(ws: import('exceljs').Worksheet, rows: { status: Cord['status']; cells: (string | number)[] }[], title: string) {
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
			row.getCell(PATCH_HEAD.indexOf('Status') + 1).font = { size: 9, color: { argb: STATUS_FG[s] } }
		}
	}
	ws.views = [{ state: 'frozen', ySplit: 1 }]
	ws.headerFooter = { oddHeader: `&C&B${title}`, oddFooter: '&L&D&RPage &P / &N' }
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
	// every schedule sheet (a sheet per room since 2026-10-11) — the ones whose header has a Cord ID column
	const sheets = wb.worksheets.filter((w) => w.name !== 'Bill of Materials')
	if (!sheets.length) throw new Error('No patch schedule sheet in that file')
	const ordered = cordsForSchedule(ix, spaceId, 'fromPlace'), ids = new Map<Id, string>()   // old exports were in place order
	let byKey = false
	for (const ws of sheets) {
		let cordCol = PATCH_HEAD.indexOf('Cord ID') + 1, keyCol = 0
		ws.getRow(1).eachCell((cell, col) => {
			const h = String(cell.value ?? '').trim().toLowerCase()
			if (h === 'cord id') cordCol = col
			if (h === 'key') keyCol = col
		})
		if (keyCol) byKey = true
		ws.eachRow((row, n) => {
			if (n <= 1) return
			const v = String(row.getCell(cordCol).value ?? '').trim()
			if (!v || v === '—' || v === '-') return
			const key = keyCol ? String(row.getCell(keyCol).value ?? '').trim() : ''
			if (key && ix.get(key)?.type === 'cord') { ids.set(key, v); return }
			// an old single-sheet export without Key: "#" in the export's order
			const idx = row.getCell(1).value
			if (!keyCol && sheets.length === 1 && typeof idx === 'number' && ordered[idx - 1]) ids.set(ordered[idx - 1].id, v)
		})
	}
	return { ids, byKey }
}

// ── Panel labels (for the label printer) ──────────────────────────────────────────────────────────────────────────

export const LABEL_HEAD = ['Room', 'Rack', 'Panel', 'U', 'Port', 'Label', 'Outlet']

/** Every panel port's label, panel by panel in fill order (room, rack in row order, top U down), ports 1…n. */
export function panelLabelRows(ix: ProjectIndex, spaceId?: Id): (string | number)[][] {
	const rooms = spaceId ? [spaceId] : [...new Set(ix.racks.map((r) => r.spaceId))].sort((a, b) => naturalCompare(ix.nameOf(a), ix.nameOf(b)))
	const out: (string | number)[][] = []
	for (const room of rooms) {
		for (const d of panelsInFillOrder(ix, room)) for (let n = 1; n <= d.portCount; n++) {
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

// ── Port map (VLAN assignment) ────────────────────────────────────────────────────────────────────────────────────

export const PORTMAP_HEAD = ['Room', 'Rack', 'U', 'Port', 'Device', 'Port Label', 'Outlet', 'Outlet Location', 'Patched To', 'Far End', 'Cord ID', 'Cord Status', 'VLAN', 'Notes']

/** The port map (domain/portMap.ts) as Excel for the network engineers: every port of the chosen panels / switches,
 *  a heading row per device, an empty VLAN column (highlighted) to fill in. Returns the ports written. */
export async function exportPortMap(ix: ProjectIndex, projectName: string, deviceIds: Id[]): Promise<number> {
	const rows = portMapRows(ix, deviceIds)
	const ExcelJS = await import('exceljs')
	const wb = new ExcelJS.Workbook()
	const ws = wb.addWorksheet('Port map')
	ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
	const head = ws.addRow(PORTMAP_HEAD)
	head.font = { bold: true, size: 10 }
	head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
	;[12, 10, 5, 6, 22, 16, 14, 18, 26, 26, 12, 10, 10, 20].forEach((w, i) => (ws.getColumn(i + 1).width = w))
	const vlan = PORTMAP_HEAD.indexOf('VLAN') + 1
	let dev = ''
	for (const r of rows) {
		if (r.deviceId !== dev) {
			dev = r.deviceId
			const h = ws.addRow([`${r.device} — ${r.rack} U${r.u}${r.room ? ` · ${r.room}` : ''}`])
			ws.mergeCells(h.number, 1, h.number, PORTMAP_HEAD.length)
			h.font = { bold: true, size: 10 }
			h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
		}
		const row = ws.addRow([r.room, r.rack, r.u, r.port, r.device, r.label, r.outlet, r.outletAt, r.patchedTo, r.farEnd, r.cordId, r.cordStatus, '', ''])
		row.font = { size: 9, ...(r.outlet || r.patchedTo ? {} : { color: { argb: 'FF9CA3AF' } }) }
		row.getCell(vlan).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } }
	}
	ws.views = [{ state: 'frozen', ySplit: 1 }]
	ws.headerFooter = { oddHeader: `&C&BPort map - ${projectName}`, oddFooter: '&L&D&RPage &P / &N' }
	download(await wb.xlsx.writeBuffer(), `PortMap-${fileSafe(projectName)}-${today()}.xlsx`, XLSX)
	return rows.length
}

// ── BOM ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** What the BOM workbook holds (the BOM dialog's settings): the materials sheet, and the rack BOM all together or
 *  one block per row (`rows` = [row id | null, its heading]). */
export interface BomExport { materials: boolean; rack: 'consolidated' | 'byRow' | 'none'; rows?: [string | null, string][] }

export async function exportBom(ix: ProjectIndex, projectName: string, catalog: CatalogProduct[], routes?: Map<string, Route>, o: BomExport = { materials: true, rack: 'consolidated' }): Promise<number> {
	const lines = o.materials ? bom(ix, catalog, routes) : []
	const ExcelJS = await import('exceljs')
	const wb = new ExcelJS.Workbook()
	if (o.materials) {
		const ws = wb.addWorksheet('BOM')
		ws.addRow([`${projectName} - bill of materials (material, quantities)`]).font = { bold: true, size: 12 }
		const head = ws.addRow(['Category', 'Item', 'Unit', 'Qty', 'Note'])
		head.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
		head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
		;[18, 60, 6, 8, 28].forEach((w, i) => (ws.getColumn(i + 1).width = w))
		for (const l of lines) ws.addRow([l.category, l.item, l.unit, l.qty, l.note ?? ''])
		ws.views = [{ state: 'frozen', ySplit: 2 }]
	}
	let rackLines = 0
	if (o.rack !== 'none') {
		const r = wb.addWorksheet('Rack BOM')
		const rh = r.addRow(['Group', 'SKU', 'Description', 'Role', 'Qty', 'Link'])
		rh.font = { bold: true, size: 10 }
		rh.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
		;[16, 20, 50, 28, 6, 30].forEach((w, i) => (r.getColumn(i + 1).width = w))
		const blocks: [string | null, RackBomLine[]][] = o.rack === 'byRow' ? (o.rows ?? []).map(([id, name]) => [name, rackBom(ix, catalog, { row: id })]) : [[null, rackBom(ix, catalog)]]
		for (const [name, ls] of blocks) {
			if (!ls.length) continue
			if (name) r.addRow([name]).font = { bold: true, size: 11 }
			for (const l of ls) r.addRow([l.group, l.sku, l.description, l.note ?? '', l.qty, l.url ?? ''])
			rackLines += ls.length
		}
	}
	download(await wb.xlsx.writeBuffer(), `BOM-${fileSafe(projectName)}-${today()}.xlsx`, XLSX)
	return lines.length + rackLines
}

// ── Cable schedule ────────────────────────────────────────────────────────────────────────────────────────────────

/** The cable schedule (domain/cableSchedule.ts) as Excel: one row per cable, the 90 m ones and those with no route
 *  marked, totals at the foot. */
export async function exportCableSchedule(rows: CableRow[], projectName: string): Promise<void> {
	const ExcelJS = await import('exceljs')
	const wb = new ExcelJS.Workbook()
	const ws = wb.addWorksheet('Cable schedule')
	ws.addRow([`${projectName} - cable schedule`]).font = { bold: true, size: 12 }
	const head = ws.addRow(['Label', 'Kind', 'From', 'To', 'Cable', 'Route (m)', 'Slack (m)', 'Length (m)', 'Over 90 m', 'Note'])
	head.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
	head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
	;[16, 11, 32, 32, 10, 10, 9, 10, 9, 36].forEach((w, i) => (ws.getColumn(i + 1).width = w))
	for (const r of rows) {
		const row = ws.addRow([r.label, r.kind, r.from, r.to, r.type, r.routeM ?? '', r.slackM || '', r.lengthM ?? '', r.over90 ? 'YES' : '', r.problem ? `no route: ${r.problem}` : r.handSet ? 'length set by hand' : ''])
		if (r.over90 || r.lengthM == null) row.font = { color: { argb: 'FFB91C1C' } }
	}
	const t = scheduleTotals(rows)
	ws.addRow([])
	ws.addRow([`${t.links} cables · ${t.metres} m installed (routed cables)${t.unrouted ? ` · ${t.unrouted} without a route` : ''}${t.over90 ? ` · ${t.over90} over 90 m` : ''}`]).font = { bold: true }
	ws.views = [{ state: 'frozen', ySplit: 2 }]
	download(await wb.xlsx.writeBuffer(), `Cables-${fileSafe(projectName)}-${today()}.xlsx`, XLSX)
}
