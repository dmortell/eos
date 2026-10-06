// The SHEET REGISTER (Phase 4.4 — ported from Pages' store/drawingList.ts): register rows for the project's sheets,
// text / status filters, natural sorting, grouping (renumbering is the shared Renumber, domain/renumber.ts). Pure;
// tested in sheetList.test.ts. The UI is ui/SheetsTab.svelte; the Excel export is render/sheetList.ts.
import type { Sheet } from './drawing'
import type { ProjectIndex } from './project'
import type { Level, Space } from './types'
import { categoryOf, DEFAULT_SHEET_CATEGORIES, type SheetCategory } from './sheetCategories'

export type SheetRow = {
	id: string; number: string; title: string; place: string; kind: string; discipline: string; tags: string[]
	/** Its place in the print order ("1", "2" …; backlog "Print order"): the PDF follows the table, so sort by this to print in it. */
	order: string
	status: Sheet['status']; rev: string; size: string; scale: string; viewports: number
	/** Every issued revision, oldest first (the Excel's date-per-revision columns). */
	revisions: { code: string; date: string }[]
	/** Its category (sheets-organising §1): its own, else derived from its viewports (`categoryAuto`). */
	category: string; categoryId: string; categoryAuto: boolean; categoryOrder: number
	/** The levels it shows (its place's, else its viewports'), in level order — and the first one's order, to sort by. */
	level: string; levelIds: string[]; levelOrders: number[]; levelOrder: number
	/** The server rooms it shows: its place when that is a room, else its rack-row viewports' rooms. */
	room: string; roomIds: string[]
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

/** The levels and rooms a sheet shows: its place (a level, or a room on a level), else what its viewports show (a
 *  building-wide riser view says nothing about one level). */
export function sheetPlaces(ix: ProjectIndex, s: Sheet): { levels: Level[]; rooms: Space[] } {
	const at = s.placeId ? ix.get(s.placeId) : undefined
	const lv = (id: string | undefined) => { const l = id ? ix.get(id) : undefined; return l?.type === 'level' ? l : undefined }
	let levels: (Level | undefined)[], rooms: (Space | undefined)[]
	if (at?.type === 'level') { levels = [at]; rooms = [] }
	else if (at?.type === 'space') { levels = [lv(at.levelId)]; rooms = [at] }
	else {
		levels = s.viewports.filter((v) => v.view.spec.kind !== 'riser').map((v) => lv(v.view.levelId))
		rooms = s.viewports.map((v) => { if (v.view.spec.kind !== 'row') return undefined; const r = ix.get(v.view.spec.spaceId); return r?.type === 'space' ? r : undefined })
	}
	const uniq = <T extends { id: string }>(xs: (T | undefined)[]) => [...new Map(xs.filter((x): x is T => !!x).map((x) => [x.id, x])).values()]
	return { levels: uniq(levels).sort((a, b) => a.order - b.order), rooms: uniq(rooms).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })) }
}

