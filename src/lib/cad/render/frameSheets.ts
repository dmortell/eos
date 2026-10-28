// FRAME LABEL SHEETS in Excel (backlog G097 / G131 / T050) — the Frames / Elevations export, from cad's racks: a
// worksheet per frame or one per room, each rack as RU rows (two Excel rows per U) × 24 port columns, every port its
// label, colored by the usage of the outlet it goes to; reserved ports in their usage's color; other devices as one
// merged block; racks side by side with their bottoms aligned; A3 landscape fitted to one page, footer = file name and
// page. `frameRacks` is the pure layout (tested in frameSheets.test.ts); `frameWorkbook` writes it with ExcelJS.
import type { Workbook, Worksheet, Cell, Border, Borders, Fill, PaperSize } from 'exceljs'
import type { ProjectIndex } from '../domain/project'
import type { Device, Id, ProjectSettings, Rack } from '../domain/types'
import { racksInOrder, portGrid, portSlot } from '../domain/devices'
import { fileSafe, saveFile } from './download'
import { sheetName } from './exports'

/** One port cell: its label; the usage of the outlet it reaches, or the usage it is reserved for (no outlet yet). */
export interface FrameCell { label: string; usage?: string; reserved?: boolean }
export type FrameBlock =
	/** A panel: its top U, height and port rows (24 cells a row, `null` = no port there). */
	| { kind: 'panel'; u: number; heightU: number; name: string; rows: (FrameCell | null)[][] }
	/** Any other device: one merged block over its Us. */
	| { kind: 'device'; u: number; heightU: number; text: string }
/** `cols` = port columns the rack's sheet needs: 24, or more for a panel the rack view lays out wider (a 72-port 1U = 2 x 36). */
export interface FrameRack { id: Id; name: string; heightU: number; cols: number; blocks: FrameBlock[] }
export interface FrameRoom { id: Id; name: string; level: string; racks: FrameRack[] }

const COLS = 24

/** A room's frames: its patch frames (`Rack.patchFrame`) if it marks any, else every rack holding a panel, in row
 *  order. Front-face devices win a U shared with a rear-only one; PDUs (0U) are left out. */
export function frameRacks(ix: ProjectIndex, spaceId: Id): FrameRoom {
	const sp = ix.get(spaceId) as { name?: string; levelId?: Id } | undefined
	const all = racksInOrder(ix, spaceId)
	const holdsPanel = (r: Rack) => ix.devices.some((d) => d.rackId === r.id && d.kind === 'panel')
	const racks = all.some((r) => r.patchFrame) ? all.filter((r) => r.patchFrame) : all.filter(holdsPanel)
	const reservedFor = (d: Device) => new Map((d.panel?.reservations ?? []).flatMap((rv) => rv.ports.map((p) => [p, rv.usage] as const)))
	return {
		id: spaceId, name: sp?.name ?? '', level: ix.nameOf(sp?.levelId),
		racks: racks.map((r) => {
			const front = (d: Device) => d.face !== 'rear' && d.mount !== 'rear'
			const devs = ix.devicesIn(r.id).filter((d) => d.kind !== 'pdu' && d.face !== 'none' && d.heightU > 0)
				.sort((a, b) => Number(front(b)) - Number(front(a)))
			const taken = new Set<number>(), blocks: FrameBlock[] = []
			for (const d of devs) {
				const us = Array.from({ length: d.heightU }, (_, i) => d.u + i)
				if (us.some((u) => taken.has(u) || u < 1 || u > r.heightU)) continue
				us.forEach((u) => taken.add(u))
				const top = d.u + d.heightU - 1
				if (d.kind !== 'panel' || !d.portCount) { blocks.push({ kind: 'device', u: top, heightU: d.heightU, text: `${d.kind.toUpperCase()}: ${d.name}` }); continue }
				const { rows: nRows, cols, sideCols } = portGrid(d), res = reservedFor(d)   // the rack view's layout, so a 72-port 1U panel is 2 rows, not 3 over the next U
				const rows: (FrameCell | null)[][] = Array.from({ length: nRows }, () => Array<FrameCell | null>(Math.max(COLS, cols + sideCols)).fill(null))
				for (let n = 1; n <= d.portCount; n++) {
					const [row, col] = portSlot(d, n)
					const far = ix.farEnd({ on: d.id, port: n }), o = far ? ix.get(far.on) : undefined
					const usage = o?.type === 'outlet' ? o.usage : undefined
					rows[row][col] = { label: ix.portLabel({ on: d.id, port: n }), ...(usage ? { usage } : res.has(n) ? { usage: res.get(n), reserved: true } : {}) }
				}
				blocks.push({ kind: 'panel', u: top, heightU: d.heightU, name: d.name, rows })
			}
			return { id: r.id, name: r.name, heightU: r.heightU, cols: Math.max(COLS, ...blocks.map((b) => (b.kind === 'panel' ? b.rows[0].length : 0))), blocks: blocks.sort((a, b) => b.u - a.u) }
		}),
	}
}

