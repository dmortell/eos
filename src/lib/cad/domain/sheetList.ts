// The SHEET REGISTER (Phase 4.4 — ported from Pages' store/drawingList.ts): register rows for the project's sheets,
// text / status filters, natural sorting, grouping, and RENUMBER patterns. Pure; tested in sheetList.test.ts. The UI
// is ui/SheetsTab.svelte; the Excel export is render/sheetList.ts.
import type { Sheet } from './drawing'
import type { ProjectIndex } from './project'

export type SheetRow = {
	id: string; number: string; title: string; place: string; kind: string; discipline: string; tags: string[]
	status: Sheet['status']; rev: string; size: string; scale: string; viewports: number
}

export function sheetRows(ix: ProjectIndex, sheets: Sheet[]): SheetRow[] {
	return sheets.map((s) => {
		const scales = [...new Set(s.viewports.map((v) => v.scale))]
		// filed under its place, else the levels its viewports show
		const place = s.placeId ? ix.nameOf(s.placeId) : [...new Set(s.viewports.map((v) => ix.nameOf(v.view.levelId)).filter(Boolean))].join(' / ')
		return {
			id: s.id, number: s.number, title: s.title, place, kind: s.kind ?? '', discipline: s.discipline ?? '', tags: s.tags ?? [], status: s.status,
			rev: s.revisions?.at(-1)?.code ?? '', size: `${s.paper.size} ${s.paper.orientation === 'landscape' ? 'L' : 'P'}`,
			scale: scales.length === 1 ? `1:${scales[0]}` : scales.length ? 'As shown' : '', viewports: s.viewports.length,
		}
	})
}

export type ListFilter = { q?: string; status?: Sheet['status'] }
export function filterRows(rows: SheetRow[], f: ListFilter): SheetRow[] {
	const q = f.q?.trim().toLowerCase()
	return rows.filter((r) => (!f.status || r.status === f.status)
		&& (!q || [r.number, r.title, r.place, r.kind, r.discipline, ...r.tags].join(' ').toLowerCase().includes(q)))
}

export type SortKey = 'number' | 'title' | 'place' | 'kind' | 'discipline' | 'rev' | 'size' | 'scale'
/** Natural order ("S2" before "S10"); blanks last either way. */
export function sortRows(rows: SheetRow[], key: SortKey, dir: 1 | -1 = 1): SheetRow[] {
	const cmp = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
	return [...rows].sort((a, b) => {
		const x = a[key], y = b[key]
		if (!x !== !y) return x ? -1 : 1
		return dir * cmp.compare(x, y) || cmp.compare(a.title, b.title)
	})
}

export type GroupBy = 'none' | 'place' | 'kind' | 'discipline' | 'tag' | 'size'
export type RowGroup = { key: string; label: string; rows: SheetRow[] }
/** Groups in first-seen order of the (already sorted) rows; by tag, a row appears under each of its tags. */
export function groupRows(rows: SheetRow[], by: GroupBy): RowGroup[] {
	if (by === 'none') return [{ key: '', label: '', rows }]
	const out = new Map<string, RowGroup>()
	const put = (key: string, label: string, r: SheetRow) => { const g = out.get(key) ?? { key, label, rows: [] }; g.rows.push(r); out.set(key, g) }
	for (const r of rows) {
		if (by === 'tag') { if (!r.tags.length) put('', '(no tag)', r); for (const t of r.tags) put(t, t, r); continue }
		const v = by === 'place' ? r.place : by === 'kind' ? r.kind : by === 'discipline' ? r.discipline : r.size
		put(v, v || `(no ${by})`, r)
	}
	return [...out.values()].sort((a, b) => (!a.key !== !b.key ? (a.key ? -1 : 1) : 0))   // the "(no …)" group last
}

/** `count` sheet numbers from `start` by `pattern`: `{n}` = the number, `{n:3}` = zero-padded to 3 ("S{n:3}" from 7 →
 *  S007, S008 …). A pattern without `{n…}` gets the number appended. */
export function renumber(count: number, start: number, pattern: string): string[] {
	const p = /\{n(?::(\d+))?\}/.test(pattern) ? pattern : `${pattern}{n}`
	return Array.from({ length: count }, (_, i) => p.replace(/\{n(?::(\d+))?\}/g, (_m, w) => String(start + i).padStart(w ? +w : 0, '0')))
}
