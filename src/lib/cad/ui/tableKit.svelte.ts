// What every table shares (UX review T5–T7): a sort by any column (click the header; again to reverse), a filter box
// and a scope — This view · Selection · All — remembered per table in this browser; "n shown of N · m selected";
// ↑ / ↓ move the selection; Ctrl+C copies the shown rows as tab-separated text for Excel.
import { naturalCompare } from '../domain/labels'

export type Scope = 'view' | 'sel' | 'all'
export const SCOPES: [Scope, string][] = [['view', 'This view'], ['sel', 'Selection'], ['all', 'All']]

export class TableState {
	sortKey = $state<string | null>(null)
	sortDir = $state<1 | -1>(1)
	q = $state('')
	scope = $state<Scope>('view')
	#key: string
	constructor(name: string, scope: Scope = 'view') {
		this.#key = `cad-table:${name}`
		this.scope = scope
		try {
			const s = JSON.parse(localStorage.getItem(this.#key) ?? '{}') as { sortKey?: string | null; sortDir?: 1 | -1; scope?: Scope }
			if (s.sortKey !== undefined) this.sortKey = s.sortKey
			if (s.sortDir) this.sortDir = s.sortDir
			if (s.scope) this.scope = s.scope
		} catch { /* nothing saved, or storage blocked */ }
	}
	save = (): void => { try { localStorage.setItem(this.#key, JSON.stringify({ sortKey: this.sortKey, sortDir: this.sortDir, scope: this.scope })) } catch { /* blocked */ } }
	/** A click on a header: sort by it, or reverse; a third click goes back to the table's own order. */
	toggle(key: string): void {
		if (this.sortKey !== key) { this.sortKey = key; this.sortDir = 1 }
		else if (this.sortDir === 1) this.sortDir = -1
		else this.sortKey = null
		this.save()
	}
	/** The rows matching the filter text (over `text(row)`), sorted by the chosen column (`cols[key](row)`). */
	apply<T>(rows: T[], text: (r: T) => string, cols: Record<string, (r: T) => string | number | undefined>): T[] {
		const w = this.q.trim().toLowerCase()
		const kept = w ? rows.filter((r) => text(r).toLowerCase().includes(w)) : rows
		const get = this.sortKey ? cols[this.sortKey] : undefined
		if (!get) return kept
		const d = this.sortDir
		return [...kept].sort((a, b) => {
			const x = get(a) ?? '', y = get(b) ?? ''
			return d * (typeof x === 'number' && typeof y === 'number' ? x - y : naturalCompare(String(x), String(y)))
		})
	}
}

/** A key typed into a field of the table (an input, a select) is the field's, not the table's. */
const typing = (e: KeyboardEvent) => typeof Element !== 'undefined' && e.target instanceof Element && !!e.target.closest('input, select, textarea')

/** ↑ / ↓ in a table: the selection moves to the row above / below the (first) selected one; true = handled. */
export function arrowSelect(e: KeyboardEvent, ids: string[], selection: string[], select: (ids: string[]) => void): boolean {
	if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || !ids.length || typing(e)) return false
	const sel = new Set(selection), at = ids.findIndex((id) => sel.has(id))
	const next = at < 0 ? 0 : Math.max(0, Math.min(ids.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))
	select([ids[next]])
	return true
}

/** Ctrl+C in a table: the shown rows (with the header) as tab-separated text. */
export function copyRows(e: KeyboardEvent, head: string[], rows: (string | number | undefined)[][], say: (m: string) => void): boolean {
	if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'c' || typing(e)) return false
	const text = [head, ...rows].map((r) => r.map((c) => String(c ?? '').replace(/[\t\n]/g, ' ')).join('\t')).join('\n')
	void navigator.clipboard?.writeText(text).then(() => say(`${rows.length} row${rows.length === 1 ? '' : 's'} copied — paste into Excel`), () => say('The browser refused the copy'))
	return true
}