export function sheetRows(ix: ProjectIndex, sheets: Sheet[], cats: SheetCategory[] = DEFAULT_SHEET_CATEGORIES): SheetRow[] {
	const pos = new Map(printOrder(sheets).map((s, i) => [s.id, String(i + 1)]))
	return sheets.map((s) => {
		const cat = categoryOf(s, cats), { levels, rooms } = sheetPlaces(ix, s)
		const scales = [...new Set(s.viewports.map((v) => v.scale))]
		// filed under its place, else the levels its viewports show
		const place = s.placeId ? ix.nameOf(s.placeId) : [...new Set(s.viewports.map((v) => ix.nameOf(v.view.levelId)).filter(Boolean))].join(' / ')
		return {
			id: s.id, order: pos.get(s.id)!, number: s.number, title: s.title, place, kind: s.kind ?? '', discipline: s.discipline ?? '', tags: s.tags ?? [], status: s.status,
			rev: s.revisions?.at(-1)?.code ?? '', size: `${s.paper.size} ${s.paper.orientation === 'landscape' ? 'L' : 'P'}`,
			scale: scales.length === 1 ? `1:${scales[0]}` : scales.length ? 'As shown' : '', viewports: s.viewports.length,
			revisions: (s.revisions ?? []).map((r) => ({ code: r.code, date: r.date })),
			category: cat.label, categoryId: cat.id, categoryAuto: cat.auto, categoryOrder: cat.order,
			level: levels.map((l) => l.name).join(' / '), levelIds: levels.map((l) => l.id), levelOrders: levels.map((l) => l.order), levelOrder: levels[0]?.order ?? 1e6,
			room: rooms.map((r) => r.name).join(' / '), roomIds: rooms.map((r) => r.id),
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

/** The register's filter: text, status, and the CHIPS — categories, levels, rooms, tags (any of the picked values
 *  in one chip, every chip that has picks). */
export type ListFilter = { q?: string; status?: Sheet['status']; cats?: string[]; levels?: string[]; rooms?: string[]; tags?: string[] }
export function filterRows(rows: SheetRow[], f: ListFilter): SheetRow[] {
	const q = f.q?.trim().toLowerCase()
	const any = (picked: string[] | undefined, have: string[]) => !picked?.length || have.some((x) => picked.includes(x))
	return rows.filter((r) => (!f.status || r.status === f.status)
		&& any(f.cats, [r.categoryId]) && any(f.levels, r.levelIds) && any(f.rooms, r.roomIds) && any(f.tags, r.tags)
		&& (!q || [r.number, r.title, r.place, r.kind, r.category, r.level, r.room, r.discipline, ...r.tags].join(' ').toLowerCase().includes(q)))
}

export type SortKey = 'order' | 'number' | 'title' | 'place' | 'kind' | 'category' | 'level' | 'room' | 'discipline' | 'rev' | 'size' | 'scale'
/** Natural order ("S2" before "S10"); blanks last either way. Category sorts in the list's order, level in level order
 *  (B1, 1F, 2F — not by name). */
export function sortRows(rows: SheetRow[], key: SortKey, dir: 1 | -1 = 1): SheetRow[] {
	const cmp = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
	const rank = key === 'category' ? (r: SheetRow) => r.categoryOrder : key === 'level' ? (r: SheetRow) => r.levelOrder : null
	return [...rows].sort((a, b) => {
		const x = a[key], y = b[key]
		if (!x !== !y) return x ? -1 : 1
		return dir * ((rank ? rank(a) - rank(b) : 0) || cmp.compare(x, y)) || cmp.compare(a.number, b.number) || cmp.compare(a.title, b.title)
	})
}

export type GroupBy = 'none' | 'category' | 'level' | 'room' | 'place' | 'discipline' | 'tag' | 'size'
export type RowGroup = { key: string; label: string; rows: SheetRow[] }
/** Groups in first-seen order of the (already sorted) rows — categories in the list's order, levels in level order;
 *  by tag / level / room a row appears under each of its own. */
export function groupRows(rows: SheetRow[], by: GroupBy): RowGroup[] {
	if (by === 'none') return [{ key: '', label: '', rows }]
	const out = new Map<string, RowGroup & { rank: number }>()
	const put = (key: string, label: string, r: SheetRow, rank = 0) => { const g = out.get(key) ?? { key, label, rows: [], rank }; g.rows.push(r); out.set(key, g) }
	for (const r of rows) {
		const many = (keys: string[], names: string[], none: string, ranks: number[] = []) => { if (!keys.length) put('', none, r); keys.forEach((k, i) => put(k, names[i], r, ranks[i] ?? 0)) }
		if (by === 'tag') many(r.tags, r.tags, '(no tag)')
		else if (by === 'level') many(r.levelIds, r.level.split(' / '), '(no level)', r.levelOrders)
		else if (by === 'room') many(r.roomIds, r.room.split(' / '), '(no room)')
		else if (by === 'category') put(r.categoryId, r.category, r, r.categoryOrder)
		else { const v = by === 'place' ? r.place : by === 'discipline' ? r.discipline : r.size; put(v, v || `(no ${by})`, r) }
	}
	const list = [...out.values()]
	if (by === 'category' || by === 'level') list.sort((a, b) => a.rank - b.rank)
	return list.sort((a, b) => (!a.key !== !b.key ? (a.key ? -1 : 1) : 0)).map(({ rank: _, ...g }) => g)   // the "(no …)" group last
}
