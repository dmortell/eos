// The sheet register (ported from Pages' drawingList.test.ts, on cad sheets).
import { describe, it, expect } from 'vitest'
import { sheetRows, filterRows, sortRows, groupRows, revisionColumns, moveInPrintOrder, printOrder } from './sheetList'
import { renumberEntities } from './renumber'
import { ProjectIndex } from './project'
import { demoProject } from './fixtures'
import type { Sheet } from './drawing'

const sheet = (id: string, over: Partial<Sheet> = {}): Sheet => ({
	type: 'sheet', id, number: '', title: id, order: 0, paper: { size: 'A3', orientation: 'landscape', marginMm: 5 }, status: 'active',
	viewports: [{ id: 'V', view: { levelId: 'L33', spec: { kind: 'plan' } }, rect: { x: 0, y: 0, w: 10, h: 10 }, scale: 100, centre: { x: 0, y: 0 } }], ...over,
})

describe('sheet register', () => {
	const sheets = [
		sheet('A', { number: 'S10', kind: 'plan', tags: ['issue1'] }),
		sheet('B', { number: 'S2', kind: 'detail', discipline: 'Elec', viewports: [] }),
		sheet('C', { number: '', kind: 'plan', tags: ['issue1', 'late'], status: 'archived', revisions: [{ code: 'A', date: '2026-10-02' }] }),
	]
	const rows = sheetRows(new ProjectIndex(demoProject()), sheets)
	it('rows carry the place (the viewports’ levels), scale, size and revision; filters by text and status', () => {
		expect(rows[0]).toMatchObject({ place: '33F', scale: '1:100', size: 'A3 L', rev: '' })
		expect(rows[1].place).toBe('')
		expect(rows[2].rev).toBe('A')
		expect(filterRows(rows, { q: '33f', status: 'active' }).map((r) => r.id)).toEqual(['A'])
		expect(filterRows(rows, { q: 'late' }).map((r) => r.id)).toEqual(['C'])
	})
	it('sorts naturally with blanks last; groups with the (none) group last; a row under each tag', () => {
		expect(sortRows(rows, 'number').map((r) => r.id)).toEqual(['B', 'A', 'C'])
		expect(sortRows(rows, 'number', -1).map((r) => r.id)).toEqual(['A', 'B', 'C'])
		expect(groupRows(rows, 'place').map((g) => g.label)).toEqual(['33F', '(no place)'])
		expect(groupRows(rows, 'tag').map((g) => [g.label, g.rows.length])).toEqual([['issue1', 2], ['late', 1], ['(no tag)', 1]])
	})
	it('the register Excel gets a date column per revision, in the order first issued', () => {
		const rev = (code: string, date: string) => ({ code, date })
		const base = { id: '', order: '', number: '', title: '', place: '', kind: '', discipline: '', tags: [], status: 'active' as const, rev: '', size: '', scale: '', viewports: 0,
			category: '', categoryId: '', categoryAuto: true, categoryOrder: 0, level: '', levelIds: [], levelOrders: [], levelOrder: 0, room: '', roomIds: [] }
		const rows = [{ ...base, id: 'A', revisions: [rev('P1', '2026-01-10'), rev('P2', '2026-02-01')] }, { ...base, id: 'B', revisions: [rev('P2', '2026-02-01'), rev('C1', '2026-03-05')] }]
		const cols = revisionColumns(rows)
		expect(cols.map((c) => c.code)).toEqual(['P1', 'P2', 'C1'])
		expect(cols.map((c) => c.dateOf(rows[1]))).toEqual(['', '2026-02-01', '2026-03-05'])
	})
	it('sheets renumber with the shared Renumber: the number of the sheet number, in the order picked', () => {
		const s = (id: string, number: string) => ({ type: 'sheet', id, number, title: id, order: 0, status: 'active', paper: { size: 'A3', orientation: 'landscape', marginMm: 10 }, viewports: [] }) as Sheet
		const next = renumberEntities([s('X', 'S005'), s('Y', 'S002')], { start: 7 }) as Sheet[]
		expect(next.map((x) => [x.id, x.number])).toEqual([['X', 'S007'], ['Y', 'S008']])
	})
})

