// Issuing, the pure part: revision codes, frozen lists + fingerprints, which sheets a package bumps.
import { describe, it, expect } from 'vitest'
import { nextRev, freeze, fingerprint, planIssue, withRevision, underlayRef, parseUnderlayRef, transmittalRows } from './issue'
import type { Issue, Sheet } from './drawing'
import type { Prim } from '../views/display'

const sheet = (id: string, revisions?: Sheet['revisions']): Sheet => ({
	type: 'sheet', id, number: id, title: id, order: 0, paper: { size: 'A3', orientation: 'landscape', marginMm: 5 }, viewports: [], status: 'active', ...(revisions ? { revisions } : {}),
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
