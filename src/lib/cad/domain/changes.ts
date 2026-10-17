// The DESIGN LOG's changes (docs/plan/design-log.md, User 2026-10-17): numbering, lookups and how a sheet's change
// notes read them. Pure; tested in changes.test.ts. The Log table is ui/LogTable.svelte, an item's list
// ui/ChangesSection.svelte.
import type { DesignChange, ChangeRefKind, Sheet, SheetChange } from './drawing'
import type { Id } from './types'

export const REF_KINDS: [ChangeRefKind, string][] = [['email', 'Email'], ['meeting', 'Meeting'], ['rfi', 'RFI'], ['phone', 'Phone'], ['site', 'Site'], ['other', 'Other']]
export const STATUSES: [DesignChange['status'], string][] = [['open', 'Open'], ['done', 'Done'], ['rejected', 'Rejected'], ['superseded', 'Superseded']]

/** The numbering round now: the highest any change has (1 when there are none). */
export const currentCycle = (cs: DesignChange[]): number => Math.max(1, ...cs.map((c) => c.cycle))

/** A new change, numbered next in the current round, dated today unless given. */
export function newChange(cs: DesignChange[], id: Id, f: { what: string; links?: Id[]; date?: string; asked?: string; by?: DesignChange['by']; at?: number }): DesignChange {
	const cycle = currentCycle(cs), n = Math.max(0, ...cs.filter((c) => c.cycle === cycle).map((c) => c.n)) + 1
	return { type: 'change', id, cycle, n, date: f.date ?? today(), what: f.what.trim(), links: f.links ?? [], status: 'open', at: f.at ?? Date.now(),
		...(f.asked?.trim() ? { asked: f.asked.trim() } : {}), ...(f.by ? { by: f.by } : {}) }
}
export const today = (): string => new Date().toISOString().slice(0, 10)

/** Newest first: the latest round, the highest number. */
export const byNewest = (a: DesignChange, b: DesignChange): number => b.cycle - a.cycle || b.n - a.n

/** The changes about any of these items, newest first. */
export const changesAbout = (cs: DesignChange[], ids: Id[]): DesignChange[] => { const s = new Set(ids); return cs.filter((c) => c.links.some((l) => s.has(l))).sort(byNewest) }

/** Names already used in "asked by", most used first — offered as you type. */
export function askedNames(cs: DesignChange[]): string[] {
	const n = new Map<string, number>()
	for (const c of cs) if (c.asked) n.set(c.asked, (n.get(c.asked) ?? 0) + 1)
	return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k)
}

/** A change as a sheet note (the release's "what changed", the revision's notes, the title block's list). */
export const asNote = (c: DesignChange): SheetChange => ({ id: c.id, date: c.date, text: `${c.n}. ${c.what}`, ...(c.asked ? { asked: c.asked } : {}) })

/** Linked to this sheet and not yet released on it (rejected / superseded ones never go out). */
export const pendingOn = (c: DesignChange, sheetId: Id): boolean =>
	(c.status === 'open' || c.status === 'done') && c.links.includes(sheetId) && !c.released?.some((r) => r.sheetId === sheetId)
/** The changes pending on a sheet, by number. */
export const pendingChanges = (s: Sheet, cs: DesignChange[]): DesignChange[] => cs.filter((c) => pendingOn(c, s.id)).sort((a, b) => a.cycle - b.cycle || a.n - b.n)

/** A sheet's change notes since its last release: its own (from before the design log) and the changes pending on it. */
export const sheetNotes = (s: Sheet, cs: DesignChange[]): SheetChange[] => [...(s.changes ?? []), ...pendingChanges(s, cs).map(asNote)]

/** Released on a sheet at a revision: the changes pending on it record where they went out — done once every sheet they
 *  link has had them. */
export function releasedOn(cs: DesignChange[], sheetId: Id, code: string, isSheet: (id: Id) => boolean): DesignChange[] {
	return cs.filter((c) => pendingOn(c, sheetId)).map((c) => {
		const released = [...(c.released ?? []), { sheetId, code }]
		const all = c.links.filter(isSheet).every((id) => released.some((r) => r.sheetId === id))
		return { ...c, released, ...(all ? { status: 'done' as const } : {}) }
	})
}

/** Matches a search: number, what, why, who asked, the reference, who entered it. */
export function changeMatches(c: DesignChange, q: string): boolean {
	const t = q.trim().toLowerCase()
	if (!t) return true
	return [String(c.n), c.what, c.why, c.asked, c.ref?.text, c.by?.name, c.date].some((x) => x?.toLowerCase().includes(t))
}