// ── The workbook ─────────────────────────────────────────────────────────────────────────────────────────────────

const RACK_GAP = 1, ROWS_PER_U = 2
const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase().padEnd(6, '0').slice(0, 6)}`
/** A usage color's cell fill (a light tint) and text (the color, darkened a little). */
function tones(hex: string | undefined): { bg: string; text: string } {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '')
	if (!m) return { bg: 'FFDBEAFE', text: 'FF2563EB' }
	const c = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16))
	const mix = (t: number) => c.map((v) => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0')).join('')
	const dark = c.map((v) => Math.round(v * 0.8).toString(16).padStart(2, '0')).join('')
	return { bg: argb(mix(0.82)), text: argb(dark) }
}
const thin = (rgb: string): Partial<Border> => ({ style: 'thin', color: { argb: rgb } })
const box = (side: Partial<Border>): Partial<Borders> => ({ top: side, bottom: side, left: side, right: side })
function edge(ws: Worksheet, r0: number, r1: number, c0: number, c1: number, side: Partial<Border>) {
	const add = (cell: Cell, s: Partial<Borders>) => (cell.border = { ...(cell.border ?? {}), ...s })
	for (let c = c0; c <= c1; c++) { add(ws.getCell(r0, c), { top: side }); add(ws.getCell(r1, c), { bottom: side }) }
	for (let r = r0; r <= r1; r++) { add(ws.getCell(r, c0), { left: side }); add(ws.getCell(r, c1), { right: side }) }
}

function writeRack(ws: Worksheet, room: FrameRoom, rack: FrameRack, row0: number, col0: number, colour: (usage?: string) => { bg: string; text: string }) {
	const cEnd = col0 + rack.cols, p1 = col0 + 1
	for (let c = col0; c <= cEnd; c++) ws.getColumn(c).width = c === col0 ? 4 : 12
	ws.mergeCells(row0, col0, row0, cEnd)
	Object.assign(ws.getCell(row0, col0), { value: `${room.level} ${room.name} — ${rack.name} (${rack.heightU}U)`, font: { bold: true, size: 14 } })
	const head = row0 + 2
	ws.getCell(head, col0).value = 'RU'
	for (let i = 0; i < rack.cols; i++) ws.getCell(head, p1 + i).value = i + 1
	for (let c = col0; c <= cEnd; c++) Object.assign(ws.getCell(head, c), { font: { bold: true, size: 7 }, alignment: { horizontal: 'center' } })
	// RU rows, top down: two Excel rows per U
	const rowOf = (u: number) => head + 1 + (rack.heightU - u) * ROWS_PER_U
	for (let u = rack.heightU; u >= 1; u--) {
		const r = rowOf(u)
		Object.assign(ws.getCell(r, col0), { value: u, font: { bold: true, size: 8 }, alignment: { horizontal: 'center' } })
		ws.getRow(r).height = 14; ws.getRow(r + 1).height = 14
	}
	const used = new Set<number>()
	for (const b of rack.blocks) {
		const r0 = rowOf(b.u), r1 = r0 + b.heightU * ROWS_PER_U - 1
		for (let u = b.u; u > b.u - b.heightU; u--) used.add(u)
		if (b.kind === 'device') {
			const fill: Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EAF6' } }
			for (let r = r0; r <= r1; r++) for (let c = p1; c <= cEnd; c++) ws.getCell(r, c).fill = fill
			ws.mergeCells(r0, p1, r1, cEnd)
			Object.assign(ws.getCell(r0, p1), { value: b.text, font: { size: 8, italic: true, color: { argb: 'FF888888' } }, fill })
		} else {
			b.rows.forEach((cells, i) => cells.forEach((cell, j) => {
				if (!cell) return
				const t = colour(cell.usage), xc = ws.getCell(r0 + i, p1 + j)
				if (!cell.reserved || cell.label) xc.value = cell.label
				xc.font = { size: 7, name: 'Consolas', color: { argb: t.text }, ...(cell.reserved ? { italic: true } : {}) }
				xc.alignment = { horizontal: 'center' }
				if (cell.usage) xc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: t.bg } }
				xc.border = cell.reserved ? box({ style: 'dotted', color: { argb: t.text } }) : box(thin('FFDDDDDD'))
			}))
		}
		edge(ws, r0, r1, col0, cEnd, thin('FFBBBBBB'))
	}
	for (let u = rack.heightU; u >= 1; u--) if (!used.has(u)) edge(ws, rowOf(u), rowOf(u) + 1, col0, cEnd, thin('FFBBBBBB'))
	const end = rowOf(1) + 1
	edge(ws, head, end, col0, cEnd, { style: 'medium', color: { argb: 'FF888888' } })
	for (let r = head; r <= end; r++) ws.getCell(r, col0).border = { ...(ws.getCell(r, col0).border ?? {}), right: thin('FFAAAAAA') }
}

/** The workbook: a worksheet per frame, or (`perRoom`) one per room with its frames side by side, bottoms aligned. */
export async function frameWorkbook(rooms: FrameRoom[], settings: ProjectSettings | undefined, o: { perRoom: boolean; fileName: string }): Promise<Workbook> {
	const ExcelJS = await import('exceljs')
	const wb = new ExcelJS.Workbook()
	const colour = (usage?: string) => (usage ? tones(settings?.usages.find((x) => x.id === usage)?.color) : { bg: 'FFFFFFFF', text: 'FF334155' })
	const names = new Set<string>()
	const sheet = (name: string) => {
		const ws = wb.addWorksheet(sheetName(name, names))   // legal, and unique ignoring case (a clash was built from the raw name)
		ws.pageSetup = { paperSize: 8 as PaperSize, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1,
			margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } }   // A3 landscape, one page
		ws.headerFooter = { oddFooter: `&L${o.fileName}&R&P / &N` }
		return ws
	}
	for (const room of rooms) {
		if (o.perRoom) {
			const ws = sheet(`${room.level} ${room.name}`), top = Math.max(0, ...room.racks.map((r) => r.heightU))
			let col = 1
			for (const r of room.racks) { writeRack(ws, room, r, 1 + (top - r.heightU) * ROWS_PER_U, col, colour); col += r.cols + 1 + RACK_GAP }
		} else for (const r of room.racks) writeRack(sheet(`${room.level} ${r.name}`), room, r, 1, 1, colour)
	}
	return wb
}

/** Frame label sheets for these server rooms, downloaded. */
export async function exportFrameSheets(ix: ProjectIndex, projectName: string, spaceIds: Id[], perRoom: boolean): Promise<{ racks: number } | null> {
	const rooms = spaceIds.map((id) => frameRacks(ix, id)).filter((r) => r.racks.length)
	const d = new Date(), date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
	const fileName = `Frames-${fileSafe(projectName)}${rooms.length === 1 ? `-${fileSafe(rooms[0].name)}` : ''}-${date}.xlsx`
	if (!rooms.length) return { racks: 0 }
	const st = ix.get('settings'), wb = await frameWorkbook(rooms, st?.type === 'settings' ? st : undefined, { perRoom, fileName })
	if (!await saveFile(await wb.xlsx.writeBuffer(), fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', { what: 'Frame labels', scope: rooms.length === 1 ? rooms[0].name : undefined })) return null
	return { racks: rooms.reduce((n, r) => n + r.racks.length, 0) }
}
