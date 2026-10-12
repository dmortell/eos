// What every table shares (UX review T5–T7): a sort by any column (click the header; again to reverse), a filter box
// and a scope — This view · Selection · All — remembered per table in this browser; "n shown of N · m selected";
// ↑ / ↓ move the selection; Ctrl+C copies the shown rows as tab-separated text for Excel. One way to pick rows
// (`RowPick`) and one way to edit a cell in place (`CellEdit`, the patch list's), in every table.
import { naturalCompare } from '../domain/labels'
import { composing, typingIn } from './keyGuards'

export type Scope = 'view' | 'sel' | 'all'
export const SCOPES: [Scope, string][] = [['view', 'This view'], ['sel', 'Selection'], ['all', 'All']]

export class TableState {
	sortKey = $state<string | null>(null)
	sortDir = $state<1 | -1>(1)
	q = $state('')
	scope = $state<Scope>('view')
	#key: string
	/** `scopes`: the ones this table offers (a saved scope it doesn't offer falls back to `scope`); `sortKey`: the
	 *  column it sorts by until one is clicked. */
	readonly scopes: Scope[]
	constructor(name: string, scope: Scope = 'view', sortKey: string | null = null, scopes: Scope[] = ['view', 'sel', 'all']) {
		this.#key = `cad-table:${name}`
		this.scopes = scopes
		this.scope = scope
		this.sortKey = sortKey
		try {
			const s = JSON.parse(localStorage.getItem(this.#key) ?? '{}') as { sortKey?: string | null; sortDir?: 1 | -1; scope?: Scope }
			if (s.sortKey !== undefined) this.sortKey = s.sortKey
			if (s.sortDir) this.sortDir = s.sortDir
			if (s.scope && scopes.includes(s.scope)) this.scope = s.scope
		} catch { /* nothing saved, or storage blocked */ }
	}
	/** Sort by `key` (not a header click: e.g. print order after moving sheets in it). */
	sortBy(key: string, dir: 1 | -1 = 1): void { this.sortKey = key; this.sortDir = dir; this.save() }
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

/** A key typed into a field of the table (an input, a select) is the field's, not the table's; mid-conversion (IME)
 *  it is the IME's. */
const typing = (e: KeyboardEvent) => composing(e) || typingIn(e.target)

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

type Mods = { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }
/** A click on a row: one row; Shift = the range from the last row clicked (Ctrl+Shift adds it); Ctrl = add / drop
 *  one. `keep`: selected things this table doesn't list that a plain range keeps (the outlets grid keeps the racks). */
export class RowPick {
	anchor: string | null = null
	pick(id: string, e: Mods, ids: string[], selection: string[], select: (ids: string[]) => void, keep: string[] = []): void {
		const ctrl = e.ctrlKey || e.metaKey
		if (e.shiftKey && this.anchor) {
			const i = ids.indexOf(this.anchor), j = ids.indexOf(id)
			if (i >= 0 && j >= 0) {
				const range = ids.slice(Math.min(i, j), Math.max(i, j) + 1)
				select([...new Set([...(ctrl ? selection : keep), ...range])])
				return
			}
		}
		this.anchor = id
		select(ctrl ? (selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id]) : [id])
	}
}

/** A mouse-down with Shift / Ctrl on a row picks rows: it mustn't also select the page's text. */
export const noTextPick = (e: MouseEvent): void => { if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault() }

export type CellAt<F extends string> = { id: string; field: F }
/** The cell after (or before) `at` — Tab: along the row's editable cells, then the next row's; Enter: the same column
 *  on the next row that has it. Null past either end. */
export function nextCell<F extends string>(at: CellAt<F>, ids: string[], fields: (id: string) => F[], tab: boolean, back: boolean): CellAt<F> | null {
	const step = back ? -1 : 1
	if (!tab) {
		for (let i = ids.indexOf(at.id) + step; i >= 0 && i < ids.length; i += step) if (fields(ids[i]).includes(at.field)) return { id: ids[i], field: at.field }
		return null
	}
	const own = fields(at.id), k = own.indexOf(at.field) + step
	if (k >= 0 && k < own.length) return { id: at.id, field: own[k] }
	for (let i = ids.indexOf(at.id) + step; i >= 0 && i < ids.length; i += step) {
		const f = fields(ids[i])
		if (f.length) return { id: ids[i], field: back ? f[f.length - 1] : f[0] }
	}
	return null
}

/** Editing a cell in place, the same in every table (the patch list's way): a click selects the row; double-click,
 *  or F2 / Enter on the selected row, edits a cell; in the box Enter / Shift+Enter save and go to the same column on
 *  the next / previous row, Tab / Shift+Tab to the next / previous cell, Esc cancels, leaving the box saves. Not
 *  editing, the table has the keys (↑ / ↓, Ctrl+C). */
export class CellEdit<F extends string = string> {
	at = $state<CellAt<F> | null>(null)
	#fields: (id: string) => F[]
	#ids: () => string[]
	#save: (id: string, field: F, value: string) => void
	/** `fields(id)`: the row's editable cells, in column order; `ids()`: the rows shown, in order. */
	constructor(o: { fields: (id: string) => F[]; ids: () => string[]; save: (id: string, field: F, value: string) => void }) {
		this.#fields = o.fields; this.#ids = o.ids; this.#save = o.save
	}
	is = (id: string, field: F): boolean => this.at?.id === id && this.at.field === field
	/** A double-click on a cell. */
	start = (id: string, field: F, e?: Event): void => {
		e?.stopPropagation()
		if (this.#fields(id).includes(field)) this.at = { id, field }
	}
	/** F2 / Enter on the table, nothing being edited: the first editable cell of the (first) selected row. */
	tableKey(e: KeyboardEvent, selection: string[]): boolean {
		if ((e.key !== 'F2' && e.key !== 'Enter') || this.at || e.ctrlKey || e.metaKey || e.altKey || typing(e)) return false
		// Enter on a focused button (the bar's, a sorting header, ⋯) presses it
		if (typeof Element !== 'undefined' && e.target instanceof Element && e.target.closest('button, a, summary')) return false
		const sel = new Set(selection), id = this.#ids().find((x) => sel.has(x)), f = id ? this.#fields(id)[0] : undefined
		if (!id || !f) return false
		this.at = { id, field: f }
		return true
	}
	/** A key in the cell's box. When the editing ends the table gets the focus back (↑ / ↓ go on from there). */
	key = (e: KeyboardEvent, id: string, field: F): void => {
		e.stopPropagation()
		if (composing(e)) return   // Enter / Esc commit / cancel the IME's conversion, not the cell
		const box = e.currentTarget as HTMLInputElement | HTMLSelectElement, grid = box.closest<HTMLElement>('[role="grid"]')
		if (e.key === 'Escape') { e.preventDefault(); this.at = null; grid?.focus(); return }
		if (e.key !== 'Enter' && e.key !== 'Tab') return
		e.preventDefault()
		const at = this.at
		this.at = null   // first: the blur that the focus move causes mustn't save it again
		this.#save(id, field, box.value)
		this.at = at && nextCell(at, this.#ids(), this.#fields, e.key === 'Tab', e.shiftKey)
		if (!this.at) grid?.focus()
	}
	/** Leaving the box saves it — only while it's still the cell being edited. */
	blur = (id: string, field: F, value: string): void => {
		if (!this.is(id, field)) return
		this.at = null
		this.#save(id, field, value)
	}
}

/** `use:focusCell` on a cell's box: focused (and its text selected) when it opens. */
export const focusCell = (el: HTMLElement): void => { el.focus(); if (el instanceof HTMLInputElement) el.select() }
