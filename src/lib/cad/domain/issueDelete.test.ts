// Deleting the newest release / voiding older ones (backlog 58): the pure part.
import { describe, it, expect } from 'vitest'
import { cantDeleteRelease, unreleaseSheets } from './issue'
import type { DesignChange, Issue, Sheet } from './drawing'

const sheet = (id: string, revisions?: Sheet['revisions'], changes?: Sheet['changes']): Sheet => ({
	type: 'sheet', id, number: id, title: id, order: 0, paper: { size: 'A3', orientation: 'landscape', marginMm: 5 }, viewports: [], status: 'active',
	...(revisions ? { revisions } : {}), ...(changes ? { changes } : {}),
})
const issue = (id: string, number: number, sheets: Issue['sheets']): Issue => ({ type: 'issue', id, number, name: `R${number}`, purpose: 'For comment', date: '2026-11-0' + number, sheets })
const row = (sheetId: string, rev: string, changed = true) => ({ sheetId, number: sheetId, title: sheetId, rev, size: 'A3', changed })

describe('deleting a release (backlog 58)', () => {
	const r1 = issue('i1', 1, [row('S1', 'A'), row('S2', 'A')])
	const r2 = issue('i2', 2, [row('S1', 'B'), row('S2', 'A', false)])
	const s1 = sheet('S1', [{ code: 'A', date: 'd', issueId: 'i1' }, { code: 'B', date: 'd', issueId: 'i2', changes: [{ id: 'n1', date: 'd', text: 'moved a rack' }, { id: 'c1', date: 'd', text: '1. log change' }] }], [{ id: 'n2', date: 'd', text: 'since' }])
	const s2 = sheet('S2', [{ code: 'A', date: 'd', issueId: 'i1' }])
	const of = (id: string) => ({ S1: s1, S2: s2 } as Record<string, Sheet>)[id]

	it('only the newest can be deleted', () => {
		expect(cantDeleteRelease(r2, [r1, r2], of)).toBeNull()
		expect(cantDeleteRelease(r1, [r1, r2], of)).toMatch(/newest/)
	})
	it('its new revisions come off; the sheet’s own notes go back to pending, the log’s become pending again', () => {
		const log: DesignChange = { type: 'change', id: 'c1', cycle: 1, n: 1, date: 'd', what: 'log change', links: ['S1'], status: 'done', at: 0, released: [{ sheetId: 'S1', code: 'B' }] }
		const other: DesignChange = { ...log, id: 'c2', released: [{ sheetId: 'S1', code: 'A' }] }
		const out = unreleaseSheets(r2, [s1, s2], [log, other])
		expect(out.sheets.map((s) => s.id)).toEqual(['S1'])   // S2 went "as last released": untouched
		expect(out.sheets[0].revisions?.map((r) => r.code)).toEqual(['A'])
		expect(out.sheets[0].changes?.map((c) => c.id)).toEqual(['n1', 'n2'])
		expect(out.changes).toHaveLength(1)
		expect(out.changes[0].released).toBeUndefined()
		expect(out.changes[0].status).toBe('open')
	})
	it('a first release taken back leaves the sheet with no revisions', () => {
		const out = unreleaseSheets(r1, [sheet('S2', [{ code: 'A', date: 'd', issueId: 'i1' }])], [])
		expect(out.sheets[0].revisions).toBeUndefined()
		expect('changes' in out.sheets[0]).toBe(false)
	})
})
