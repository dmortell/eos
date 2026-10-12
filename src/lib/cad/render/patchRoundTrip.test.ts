// The patch schedule as Excel and the vendor's cord IDs coming back (Review 2 Q62): export the workbook, fill the "Cord
// ID" column the way a vendor would (rows sorted, a sheet per room), import it, and every ID lands on the right cord.
import { describe, it, expect, vi } from 'vitest'
import ExcelJS from 'exceljs'
import { exportPatchSchedule, importCordIds, scheduleSheets, PATCH_HEAD } from './exports'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import type { Entity } from '../domain/drawing'

const saved = vi.hoisted(() => ({ data: null as BlobPart | null, name: '' }))
vi.mock('./download', async (orig) => ({ ...(await orig<typeof import('./download')>()), download: (data: BlobPart, name: string) => { saved.data = data; saved.name = name } }))

const roomB: Entity[] = [
	{ type: 'space', id: 'SR-B', levelId: 'L33', kind: 'server room', name: 'IDF-B', code: 'B', order: 2 },
	{ type: 'rack', id: 'RB', levelId: 'L33', spaceId: 'SR-B', order: 0, name: 'B01', kind: 'cabinet', heightU: 42, widthMm: 600, depthMm: 1000 },
	{ type: 'device', id: 'SWB', rackId: 'RB', name: 'Switch B', kind: 'switch', u: 20, heightU: 1, face: 'front', portCount: 24 },
	{ type: 'cord', id: 'CB', kind: 'patch', a: { on: 'SWB', port: 1 }, b: { on: 'SWB', port: 2 }, cableType: 'cat6a', colour: '#000', lengthM: 1, lengthLocked: false, status: 'add' },
] as Entity[]
const ix = new ProjectIndex([...demoProject(), ...roomB])


async function exported(perRoom: boolean): Promise<ExcelJS.Workbook> {
	saved.data = null
	const n = await exportPatchSchedule(ix, 'Proj', scheduleSheets(ix, ix.cords, perRoom))
	expect(n).toBe(3)
	const wb = new ExcelJS.Workbook()
	await wb.xlsx.load(saved.data as ArrayBuffer)
	return wb
}
const keyCol = PATCH_HEAD.indexOf('Key') + 1, idCol = PATCH_HEAD.indexOf('Cord ID') + 1
const asFile = async (wb: ExcelJS.Workbook) => new File([await wb.xlsx.writeBuffer()], 'back.xlsx')

/** Fill a Cord ID on every cord row, as the vendor would: "PC-<key>". Returns the expected map. */
function fill(wb: ExcelJS.Workbook): Map<string, string> {
	const want = new Map<string, string>()
	for (const ws of wb.worksheets) {
		if (ws.name === 'Bill of Materials') continue
		ws.eachRow((row, n) => {
			if (n <= 1) return
			const key = String(row.getCell(keyCol).value ?? '')
			if (!key) return                                     // the summary and group heading rows
			row.getCell(idCol).value = `PC-${key}`
			want.set(key, `PC-${key}`)
		})
	}
	return want
}

describe('patch schedule export → cord IDs import', { timeout: 30_000 }, () => {
	it('one sheet: the hidden Key column carries each cord’s id, and the IDs come back to the same cords', async () => {
		const wb = await exported(false)
		expect(wb.worksheets.map((w) => w.name)).toEqual(['Patch Schedule', 'Bill of Materials'])
		expect(wb.getWorksheet('Patch Schedule')!.getColumn(keyCol).hidden).toBe(true)
		const want = fill(wb)
		expect([...want.keys()].sort()).toEqual(['C1', 'C2', 'CB'])
		const r = await importCordIds(await asFile(wb), ix)
		expect(r.byKey).toBe(true)
		expect(Object.fromEntries(r.ids)).toEqual(Object.fromEntries(want))
	})
	it('a sheet per room: both rooms’ IDs come back, the Bill of Materials is not read as one', async () => {
		const wb = await exported(true)
		expect(wb.worksheets.map((w) => w.name)).toEqual(['IDF-A', 'IDF-B', 'Bill of Materials'])
		const want = fill(wb)
		const r = await importCordIds(await asFile(wb), ix)
		expect(Object.fromEntries(r.ids)).toEqual(Object.fromEntries(want))
	})
	it('rows the vendor left blank, or marked "-", stay without an ID', async () => {
		const wb = await exported(false)
		const want = fill(wb)
		const ws = wb.getWorksheet('Patch Schedule')!
		ws.eachRow((row, n) => { if (n > 1 && row.getCell(keyCol).value === 'C1') row.getCell(idCol).value = '' ; if (n > 1 && row.getCell(keyCol).value === 'C2') row.getCell(idCol).value = '-' })
		const r = await importCordIds(await asFile(wb), ix)
		expect([...r.ids.keys()]).toEqual(['CB'])
		expect(want.size).toBe(3)
	})
	it('a key for a cord that is gone (deleted since the export) is ignored, not applied to another', async () => {
		const wb = await exported(false)
		fill(wb)
		const without = new ProjectIndex([...demoProject(), ...roomB].filter((e) => e.id !== 'CB'))
		const r = await importCordIds(await asFile(wb), without)
		expect([...r.ids.keys()].sort()).toEqual(['C1', 'C2'])
	})
	it('a workbook with no schedule sheet is refused', async () => {
		const wb = new ExcelJS.Workbook()
		wb.addWorksheet('Bill of Materials')
		await expect(importCordIds(await asFile(wb), ix)).rejects.toThrow(/No patch schedule sheet/)
	})
})
