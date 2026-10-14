// PACKAGES (sheets-organising §3, slice 6): re-usable sets of sheets for issuing — a LIST of sheet ids, or a RULE
// (a saved register filter: categories, levels, rooms, tags, disciplines). Which sheets a package holds now, what has
// changed in it since it last went out (added / withdrawn / never issued), freezing a rule to a list, and a package
// made from an old issue (Dave D9). Pure; tested in packages.test.ts.
import type { Id, Contact } from './types'
import type { Issue, SheetPackage, SheetRule } from './drawing'
import { filterRows, type ListFilter, type SheetRow } from './sheetList'

/** The package's sheets now, from the register rows of every sheet: a list in its own order (sheets gone or archived
 *  left out); a rule in print order (archived never match). */
export function packageMembers(p: SheetPackage, rows: SheetRow[]): SheetRow[] {
	const active = rows.filter((r) => r.status !== 'archived')
	if (p.sheetIds) { const by = new Map(active.map((r) => [r.id, r])); return p.sheetIds.map((id) => by.get(id)).filter((r): r is SheetRow => !!r) }
	if (!p.rule) return []
	const r = p.rule
	return filterRows(active, { cats: r.kinds, levels: r.levelIds, rooms: r.spaceIds, tags: r.tags })
		.filter((x) => !r.disciplines?.length || r.disciplines.includes(x.discipline))
		.sort((a, b) => Number(a.order) - Number(b.order))
}

/** A rule from the register's chips (nothing picked anywhere = null: a rule must narrow something). */
export function ruleFromFilter(f: ListFilter): SheetRule | null {
	const rule: SheetRule = {}
	if (f.cats?.length) rule.kinds = [...f.cats]
	if (f.levels?.length) rule.levelIds = [...f.levels]
	if (f.rooms?.length) rule.spaceIds = [...f.rooms]
	if (f.tags?.length) rule.tags = [...f.tags]
	return Object.keys(rule).length ? rule : null
}

/** The rule in words, for the Packages list ("Rack elevations · IDF1"). */
export function ruleText(r: SheetRule, nameOf: (kind: 'cat' | 'id', id: string) => string): string {
	return [r.kinds?.map((k) => nameOf('cat', k)), r.levelIds?.map((id) => nameOf('id', id)), r.spaceIds?.map((id) => nameOf('id', id)), r.tags, r.disciplines]
		.filter((x): x is string[] => !!x?.length).map((x) => x.join(' or ')).join(' · ')
}

/** A rule package turned into a list of the sheets it holds now (to make exceptions). */
export const freezeToList = (p: SheetPackage, members: SheetRow[]): SheetPackage => {
	const { rule: _drop, ...rest } = p
	return { ...rest, sheetIds: members.map((r) => r.id) }
}

/** The latest issue of this package (by number, then date), if any. */
export function lastIssueOf(p: SheetPackage, issues: Issue[]): Issue | undefined {
	return issues.filter((i) => i.packageId === p.id).sort((a, b) => (b.number ?? 0) - (a.number ?? 0) || b.date.localeCompare(a.date)).at(0)
}

/** Since the package last went out: sheets in it now that weren't (added), ones that were and aren't any more
 *  (withdrawn), and ones never issued at all. Changed-since-issue needs the fingerprints (the Issue panel shows it). */
export function sinceLastIssue(members: SheetRow[], last: Issue | undefined): { added: Id[]; withdrawn: Issue['sheets']; notIssued: Id[] } {
	const now = new Set(members.map((r) => r.id)), then = new Set(last?.sheets.map((s) => s.sheetId) ?? [])
	return {
		added: last ? members.filter((r) => !then.has(r.id)).map((r) => r.id) : [],
		withdrawn: last ? last.sheets.filter((s) => !now.has(s.sheetId)) : [],
		notIssued: members.filter((r) => !r.rev).map((r) => r.id),
	}
}

/** A list package from an old issue's sheets (Dave D9: "Make package"): its name and purpose; the issue then links
 *  to it, so the next issue of the package diffs against it. */
export function packageFromIssue(i: Issue, id: Id, order: number): SheetPackage {
	return { type: 'package', id, name: i.name, purpose: i.purpose, ...(i.to ? { recipients: [{ name: i.to }] } : {}), sheetIds: i.sheets.map((s) => s.sheetId), order }
}

/** A package's recipients as they print: a contact's name / org as the contact has them now (one deleted since: as
 *  stored), a typed one as typed. */
export function resolveRecipients(rs: SheetPackage['recipients'], contacts: readonly Contact[] = []): { name: string; org?: string }[] {
	return (rs ?? []).map((r) => {
		const c = r.contactId ? contacts.find((x) => x.id === r.contactId) : undefined
		return c ? { name: c.name, ...(c.org ? { org: c.org } : {}) } : { name: r.name, ...(r.org ? { org: r.org } : {}) }
	})
}
/** A recipient for a contact (its name / org kept too, for a contact deleted later). */
export const recipientOf = (c: Contact) => ({ name: c.name, ...(c.org ? { org: c.org } : {}), contactId: c.id })
/** The packages' TYPED recipients turned into contacts (Settings › Contacts › "Add the people from packages"): one
 *  contact per name + org not already one; every package's typed recipients then point at their contact. */
export function contactsFromPackages(pkgs: readonly SheetPackage[], contacts: readonly Contact[], id: () => Id): { contacts: Contact[]; packages: SheetPackage[] } {
	const all = [...contacts], key = (n: string, o?: string) => `${n.trim().toLowerCase()}|${(o ?? '').trim().toLowerCase()}`
	const find = (n: string, o?: string) => all.find((c) => key(c.name, c.org) === key(n, o))
	const changed: SheetPackage[] = []
	for (const p of pkgs) {
		if (!p.recipients?.some((r) => !r.contactId)) continue
		const recipients = p.recipients.map((r) => {
			if (r.contactId) return r
			let c = find(r.name, r.org)
			if (!c) { c = { id: id(), name: r.name.trim(), ...(r.org?.trim() ? { org: r.org.trim() } : {}) }; all.push(c) }
			return recipientOf(c)
		})
		changed.push({ ...p, recipients })
	}
	return { contacts: all.slice(contacts.length), packages: changed }
}

/** Recipients as typed lines ("Name, Org") ⇄ the stored list. */
export const recipientsText = (rs: SheetPackage['recipients']): string => (rs ?? []).map((r) => (r.org ? `${r.name}, ${r.org}` : r.name)).join('\n')
export function parseRecipients(text: string): SheetPackage['recipients'] {
	const out = text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [name, ...org] = l.split(','); return { name: name.trim(), ...(org.join(',').trim() ? { org: org.join(',').trim() } : {}) } })
	return out.length ? out : undefined
}
