// Phase 3.6 spreadsheets: the tables they write, and cord IDs coming back.
import { describe, it, expect } from 'vitest'
import { patchScheduleRows, panelLabelRows, importCordIds, cordsForSchedule, PATCH_HEAD } from './exports'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import type { Cord } from '../domain/types'

const ix = (ents = demoProject()) => new ProjectIndex(ents)

describe('patch schedule', () => {
	it('rows in work order (remove → change → add → installed) with the label at each end and the key last', () => {
		const ents = demoProject().map((e) => (e.id === 'C2' ? { ...(e as Cord), status: 'remove' as const } : e))
		const rows = patchScheduleRows(ix(ents))
		expect(rows.map((r) => r.status)).toEqual(['remove', 'add'])
		const c1 = rows[1].cells
		expect(c1[0]).toBe(2)                       // the running "#"
		expect(c1[1]).toBe('33-001.A')              // From Label: the outlet port label the panel port carries
		expect(c1[PATCH_HEAD.length - 1]).toBe('C1') // Key = the cord's id
	})
})

// exceljs takes a few seconds to load the first time
describe('cord IDs back from the vendor', { timeout: 30000 }, () => {
	async function sheet(rows: (string | number)[][], head = PATCH_HEAD): Promise<File> {
		const ExcelJS = await import('exceljs')
		const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Patch Schedule')
		ws.addRow(head)
		for (const r of rows) ws.addRow(r)
		return new File([await wb.xlsx.writeBuffer()], 'back.xlsx')
	}
	const cordIdCol = PATCH_HEAD.indexOf('Cord ID'), keyCol = PATCH_HEAD.indexOf('Key')
	const row = (n: number, cordId: string, key: string) => { const r: (string | number)[] = PATCH_HEAD.map(() => ''); r[0] = n; r[cordIdCol] = cordId; r[keyCol] = key; return r }

	it('match by the hidden Key, whatever order the vendor sorted the rows into', async () => {
		const r = await importCordIds(await sheet([row(1, 'PC-0002', 'C2'), row(2, 'PC-0001', 'C1')]), ix())
		expect(r.byKey).toBe(true)
		expect([...r.ids]).toEqual([['C2', 'PC-0002'], ['C1', 'PC-0001']])
	})
	it('an old sheet without Key falls back to "#" in the export order', async () => {
		const head = PATCH_HEAD.slice(0, -1)
		const order = cordsForSchedule(ix()).map((c) => c.id)
		const r = await importCordIds(await sheet([row(1, 'X-1', '').slice(0, -1)], head), ix())
		expect(r.byKey).toBe(false)
		expect(r.ids.get(order[0])).toBe('X-1')
	})
})

describe('panel labels', () => {
	it('one row per panel port, with its label and outlet; unlabelled ports blank', () => {
		const rows = panelLabelRows(ix())
		expect(rows).toHaveLength(24)
		expect(rows[0]).toEqual(['IDF-A', 'A01', 'Panel 1', 40, 1, '33-001.A', '33-001'])
		expect(rows[9][5]).toBe('')
	})
})
