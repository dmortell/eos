// The SHEET REGISTER (Phase 4.4 — ported from Pages' store/drawingList.ts): register rows for the project's sheets,
// text / status filters, natural sorting, grouping (renumbering is the shared Renumber, domain/renumber.ts). Pure;
// tested in sheetList.test.ts. The UI is ui/SheetsTab.svelte; the Excel export is render/sheetList.ts.
import type { Sheet } from './drawing'
import type { ProjectIndex } from './project'

export type SheetRow = {
	id: string; number: string; title: string; place: string; kind: string; discipline: string; tags: string[]
	/** Its place in the print order ("1", "2" …; backlog "Print order"): the PDF follows the table, so sort by this to print in it. */
	order: string
	status: Sheet['status']; rev: string; size: string; scale: string; viewports: number
	/** Every issued revision, oldest first (the Excel's date-per-revision columns). */
	revisions: { code: string; date: string }[]
}

/** The sheets in print order: by `order`, then number. */
export const printOrder = (sheets: Sheet[]): Sheet[] =>
	[...sheets].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.number.localeCompare(b.number, undefined, { numeric: true }))

/** Move the `ids` sheets one place earlier (−1) or later (+1) in the print order, as a block that keeps its own
 *  order; every sheet is renumbered 10, 20 … The sheets whose order changed. */
export function moveInPrintOrder(sheets: Sheet[], ids: string[], dir: -1 | 1): Sheet[] {
	const list = printOrder(sheets), sel = new Set(ids)
	const idx = (dir < 0 ? list.map((_, i) => i) : list.map((_, i) => list.length - 1 - i))
	for (const i of idx) {
		const j = i + dir
		if (!sel.has(list[i].id) || j < 0 || j >= list.length || sel.has(list[j].id)) continue
		;[list[i], list[j]] = [list[j], list[i]]
	}
	return list.flatMap((s, i) => ((i + 1) * 10 === s.order ? [] : [{ ...s, order: (i + 1) * 10 }]))
}

export function sheetRows(ix: ProjectIndex, sheets: Sheet[]): SheetRow[] {
	const pos = new Map(printOrder(sheets).map((s, i) => [s.id, String(i + 1)]))
	return sheets.map((s) => {
		const scales = [...new Set(s.viewports.map((v) => v.scale))]
		// filed under its place, else the levels its viewports show
		const place = s.placeId ? ix.nameOf(s.placeId) : [...new Set(s.viewports.map((v) => ix.nameOf(v.view.levelId)).filter(Boolean))].join(' / ')
		return {
			id: s.id, order: pos.get(s.id)!, number: s.number, title: s.title, place, kind: s.kind ?? '', discipline: s.discipline ?? '', tags: s.tags ?? [], status: s.status,
			rev: s.revisions?.at(-1)?.code ?? '', size: `${s.paper.size} ${s.paper.orientation === 'landscape' ? 'L' : 'P'}`,
			scale: scales.length === 1 ? `1:${scales[0]}` : scales.length ? 'As shown' : '', viewports: s.viewports.length,
			revisions: (s.revisions ?? []).map((r) => ({ code: r.code, date: r.date })),
		}
	})
}

/** The register's revision columns: every code issued on these sheets, in the order first issued (P1, P2, C1 …),
 *  each with the date that sheet got it ('' = not issued at that revision). */
export function revisionColumns(rows: SheetRow[]): { code: string; dateOf: (r: SheetRow) => string }[] {
	const first = new Map<string, string>()
	for (const r of rows) for (const v of r.revisions) if (!first.has(v.code) || v.date < first.get(v.code)!) first.set(v.code, v.date)
	return [...first].sort((a, b) => a[1].localeCompare(b[1])).map(([code]) => ({ code, dateOf: (r) => r.revisions.findLast((v) => v.code === code)?.date ?? '' }))
}

export type ListFilter ={ q?: string; status?: Sheet['status'] }
export function filterRows(rows: SheetRow[], f: ListFilter): SheetRow[] {
	const q = f.q?.trim().toLowerCase()
	return rows.filter((r) => (!f.status || r.status === f.status)
		&& (!q || [r.number, r.title, r.place, r.kind, r.discipline, ...r.tags].join(' ').toLowerCase().includes(q)))
}

export type SortKey = 'order' | 'number' | 'title' | 'place' | 'kind' | 'discipline' | 'rev' | 'size' | 'scale'
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
