// Packages: members of a list / a rule, freeze to list, since the last issue, from an old issue, recipients.
import { describe, it, expect } from 'vitest'
import { packageMembers, ruleFromFilter, freezeToList, lastIssueOf, sinceLastIssue, packageFromIssue, parseRecipients, recipientsText, resolveRecipients, recipientOf, contactsFromPackages } from './packages'
import type { Issue, SheetPackage } from './drawing'
import type { SheetRow } from './sheetList'

const row = (id: string, over: Partial<SheetRow> = {}): SheetRow => ({
	id, order: '1', number: id, title: id, place: '', kind: '', discipline: '', tags: [], status: 'active', rev: '', size: 'A3 L', scale: '', viewports: 1, revisions: [],
	category: 'Plans', categoryId: 'plans', categoryAuto: true, categoryOrder: 20, level: '1F', levelIds: ['L1'], levelOrders: [1], levelOrder: 1, room: '', roomIds: [], ...over,
})
const rows = [
	row('P1', { order: '2' }),
	row('RE1', { order: '1', categoryId: 'rack-elevations', roomIds: ['IDF1'] }),
	row('RE2', { order: '3', categoryId: 'rack-elevations', roomIds: ['IDF2'], rev: 'A' }),
	row('OLD', { order: '4', categoryId: 'rack-elevations', roomIds: ['IDF1'], status: 'archived' }),
]
const pkg = (over: Partial<SheetPackage>): SheetPackage => ({ type: 'package', id: 'K', name: 'Set', order: 10, ...over })
const issue = (over: Partial<Issue>): Issue => ({ type: 'issue', id: 'I', name: 'Tender', purpose: 'For tender', date: '2026-10-01', sheets: [], ...over })

describe('recipients from project contacts', () => {
	const contacts = [{ id: 'c1', name: 'Ann Lee', org: 'ACME' }, { id: 'c2', name: 'Bo' }]
	it('a contact prints as the contact is now; a deleted one as stored; a typed one as typed', () => {
		const rs = [{ name: 'Ann (old)', contactId: 'c1' }, { name: 'Gone', org: 'X', contactId: 'c9' }, { name: 'Typed', org: 'Y' }]
		expect(resolveRecipients(rs, contacts)).toEqual([{ name: 'Ann Lee', org: 'ACME' }, { name: 'Gone', org: 'X' }, { name: 'Typed', org: 'Y' }])
		expect(recipientOf(contacts[0])).toEqual({ name: 'Ann Lee', org: 'ACME', contactId: 'c1' })
	})
	it('the packages’ typed recipients become contacts (one per name + org), and the packages point at them', () => {
		let n = 0
		const pkg = (id: string, rs: SheetPackage['recipients']): SheetPackage => ({ type: 'package', id, name: id, recipients: rs, sheetIds: [], order: 0 })
		const r = contactsFromPackages([pkg('P', [{ name: 'ann lee', org: 'acme' }, { name: 'Cy', org: 'Z' }]), pkg('Q', [{ name: 'Cy', org: 'Z' }]), pkg('R', [{ name: 'Bo', contactId: 'c2' }])], contacts, () => `n${++n}`)
		expect(r.contacts).toEqual([{ id: 'n1', name: 'Cy', org: 'Z' }])                // Ann matched c1 (case aside)
		expect(r.packages.map((p) => [p.id, p.recipients!.map((x) => x.contactId)])).toEqual([['P', ['c1', 'n1']], ['Q', ['n1']]])   // R unchanged
	})
})

describe('packages', () => {
	it('a list keeps its order and drops gone / archived sheets', () => {
		expect(packageMembers(pkg({ sheetIds: ['RE2', 'GONE', 'OLD', 'P1'] }), rows).map((r) => r.id)).toEqual(['RE2', 'P1'])
	})
	it('a rule matches by ids (any value in a field, every field), in print order, never archived', () => {
		expect(packageMembers(pkg({ rule: { kinds: ['rack-elevations'] } }), rows).map((r) => r.id)).toEqual(['RE1', 'RE2'])
		expect(packageMembers(pkg({ rule: { kinds: ['rack-elevations'], spaceIds: ['IDF1'] } }), rows).map((r) => r.id)).toEqual(['RE1'])
		expect(ruleFromFilter({ q: 'x' })).toBeNull()
		expect(ruleFromFilter({ cats: ['plans'], rooms: ['IDF1'] })).toEqual({ kinds: ['plans'], spaceIds: ['IDF1'] })
	})
	it('freezes a rule to the list it holds now', () => {
		const p = pkg({ rule: { kinds: ['rack-elevations'] } })
		const f = freezeToList(p, packageMembers(p, rows))
		expect(f).toMatchObject({ sheetIds: ['RE1', 'RE2'] })
		expect(f.rule).toBeUndefined()
	})
	it('since its last issue: added, withdrawn, never issued', () => {
		const p = pkg({ sheetIds: ['P1', 'RE2'] })
		const a = issue({ id: 'A', number: 1, packageId: 'K', sheets: [{ sheetId: 'RE2', number: 'RE2', title: '', rev: 'A', size: 'A3', changed: true }, { sheetId: 'RE1', number: 'RE1', title: '', rev: 'A', size: 'A3', changed: true }] })
		const other = issue({ id: 'B', number: 2 })
		expect(lastIssueOf(p, [a, other])?.id).toBe('A')
		const d = sinceLastIssue(packageMembers(p, rows), a)
		expect(d.added).toEqual(['P1'])
		expect(d.withdrawn.map((s) => s.sheetId)).toEqual(['RE1'])
		expect(d.notIssued).toEqual(['P1'])
	})
	it('a package from an old issue; recipients as lines', () => {
		expect(packageFromIssue(issue({ to: 'Client', sheets: [{ sheetId: 'P1', number: '', title: '', rev: 'A', size: 'A3', changed: true }] }), 'N', 20))
			.toMatchObject({ type: 'package', id: 'N', name: 'Tender', purpose: 'For tender', recipients: [{ name: 'Client' }], sheetIds: ['P1'], order: 20 })
		const r = parseRecipients('Ann Lee, ACME Ltd\n\nBob')
		expect(r).toEqual([{ name: 'Ann Lee', org: 'ACME Ltd' }, { name: 'Bob' }])
		expect(recipientsText(r)).toBe('Ann Lee, ACME Ltd\nBob')
	})
})
