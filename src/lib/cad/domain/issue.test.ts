// Issuing, the pure part: revision codes, frozen lists + fingerprints, which sheets a package bumps.
import { describe, it, expect } from 'vitest'
import { nextRev, freeze, fingerprint, planIssue, withRevision, underlayRef, parseUnderlayRef, transmittalRows, issueNumbers, nextIssueNumber, issueTag, withCodes, revCodeProblem, issueState, issuesOfSheet } from './issue'
import type { Issue, Sheet } from './drawing'
import type { Prim } from '../views/display'

const sheet = (id: string, revisions?: Sheet['revisions']): Sheet => ({
	type: 'sheet', id, number: id, title: id, order: 0, paper: { size: 'A3', orientation: 'landscape', marginMm: 5 }, viewports: [], status: 'active', ...(revisions ? { revisions } : {}),
})

describe('issue numbers', () => {
	const iss = (id: string, date: string, number?: number) => ({ type: 'issue', id, name: id, purpose: '', date, sheets: [], ...(number ? { number } : {}) }) as Issue
	it('old issues count in date order; a set number wins; the next one is one past the highest', () => {
		const list = [iss('b', '2026-10-02'), iss('a', '2026-10-01'), iss('c', '2026-10-03', 7)]
		expect(Object.fromEntries(issueNumbers(list))).toEqual({ a: 1, b: 2, c: 7 })
		expect(nextIssueNumber(list)).toBe(8)
		expect(nextIssueNumber([])).toBe(1)
		expect(issueTag(3)).toBe('Issue 03')
	})
})

describe('issue', () => {
	it('next revision: first, letters with carry, numbers keeping their width', () => {
		expect(nextRev(undefined)).toBe('A')
		expect(nextRev(undefined, 'P01')).toBe('P01')
		expect(nextRev('A')).toBe('B')
		expect(nextRev('Z')).toBe('AA')
		expect(nextRev('AZ')).toBe('BA')
		expect(nextRev('P01')).toBe('P02')
		expect(nextRev('P09')).toBe('P10')
		expect(nextRev('9')).toBe('10')
		expect(nextRev('C1')).toBe('C2')
	})
	it('freeze rounds to 0.01 mm and drops pick ids; equal drawings → equal fingerprints', () => {
		const a: Prim[] = [{ k: 'line', pts: [{ x: 1.23456, y: 2 }, { x: 3, y: 4.0001 }], cls: 'wall', src: 'x', sub: '1' }, { k: 'text', at: { x: 1, y: 1 }, text: 'R311', size: 2.5, cls: 'label', src: 'r' }]
		const f = freeze(a)
		expect(f[0]).toEqual({ k: 'line', pts: [{ x: 1.23, y: 2 }, { x: 3, y: 4 }], cls: 'wall' })
		expect(fingerprint(f)).toBe(fingerprint(freeze([{ ...a[0], src: 'other' } as Prim, a[1]])))
		expect(fingerprint(f)).not.toBe(fingerprint(freeze([a[0], { ...a[1], text: 'R312' } as Prim])))
		expect(parseUnderlayRef(underlayRef('L33 Plan.pdf', 2))).toEqual({ fileId: 'L33 Plan.pdf', page: 2 })
		expect(parseUnderlayRef('https://x/y.png')).toBeNull()
	})
	it('a package bumps sheets never issued or changed since; the rest go as last issued', () => {
		const now = (s: Sheet) => (s.id === 'S2' ? 'h2-changed' : 'h1')
		const plan = planIssue([sheet('S1', [{ code: 'A', date: 'd', hash: 'h1' }]), sheet('S2', [{ code: 'A', date: 'd', hash: 'h2' }]), sheet('S3')], now)
		expect(plan.map((r) => [r.sheet.id, r.changed, r.rev])).toEqual([['S1', false, 'A'], ['S2', true, 'B'], ['S3', true, 'A']])
		expect(withRevision(sheet('S3'), { code: 'A', date: '2026-10-02' }).revisions).toEqual([{ code: 'A', date: '2026-10-02' }])
	})
	it('transmittal rows in sheet-number order', () => {
		const iss = { sheets: [{ number: 'S10' }, { number: 'S2' }] } as Issue
		expect(transmittalRows(iss).map((s) => s.number)).toEqual(['S2', 'S10'])
	})
})

describe('typed revision codes (sheets-organising slice 7, D7)', () => {
	const s = (id: string, revs: string[] = []) => ({ type: 'sheet', id, number: id, title: id, order: 0, status: 'active', viewports: [], paper: { size: 'A3', orientation: 'landscape', marginMm: 5 }, revisions: revs.map((code) => ({ code, date: '2026-01-01' })) }) as unknown as import('./drawing').Sheet
	it('a typed code replaces the suggested one on changed sheets only; blank keeps it', () => {
		const plan = [{ sheet: s('A', ['P01']), changed: true, from: 'P01', rev: 'P02' }, { sheet: s('B', ['P01']), changed: false, from: 'P01', rev: 'P01' }, { sheet: s('C'), changed: true, rev: 'A' }]
		expect(withCodes(plan, { A: 'C01', B: 'C01', C: ' ' }).map((r) => r.rev)).toEqual(['C01', 'P01', 'A'])
	})
	it('refuses a blank code or one the sheet already has', () => {
		expect(revCodeProblem(s('A', ['P01']), 'P01')).toMatch(/already has/)
		expect(revCodeProblem(s('A'), '  ')).toMatch(/no revision code/)
		expect(revCodeProblem(s('A', ['P01']), 'C01')).toBeNull()
	})
})

describe('issue state (slice 5)', () => {
	const rev = (hash?: string) => [{ code: 'B', date: '2026-01-01', ...(hash ? { hash } : {}) }]
	it('not issued / issued / changed since / superseded / not worked out yet', () => {
		expect(issueState({ status: 'active' })).toBe('not-issued')
		expect(issueState({ status: 'active', revisions: rev('h1') }, 'h1')).toBe('issued')
		expect(issueState({ status: 'active', revisions: rev('h1') }, 'h2')).toBe('changed')
		expect(issueState({ status: 'archived', revisions: rev('h1') }, 'h2')).toBe('superseded')
		expect(issueState({ status: 'active', revisions: rev('h1') })).toBe('unknown')
	})
})

describe('issued in (slice 9)', () => {
	it('lists the issues that included a sheet, newest first, at its rev, new or as issued', () => {
		const sh = (rev: string, changed: boolean) => [{ sheetId: 'S', number: 'P1', title: 'Plan', rev, size: 'A3', changed }]
		const issues = [
			{ type: 'issue', id: 'I1', name: 'Tender', purpose: 'For tender', date: '2026-01-01', number: 1, sheets: sh('A', true) },
			{ type: 'issue', id: 'I2', name: 'Other', purpose: 'x', date: '2026-02-01', number: 2, sheets: [] },
			{ type: 'issue', id: 'I3', name: 'Build', purpose: 'For construction', date: '2026-03-01', number: 3, sheets: sh('A', false) },
		] as Issue[]
		expect(issuesOfSheet(issues, 'S').map((x) => [x.number, x.rev, x.changed])).toEqual([[3, 'A', false], [1, 'A', true]])
	})
})
