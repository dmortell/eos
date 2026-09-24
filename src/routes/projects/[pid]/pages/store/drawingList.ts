// The DRAWING MANAGEMENT dialog's data (drawings-plan §5, phase 6): sheet rows with their place path,
// filtering / grouping / sorting, bulk RENUMBER patterns, and which sheets + frames use each model (and
// which frames show a Missing model). Pure; tested in drawingList.test.ts. The dialog is
// parts/DrawingsDialog.svelte; the Excel export is drawingListExport.ts.
import type { PagesSheetDoc, Place } from './schema'
import { ancestorsOf } from './places'

export type SheetRow = {
	id: string; number: string; title: string; placeId: string | null; placePath: string
	kind: string; discipline: string; tags: string[]; status: PagesSheetDoc['status']
	rev: string; size: string; scale: string; updatedAt: string; frames: number
}

export function placePath(places: Place[], id: string | null): string {
	const p = id ? places.find((x) => x.id === id) : undefined
	return p ? [...ancestorsOf(places, p.id), p].map((x) => x.name).join(' › ') : ''
}

export function sheetRows(sheets: PagesSheetDoc[], places: Place[]): SheetRow[] {
	return sheets.map((s) => ({
		id: s.id, number: s.drawingNumber ?? '', title: s.title, placeId: s.placeId, placePath: placePath(places, s.placeId),
		kind: s.kind ?? '', discipline: s.discipline ?? '', tags: s.tags ?? [], status: s.status,
		rev: s.latestRevisionCode ?? '', size: s.paper ? `${s.paper.size} ${s.paper.landscape ? 'L' : 'P'}` : s.sheetSize ?? '',
		scale: s.frames?.[0]?.scale ?? s.scale ?? '', updatedAt: s.updatedAt ?? '', frames: s.frames?.length ?? 0,
	}))
}

export type ListFilter = { q?: string; kind?: string; discipline?: string; tag?: string; status?: PagesSheetDoc['status'] }
export function filterRows(rows: SheetRow[], f: ListFilter): SheetRow[] {
	const q = f.q?.trim().toLowerCase()
	return rows.filter((r) => (!f.status || r.status === f.status) && (!f.kind || r.kind === f.kind) && (!f.discipline || r.discipline === f.discipline)
		&& (!f.tag || r.tags.includes(f.tag))
		&& (!q || [r.number, r.title, r.placePath, r.kind, r.discipline, ...r.tags].join(' ').toLowerCase().includes(q)))
}

export type SortKey = 'number' | 'title' | 'placePath' | 'kind' | 'discipline' | 'rev' | 'size' | 'scale' | 'updatedAt'
/** Natural order ("E-2" before "E-10"); blanks last either way. */
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
		const v = by === 'place' ? r.placePath : by === 'kind' ? r.kind : by === 'discipline' ? r.discipline : r.size
		put(v, v || `(no ${by})`, r)
	}
	return [...out.values()].sort((a, b) => (!a.key !== !b.key ? (a.key ? -1 : 1) : 0))   // the "(no …)" group last
}

/** `count` drawing numbers from `start` by `pattern`: `{n}` = the number, `{n:3}` = zero-padded to 3
 *  ("E-{n:3}" from 7 → E-007, E-008 …). A pattern without `{n…}` gets the number appended. */
export function renumber(count: number, start: number, pattern: string): string[] {
	const p = /\{n(?::(\d+))?\}/.test(pattern) ? pattern : `${pattern}{n}`
	return Array.from({ length: count }, (_, i) => p.replace(/\{n(?::(\d+))?\}/g, (_m, w) => String(start + i).padStart(w ? +w : 0, '0')))
}

export type ModelInfo = { id: string; name: string; placeId?: string; kind?: string; version?: string; archived?: boolean }
export type ModelUse = { sheetId: string; sheetTitle: string; frames: number[] }
/** Per model id: the (live) sheets whose frames show it, with those frames' seq numbers. */
export function modelUsage(sheets: PagesSheetDoc[]): Map<string, ModelUse[]> {
	const out = new Map<string, ModelUse[]>()
	for (const s of sheets) {
		if (s.status === 'archived') continue
		const bySheet = new Map<string, number[]>()
		for (const f of s.frames ?? []) if (f.modelId) bySheet.set(f.modelId, [...(bySheet.get(f.modelId) ?? []), f.seq])
		for (const [mid, frames] of bySheet) out.set(mid, [...(out.get(mid) ?? []), { sheetId: s.id, sheetTitle: s.title, frames }])
	}
	return out
}
/** Frames on live sheets that show a MISSING model (unknown id, or archived). */
export function missingModelFrames(sheets: PagesSheetDoc[], models: ModelInfo[]): { sheetId: string; sheetTitle: string; seq: number; modelId: string }[] {
	const live = new Set(models.filter((m) => !m.archived).map((m) => m.id))
	return sheets.filter((s) => s.status !== 'archived').flatMap((s) => (s.frames ?? [])
		.filter((f) => f.modelId && !live.has(f.modelId)).map((f) => ({ sheetId: s.id, sheetTitle: s.title, seq: f.seq, modelId: f.modelId! })))
}
