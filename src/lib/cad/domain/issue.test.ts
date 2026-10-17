// Issuing, the pure part: revision codes, frozen lists + fingerprints, which sheets a package bumps.
import { describe, it, expect } from 'vitest'
import { nextRev, nextMajor, nextMinor, freeze, fingerprint, planIssue, withRevision, issuedRevision, changesText, underlayRef, parseUnderlayRef, transmittalRows, issueNumbers, nextIssueNumber, issueTag, issueTitle, withCodes, revCodeProblem, issueState, issuesOfSheet, issueRegister, sheetPrint, pageLook, draftRev, cloudShown, tagDraftClouds, primChanges, changeOverlay } from './issue'
import type { Issue, Sheet } from './drawing'
import type { Prim } from '../views/display'

const sheet = (id: string, revisions?: Sheet['revisions']): Sheet => ({
	type: 'sheet', id, number: id, title: id, order: 0, paper: { size: 'A3', orientation: 'landscape', marginMm: 5 }, viewports: [], status: 'active', ...(revisions ? { revisions } : {}),
})

describe('change history (T102)', () => {
	it('a new revision takes the change notes: "what changed" defaults to them, the sheet starts empty again', () => {
		const s = { ...sheet('S1'), changes: [{ id: 'c1', date: '2026-10-08', text: 'Moved rack A3', asked: 'client' }, { id: 'c2', date: '2026-10-09', text: 'Added AP-12 ' }, { id: 'c3', date: '2026-10-09', text: ' ' }] }
		expect(changesText(s)).toBe('Moved rack A3; Added AP-12')
		const r = issuedRevision(s, { code: 'A', date: '2026-10-10', note: 'For construction' })
		expect(r.changes).toBeUndefined()
		expect(r.revisions).toEqual([{ code: 'A', date: '2026-10-10', note: 'For construction', desc: 'Moved rack A3; Added AP-12', changes: s.changes.slice(0, 2) }])
		// a typed "what changed" wins; no notes → as before
		expect(issuedRevision(s, { code: 'A', date: 'd', desc: 'Re-issued' }).revisions![0].desc).toBe('Re-issued')
		expect(issuedRevision(sheet('S2'), { code: 'A', date: 'd' }).revisions).toEqual([{ code: 'A', date: 'd' }])
	})
})

describe('revision clouds (W20)', () => {
	const sheet = (codes: string[]) => ({ id: 'S', revisions: codes.map((code) => ({ code, date: '2026-10-15' })) })
	it('a new cloud marks the revision being prepared', () => {
		expect(draftRev(sheet([]))).toBe('A')
		expect(draftRev(sheet(['A', 'B']))).toBe('C')
		expect(draftRev(sheet(['P01']), 'P01')).toBe('P02')
	})
	it('shown: untagged, the last issued revision, or one not issued yet; an earlier revision is hidden', () => {
		const s = sheet(['A', 'B'])
		expect([undefined, 'B', 'C', 'A'].map((r) => cloudShown(s, r))).toEqual([true, true, true, false])
		expect(cloudShown(sheet([]), 'A')).toBe(true)
		// only a later MAJOR revision hides it: A's clouds stay through A.1, A.2 (design log)
		expect([cloudShown(sheet(['A', 'A.1']), 'A'), cloudShown(sheet(['A', 'A.1', 'B']), 'A.1')]).toEqual([true, false])
	})
	it('a cloud marking a change but no revision yet takes the code at the release', () => {
		const cloud: { id: string; sheetId: string; geom: { kind: string; rev?: string; changeId?: string } } = { id: 'c', sheetId: 'S', geom: { kind: 'cloud', changeId: 'k' } }
		const out = tagDraftClouds([cloud], sheet(['A']), 'A.1')
		expect(out.map((x) => x.geom.rev)).toEqual(['A.1'])
	})
	it('at an issue as P1: the sheet’s clouds on a draft code take P1; issued ones, others’ and untagged stay', () => {
		const c = (id: string, rev?: string, sheetId = 'S') => ({ id, sheetId, geom: { kind: 'cloud', ...(rev ? { rev } : {}) } })
		const out = tagDraftClouds([c('1', 'A'), c('2', 'P0'), c('3'), c('4', 'A', 'T'), c('5', 'P1')], sheet(['P0']), 'P1')
		expect(out.map((x) => [x.id, x.geom.rev])).toEqual([['1', 'P1']])
	})
})

