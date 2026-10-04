// Phase 3.6 spreadsheets: the tables they write, and cord IDs coming back.
import { describe, it, expect } from 'vitest'
import { patchScheduleRows, panelLabelRows, importCordIds, cordsForSchedule, PATCH_HEAD } from './exports'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import type { Cord } from '../domain/types'
import type { Entity } from '../domain/drawing'
import { repatch, removeCord, makeCord } from '../domain/cords'

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

describe('patch changes in the schedule (backlog check, Dave)', () => {
	it('an add, a move and a removal each show in their group; moved / removed cords say where they were', () => {
		// both cords installed on site; then: C1 moved to switch port 5, C2 removed, a new cord P1:3 → SW1:3 added
		let ents: Entity[] = demoProject().map((e) => (e.type === 'cord' ? { ...(e as Cord), status: 'installed' as const } : e))
		const i0 = ix(ents), c1 = i0.get('C1') as Cord, c2 = i0.get('C2') as Cord
		const moved = repatch(i0, c1, 'b', { on: 'SW1', port: 5 }).cord!
		const removed = removeCord(c2)!
		const added = makeCord(i0, { on: 'P1', port: 3, face: 'front' }, { on: 'SW1', port: 3 }, { cableType: 'cat6a', colour: '#3b82f6' }).cord!
		ents = [...ents.filter((e) => e.id !== 'C1' && e.id !== 'C2'), moved, removed, added]
		const rows = patchScheduleRows(ix(ents)), col = (h: string) => PATCH_HEAD.indexOf(h)
		expect(rows.map((r) => r.status)).toEqual(['remove', 'change', 'add'])   // work order: pull, move, install
		const [rm, ch, ad] = rows.map((r) => r.cells)
		expect(rm[col('Status')]).toBe('Remove')
		expect(rm[col('Was To')]).toBe('A01 · Switch 1 : 2')           // where the removed cord was
		expect(ch[col('To Port')]).toBe(5)                              // the move: now at switch port 5 …
		expect(ch[col('Was To')]).toBe('A01 · Switch 1 : 1')           // … it was at port 1
		expect(ch[col('Was From')]).toBe('A01 · Panel 1 : 1 (front)')  // the end that stayed
		expect(ad[col('Status')]).toBe('Add')
		expect(ad[col('Was From')]).toBe('')                           // new: nowhere before
		expect(ad[col('To Port')]).toBe(3)
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
