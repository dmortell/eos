import { describe, it, expect } from 'vitest'
import { sheetRows, filterRows, sortRows, groupRows, renumber, modelUsage, missingModelFrames } from './drawingList'
import { newSheetDoc } from './mappers'
import type { PagesSheetDoc, Place } from './schema'

const places: Place[] = [
	{ id: 'b', name: 'Hibiya', kind: 'building', parentId: null, order: 0 },
	{ id: 'f', name: '33F', kind: 'floor', parentId: 'b', order: 0 },
]
const sheet = (id: string, over: Partial<PagesSheetDoc> = {}): PagesSheetDoc =>
	({ ...newSheetDoc({ pid: 'P', id, title: id, placeId: 'f', sortOrder: 0, user: 'u', now: '2026-09-24' }), ...over })
const frame = (seq: number, modelId?: string) => ({ id: `fr${seq}`, seq, x: 0, y: 0, w: 1, h: 1, modelId, direction: 'plan', scale: '1:100', clip: null, border: 'solid' }) as PagesSheetDoc['frames'][number]

describe('drawing list', () => {
	const sheets = [
		sheet('A', { drawingNumber: 'E-10', kind: 'plan', tags: ['issue1'] }),
		sheet('B', { drawingNumber: 'E-2', kind: 'detail', discipline: 'Elec', placeId: null }),
		sheet('C', { drawingNumber: '', kind: 'plan', tags: ['issue1', 'late'], status: 'archived' }),
	]
	const rows = sheetRows(sheets, places)
	it('rows carry the place path; filters by text, kind, tag and status', () => {
		expect(rows[0].placePath).toBe('Hibiya › 33F')
		expect(rows[1].placePath).toBe('')
		expect(filterRows(rows, { q: 'hibiya', status: 'active' }).map((r) => r.id)).toEqual(['A'])
		expect(filterRows(rows, { kind: 'plan' }).map((r) => r.id)).toEqual(['A', 'C'])
		expect(filterRows(rows, { tag: 'late' }).map((r) => r.id)).toEqual(['C'])
	})
	it('sorts naturally with blanks last; groups with the (none) group last; a row under each tag', () => {
		expect(sortRows(rows, 'number').map((r) => r.id)).toEqual(['B', 'A', 'C'])
		expect(sortRows(rows, 'number', -1).map((r) => r.id)).toEqual(['A', 'B', 'C'])
		expect(groupRows(rows, 'place').map((g) => g.label)).toEqual(['Hibiya › 33F', '(no place)'])
		expect(groupRows(rows, 'tag').map((g) => [g.label, g.rows.length])).toEqual([['issue1', 2], ['late', 1], ['(no tag)', 1]])
	})
	it('renumbers by pattern, padded or not', () => {
		expect(renumber(3, 7, 'E-{n:3}')).toEqual(['E-007', 'E-008', 'E-009'])
		expect(renumber(2, 1, 'EL-')).toEqual(['EL-1', 'EL-2'])
	})
	it('model usage per sheet (live sheets only) and frames with a missing model', () => {
		const s = [sheet('S1', { frames: [frame(1, 'm1'), frame(2, 'm1'), frame(3, 'gone')] }), sheet('S2', { status: 'archived', frames: [frame(1, 'm1')] })]
		expect(modelUsage(s).get('m1')).toEqual([{ sheetId: 'S1', sheetTitle: 'S1', frames: [1, 2] }])
		expect(missingModelFrames(s, [{ id: 'm1', name: 'm' }]).map((f) => [f.sheetId, f.seq])).toEqual([['S1', 3]])
		expect(missingModelFrames(s, [{ id: 'm1', name: 'm', archived: true }]).length).toBe(3)   // archived model → all three frames missing
	})
})
