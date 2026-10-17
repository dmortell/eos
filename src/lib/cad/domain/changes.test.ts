import { describe, it, expect } from 'vitest'
import type { DesignChange, Sheet } from './drawing'
import { newChange, currentCycle, changesAbout, askedNames, sheetNotes, releasedOn, pendingChanges, changeMatches } from './changes'

const sheet = (id: string, extra: Partial<Sheet> = {}): Sheet => ({ type: 'sheet', id, number: id, title: id, order: 0, paper: { size: 'A3', orientation: 'landscape', marginMm: 10 }, viewports: [], status: 'active', ...extra })

describe('design log changes', () => {
	it('are numbered on within the current round', () => {
		const a = newChange([], 'a', { what: ' Move outlets ', links: ['O1'], date: '2026-10-17', at: 1 })
		expect(a).toMatchObject({ type: 'change', cycle: 1, n: 1, what: 'Move outlets', status: 'open', links: ['O1'] })
		const b = newChange([a], 'b', { what: 'Add a rack' })
		expect(b.n).toBe(2)
		const later = { ...a, id: 'c', cycle: 2, n: 1 }
		expect(currentCycle([a, b, later])).toBe(2)
		expect(newChange([a, b, later], 'd', { what: 'x' })).toMatchObject({ cycle: 2, n: 2 })
	})
	it('are found by the items they name, newest first; asked-by names most used first', () => {
		const cs: DesignChange[] = [
			newChange([], 'a', { what: 'one', links: ['O1'], asked: 'Client' }),
			{ ...newChange([], 'b', { what: 'two', links: ['O1', 'R1'], asked: 'Site' }), n: 2 },
			{ ...newChange([], 'c', { what: 'three', links: ['R2'], asked: 'Client' }), n: 3 },
		]
		expect(changesAbout(cs, ['O1']).map((c) => c.id)).toEqual(['b', 'a'])
		expect(askedNames(cs)).toEqual(['Client', 'Site'])
		expect(changeMatches(cs[1], 'sit')).toBe(true)
		expect(changeMatches(cs[1], 'zzz')).toBe(false)
	})
	it('a sheet’s notes: its own and the changes pending on it; a release records them — done once every linked sheet had them', () => {
		const s1 = sheet('S1', { changes: [{ id: 'k', date: '2026-10-01', text: 'Old note' }] }), s2 = sheet('S2')
		const c = { ...newChange([], 'c', { what: 'Move rack', links: ['S1', 'S2', 'R1'], asked: 'Client', date: '2026-10-17' }), n: 3 }
		expect(sheetNotes(s1, [c]).map((x) => x.text)).toEqual(['Old note', '3. Move rack'])
		const isSheet = (id: string) => id.startsWith('S')
		const [after1] = releasedOn([c], 'S1', 'B', isSheet)
		expect(after1).toMatchObject({ status: 'open', released: [{ sheetId: 'S1', code: 'B' }] })
		expect(pendingChanges(s1, [after1])).toEqual([])
		expect(pendingChanges(s2, [after1]).map((x) => x.id)).toEqual(['c'])
		const [after2] = releasedOn([after1], 'S2', 'A', isSheet)
		expect(after2.status).toBe('done')
		expect(sheetNotes(s2, [{ ...c, status: 'rejected' }])).toEqual([])
	})
})