describe('issue numbers', () => {
	const iss = (id: string, date: string, number?: number) => ({ type: 'issue', id, name: id, purpose: '', date, sheets: [], ...(number ? { number } : {}) }) as Issue
	it('old issues count in date order; a set number wins; the next one is one past the highest', () => {
		const list = [iss('b', '2026-10-02'), iss('a', '2026-10-01'), iss('c', '2026-10-03', 7)]
		expect(Object.fromEntries(issueNumbers(list))).toEqual({ a: 1, b: 2, c: 7 })
		expect(nextIssueNumber(list)).toBe(8)
		expect(nextIssueNumber([])).toBe(1)
		expect(issueTag(3)).toBe('Release 03')
	})
})

describe('issue', () => {
	it('major and minor: B after A.2, A.1 after A, A.2 after A.1', () => {
		expect([nextMajor('A'), nextMajor('A.2'), nextMajor(undefined), nextMajor('P01.1')]).toEqual(['B', 'B', 'A', 'P02'])
		expect([nextMinor('A'), nextMinor('A.1'), nextMinor('A.9'), nextMinor(undefined)]).toEqual(['A.1', 'A.2', 'A.10', 'A'])
	})
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
	})
	it('freeze keeps what a print needs: color, lineweight and line type — and a style change shows in the fingerprint', () => {
		const line: Prim = { k: 'line', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }], cls: 'drawing', color: '#c00', weight: 0.5, dash: 'dashed' }
		const ring: Prim = { k: 'circle', c: { x: 0, y: 0 }, r: 2, cls: 'outlet', color: '#0a0', weight: 0.35, dash: 'dotted' }
		const text: Prim = { k: 'text', at: { x: 0, y: 0 }, text: 'A', size: 2.5, cls: 'label', color: '#00c' }
		expect(freeze([line, ring, text])).toEqual([
			{ k: 'line', pts: line.pts, cls: 'drawing', color: '#c00', weight: 0.5, dash: 'dashed' },
			{ k: 'circle', c: { x: 0, y: 0 }, r: 2, cls: 'outlet', color: '#0a0', weight: 0.35, dash: 'dotted' },
			{ k: 'text', at: { x: 0, y: 0 }, text: 'A', size: 2.5, cls: 'label', color: '#00c' },
		])
		expect(fingerprint(freeze([line]))).not.toBe(fingerprint(freeze([{ ...line, dash: undefined } as Prim])))
		expect(parseUnderlayRef('https://x/y.png')).toBeNull()
	})
	it('a floorplan’s look (masks / hidden layers) is in the print, only when set (W3)', () => {
		const f = freeze([{ k: 'image', url: underlayRef('F1', 1), x: 0, y: 0, w: 100, h: 50 }, { k: 'text', at: { x: 0, y: 0 }, text: 'A', size: 2.5, cls: 'label' }])
		expect(sheetPrint(f, () => '')).toBe(fingerprint(f))   // none set: the print as before
		const masked = sheetPrint(f, (r) => (r === underlayRef('F1', 1) ? '[[{"x":1}],[],false]' : ''))
		expect(masked).not.toBe(fingerprint(f))
		expect(sheetPrint(f, () => '[[{"x":2}],[],false]')).not.toBe(masked)
		expect(pageLook({ pages: { 1: { scale: { scale: 2 } } } }, 1)).toBe('')
		expect(pageLook({ pages: { 2: { masks: [{ x: 1 }] } } }, 1)).toBe('')
		expect(pageLook({ pages: { 1: { masks: [{ x: 1 }] } } }, 1)).not.toBe('')
		expect(pageLook({ hiddenLayers: ['b', 'a'] }, 1)).toBe(pageLook({ hiddenLayers: ['a', 'b'] }, 1))
		expect(pageLook({ hideMarkups: true }, 1)).not.toBe('')
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

describe('issue register (backlog: for the PM)', () => {
	const sh = (id: string, rev: string, changed: boolean) => ({ sheetId: id, number: id, title: `T${id}`, rev, size: 'A3', changed })
	const issues = [
		{ type: 'issue', id: 'I2', name: 'Build', purpose: 'x', date: '2026-02-01', number: 2, sheets: [sh('S2', 'B', true)], withdrawn: [{ sheetId: 'S10', number: 'S10', title: '', rev: 'A' }] },
		{ type: 'issue', id: 'I1', name: 'Tender', purpose: 'x', date: '2026-01-01', number: 1, sheets: [sh('S10', 'A', true), sh('S2', 'A', true)] },
	] as Issue[]
	it('a column per issue in issue order, a row per sheet by number: its rev there, new or as issued, withdrawn', () => {
		const r = issueRegister(issues)
		expect(r.columns.map((c) => c.head)).toEqual(['Release 01 Tender', 'Release 02 Build'])
		expect(r.rows.map((x) => x.number)).toEqual(['S2', 'S10'])
		expect(r.rows[0].cells).toEqual([{ rev: 'A', new: true }, { rev: 'B', new: true }])
		expect(r.rows[1].cells).toEqual([{ rev: 'A', new: true }, 'withdrawn'])
	})
	it('latest only: one column, each sheet at its last issue', () => {
		const r = issueRegister(issues, true)
		expect(r.rows.map((x) => (x.cells[0] as { rev: string }).rev)).toEqual(['B · Release 02 · 2026-02-01', 'A · Release 01 · 2026-01-01'])
	})
})

describe('what changed since the last issue (W23)', () => {
	const line = (x: number, cls = 'note'): Prim => ({ k: 'line', pts: [{ x, y: 0 }, { x, y: 10 }], cls })
	const text = (t: string): Prim => ({ k: 'text', at: { x: 0, y: 0 }, text: t, size: 2.5, cls: 'note' })
	const pic = (url: string): Prim => ({ k: 'image', url, x: 0, y: 0, w: 100, h: 50 })
	it('new or changed items are added, issued ones no longer drawn are gone; repeats count; floorplans only flagged', () => {
		const issued = [line(1), line(1), line(2), text('A01'), pic(underlayRef('f1'))]
		const now = [line(1), line(2), line(3), text('A02'), pic(underlayRef('f1'))]
		const c = primChanges(issued, now)
		expect(c.added).toEqual([line(3), text('A02')])
		expect(c.gone).toEqual([line(1), text('A01')])
		expect(c.floorplans).toBe(false)
		expect(primChanges([pic(underlayRef('f1'))], [pic(underlayRef('f2'))])).toMatchObject({ added: [], gone: [], floorplans: true })
		expect(primChanges(issued, issued)).toMatchObject({ added: [], gone: [], floorplans: false })
	})
	it('a moved viewport: its marks shifted by the same amount are matched, not shown; a mark edited too still shows', () => {
		const clipWas = { x0: 13, y0: 13.7, x1: 345, y1: 286.7 }, clipNow = { x0: 10, y0: 10, x1: 345, y1: 287 }
		const at = (p: Prim, dx: number, dy: number, clip: typeof clipNow): Prim => (p.k === 'line' ? { ...p, pts: p.pts.map((q) => ({ x: q.x + dx, y: q.y + dy })), clip } : p.k === 'text' ? { ...p, at: { x: p.at.x + dx, y: p.at.y + dy }, clip } : p)
		const issued = [line(50), line(60), text('R1'), text('R2')].map((p) => at(p, 0, 0, clipWas))
		const now = [line(50), line(60), text('R1'), text('R2 changed')].map((p) => at(p, -3, -3.7, clipNow))
		const c = primChanges(issued, now)
		expect(c.moved).toBe(3)
		expect(c.added.map((p) => p.k === 'text' && p.text)).toEqual(['R2 changed'])
		expect(c.gone.map((p) => p.k === 'text' && p.text)).toEqual(['R2'])
	})
	it('the overlay: outlines in the change classes, own colors and fills dropped, clips kept', () => {
		const clip = { x0: 0, y0: 0, x1: 5, y1: 5 }
		const o = changeOverlay({ added: [{ k: 'line', pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }], closed: true, fill: true, color: '#f00', cls: 'wall', clip }], gone: [text('A01')] })
		expect(o).toEqual([{ ...text('A01'), cls: 'chg-gone' }, { k: 'line', pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }], closed: true, cls: 'chg-new', clip }])
	})
})

describe('a release\'s title (Round 8 #8)', () => {
	it('names the number once', () => {
		expect(issueTitle(3, '03 Round 8')).toBe('Release 03 Round 8')
		expect(issueTitle(3, 'Release 3 – Round 8')).toBe('Release 03 Round 8')
		expect(issueTitle(3, 'Tender')).toBe('Release 03 Tender')
		expect(issueTitle(3, '30 rooms')).toBe('Release 03 30 rooms')   // another number stays
	})
})