describe('print order (Dave, 2026-10-05)', () => {
	const ss = [sheet('a', { number: 'S1', order: 1 }), sheet('b', { number: 'S2', order: 2 }), sheet('c', { number: 'S3', order: 3 }), sheet('d', { number: 'S4', order: 4 })]
	const after = (moved: Sheet[]) => printOrder(ss.map((s) => moved.find((m) => m.id === s.id) ?? s)).map((s) => s.id).join('')
	it('the selected sheets move one place as a block; at the end they stop', () => {
		expect(after(moveInPrintOrder(ss, ['c', 'd'], -1))).toBe('acdb')
		expect(after(moveInPrintOrder(ss, ['a'], -1))).toBe('abcd')
		expect(after(moveInPrintOrder(ss, ['a', 'c'], 1))).toBe('badc')
	})
	it('the register shows each sheet\'s place, and sorts by it', () => {
		const rows = sheetRows(new ProjectIndex(demoProject()), ss.map((s) => ({ ...s, order: 10 - s.order })))
		expect(sortRows(rows, 'order').map((r) => r.id)).toEqual(['d', 'c', 'b', 'a'])
	})
})

describe('register columns from the sheets (sheets-organising slice 1)', () => {
	const L2 = { type: 'level' as const, id: 'L2', buildingId: 'B', number: 2, name: '2F', order: 2, elevationMm: 4000, heights: { slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2700, plenumMm: 800 } }
	const ix = new ProjectIndex([...demoProject(), L2])
	const vp = (levelId: string, spec: Sheet['viewports'][number]['view']['spec']) => ({ id: `V${levelId}${spec.kind}`, view: { levelId, spec }, rect: { x: 0, y: 0, w: 10, h: 10 }, scale: 100, centre: { x: 0, y: 0 } })
	const sheets = [
		sheet('P33', { number: 'P2', viewports: [vp('L33', { kind: 'plan' })] }),
		sheet('P2', { number: 'P1', viewports: [vp('L2', { kind: 'plan' })] }),
		sheet('RE', { number: 'RE1', viewports: [vp('L33', { kind: 'row', spaceId: 'SR-A', face: 'front' })] }),
		sheet('MIX', { number: 'G1', viewports: [vp('L33', { kind: 'plan' }), vp('L33', { kind: 'riser' })] }),
		sheet('OWN', { number: 'D1', kind: 'details', placeId: 'SR-A', viewports: [] }),
	]
	const rows = sheetRows(ix, sheets)
	const of = (id: string) => rows.find((r) => r.id === id)!
	it('derives the category from the viewports (a mix → General), else takes its own', () => {
		expect(of('P33')).toMatchObject({ category: 'Plans', categoryAuto: true })
		expect(of('RE').category).toBe('Rack elevations')
		expect(of('MIX').category).toBe('General')
		expect(of('OWN')).toMatchObject({ category: 'Details', categoryAuto: false })
	})
	it('level and room from the place, else the viewports; a riser view names no level', () => {
		expect(of('RE')).toMatchObject({ level: '33F', room: 'IDF-A' })
		expect(of('OWN')).toMatchObject({ level: '33F', room: 'IDF-A' })
		expect(of('MIX').levelIds).toEqual(['L33'])
	})
	it('sorts and groups levels in level order, categories in list order', () => {
		expect(sortRows(rows.filter((r) => r.levelIds.length), 'level').map((r) => r.id)).toEqual(['P2', 'OWN', 'MIX', 'P33', 'RE'])   // 2F first; within 33F by number
		expect(groupRows(rows, 'level').map((g) => g.label)).toEqual(['2F', '33F'])
		expect(groupRows(rows, 'category').map((g) => g.label)).toEqual(['General', 'Plans', 'Rack elevations', 'Details'])
	})
	it('chips: any pick within a chip, every chip', () => {
		expect(filterRows(rows, { cats: ['plans', 'details'] }).map((r) => r.id).sort()).toEqual(['OWN', 'P2', 'P33'])
		expect(filterRows(rows, { cats: ['plans', 'details'], levels: ['L33'] }).map((r) => r.id).sort()).toEqual(['OWN', 'P33'])
		expect(filterRows(rows, { rooms: ['SR-A'] }).map((r) => r.id).sort()).toEqual(['OWN', 'RE'])
	})
})
