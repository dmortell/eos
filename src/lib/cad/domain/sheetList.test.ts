// The sheet register (ported from Pages' drawingList.test.ts, on cad sheets).
import { describe, it, expect } from 'vitest'
import { sheetRows, filterRows, sortRows, groupRows, renumber } from './sheetList'
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
	it('renumbers by pattern, padded or not', () => {
		expect(renumber(3, 7, 'S{n:3}')).toEqual(['S007', 'S008', 'S009'])
		expect(renumber(2, 1, 'EL-')).toEqual(['EL-1', 'EL-2'])
	})
})
