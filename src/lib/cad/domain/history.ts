// The EDIT HISTORY (design log step 4, User 2026-10-17: "who moved this rack, when"): each settled edit made in this
// tab — its undo label, who, when, the things it touched — kept append-only beside the project while the project's
// switch is on (Settings › Files). Pure; the Firestore part is app/editHistory.ts, tested in history.test.ts.
import type { Change } from '../store/store'
import type { Id } from './types'

/** One edit as kept. `ids`: what it touched (at most MAX_IDS — a bulk edit's first ones), `n`: how many it touched. */
export interface HistoryEntry { at: number; by: { uid: string; name: string }; label: string; ids: Id[]; n: number }

export const MAX_IDS = 50

/** A settled edit of this tab as an entry; null for what isn't one (another tab's edit, the load, a drag still moving,
 *  nothing changed). Undo / redo are entries too ("Undo: Move rack R03"). */
export function historyEntry(c: Change, by: HistoryEntry['by'], at: number): HistoryEntry | null {
	if (!c.final || !c.ops.length || (c.source !== 'local' && c.source !== 'gesture' && c.source !== 'undo' && c.source !== 'redo')) return null
	const ids = [...new Set(c.ops.map((o) => o.id))]
	const label = (c.label ?? '').trim() || 'Edit'
	return { at, by, label: c.source === 'undo' ? `Undo: ${label}` : c.source === 'redo' ? `Redo: ${label}` : label, ids: ids.slice(0, MAX_IDS), n: ids.length }
}

/** Newest first, then by label (two edits in the same millisecond keep an order). */
export const newestFirst = (a: HistoryEntry, b: HistoryEntry): number => b.at - a.at || a.label.localeCompare(b.label)

/** Rough storage of `count` entries (bytes), for Settings: an entry is about 300 bytes with its ids. */
export const roughSize = (count: number): string => {
	const b = count * 300
	return !count ? 'nothing' : b < 1e6 ? `${Math.max(1, Math.round(b / 1e3))} kB` : `${(b / 1e6).toFixed(1)} MB`
}
