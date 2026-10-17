// A PATCH SCHEDULE on paper (backlog "More viewport types"; the old Drawings tool's "Patching" viewport): the patch
// list as the Excel export has it (render/exports.ts patchScheduleRows — the same cords, order and cells), drawn as a
// ruled table of text in paper mm at 1:1, from (0, 0), y down. Grouped by status in work order (remove → installed).
// A viewport shows the rows that fit its window and says how many more there are; another viewport carries on from
// a later cord (`start`). Pure; tested in schedule.test.ts.
import type { ProjectIndex } from '../domain/project'
import type { Cord, Id, ProjectSettings } from '../domain/types'
import { cableTypeLabel } from '../domain/cableTypes'
import type { Prim } from './display'
import { cordsForSchedule, patchScheduleRows, STATUS_ORDER, STATUS_TITLE, STATUS_FG } from '../render/exports'

/** Text size, line height and cell padding (paper mm); a column is never wider than MAX_W. */
const SIZE = 2.2, ROW = 4, PAD = 1, MAX_W = 45, CHAR = SIZE * 0.6
/** Where the table starts under its title and status counts; the "… more" line's height. */
const TOP = 11, FOOT = 4

/** The columns drawn: the export's cell index and a short header. Face, cord ID, notes and the "was" ends only when
 *  some cord has one (the whole schedule's, so a continued viewport has the same columns). */
const COLS: [number, string][] = [[0, '#'], [1, 'From device'], [2, 'From label'], [3, 'Rack'], [4, 'U'], [5, 'Face'], [6, 'Port'],
	[7, 'To device'], [8, 'To label'], [9, 'Rack'], [10, 'U'], [11, 'Face'], [12, 'Port'], [13, 'Type'], [14, 'm'], [15, 'Cord ID'], [17, 'Notes'], [18, 'Was from'], [19, 'Was to']]
const OPTIONAL = new Set([5, 11, 15, 17, 18, 19])

export interface ScheduleOpts {
	/** The height (mm) the table may take (a viewport's window); none = every row. */
	fit?: number
}

/** The schedule's title: "Patch schedule · IDF-A" (every room: "Patch schedule"). */
export function scheduleTitle(ix: ProjectIndex, spaceId?: Id): string {
	return `Patch schedule${spaceId ? ` · ${ix.nameOf(spaceId) || '(room gone)'}` : ''}`
}

type Line = { kind: 'head'; status: Cord['status']; n: number } | { kind: 'row'; status: Cord['status']; cells: string[] }

export function patchScheduleDisplayList(ix: ProjectIndex, spaceId: Id | undefined, start = 1, o: ScheduleOpts = {}): Prim[] {
	return patchScheduleLayout(ix, spaceId, start, o).prims
}

/** The schedule drawn from cord `start`, and `next`: the cord # the next viewport carries on from (none = everything is shown;
 *  `rows + 1` when `start` is already past the end). */
export function patchScheduleLayout(ix: ProjectIndex, spaceId: Id | undefined, start = 1, o: ScheduleOpts = {}): { prims: Prim[]; next?: number } {
	const st = ix.getOf('settings', 'settings')
	const typeLabel = (id: string) => cableTypeLabel(st?.type === 'settings' ? st : undefined, id)
	const rows = patchScheduleRows(ix, cordsForSchedule(ix, spaceId), typeLabel).map((r) => ({ status: r.status, cells: r.cells.map(String) }))
	const out: Prim[] = [{ k: 'text', at: { x: 0, y: 4 }, text: scheduleTitle(ix, spaceId), size: 3.5, cls: 'legend-title' }]
	if (!rows.length) { out.push({ k: 'text', at: { x: 0, y: 9 }, text: 'No patch cords', size: 2.5, cls: 'legend-text' }); return { prims: out } }
	const count = (s: Cord['status']) => rows.filter((r) => r.status === s).length
	out.push({ k: 'text', at: { x: 0, y: 8.5 }, text: STATUS_ORDER.filter(count).map((s) => `${count(s)} ${s}`).join(' · '), size: 2.5, cls: 'legend-text' })

	// the columns, each as wide as its longest text (capped)
	const cols = COLS.filter(([i]) => !OPTIONAL.has(i) || rows.some((r) => r.cells[i]))
	const widths = cols.map(([i, h]) => Math.min(MAX_W, Math.max(h.length, ...rows.map((r) => r.cells[i].length)) * CHAR + 2 * PAD))
	const xs = widths.reduce<number[]>((a, w) => [...a, a[a.length - 1] + w], [0]), W = xs[xs.length - 1]
	const fitText = (t: string, w: number) => { const n = Math.floor((w - 2 * PAD) / CHAR); return t.length > n ? `${t.slice(0, Math.max(1, n - 1))}…` : t }

	// the lines from cord `start` on: each status group's heading, then its cords
	const from = Math.max(0, Math.round(start) - 1), lines: Line[] = []   // past the end: nothing left to show
	for (const s of STATUS_ORDER) {
		const group = rows.map((r, i) => ({ r, i })).filter((x) => x.r.status === s && x.i >= from)
		if (!group.length) continue
		lines.push({ kind: 'head', status: s, n: count(s) })
		for (const { r } of group) lines.push({ kind: 'row', status: s, cells: r.cells })
	}
	// all of it when it fits, else what fits above the "… more" line
	const room = o.fit === undefined || TOP + ROW * (1 + lines.length) <= o.fit ? Infinity : Math.max(2, Math.floor((o.fit - TOP - ROW - FOOT) / ROW))
	let shown = lines.length <= room ? lines : lines.slice(0, room)
	if (shown.at(-1)?.kind === 'head') shown = shown.slice(0, -1)   // a heading with none of its cords: on the next viewport
	const drawn = shown.filter((l) => l.kind === 'row').length, more = lines.filter((l) => l.kind === 'row').length - drawn

	const rule = (y: number): Prim => ({ k: 'line', pts: [{ x: 0, y }, { x: W, y }], cls: 'legend-rule' })
	const bottom = TOP + ROW * (1 + shown.length)
	out.push({ k: 'line', pts: [{ x: 0, y: TOP }, { x: W, y: TOP }, { x: W, y: bottom }, { x: 0, y: bottom }], closed: true, cls: 'legend' })
	cols.forEach(([, h], c) => out.push({ k: 'text', at: { x: xs[c] + PAD, y: TOP + ROW - 1.1 }, text: h, size: SIZE, cls: 'legend-title' }))
	// column rules down each run of cord rows (not through the status headings, which span the table)
	let y = TOP + ROW, runTop = y
	if (!lines.length) out.push({ k: 'text', at: { x: PAD, y: y + ROW - 1.1 }, text: 'All cords are shown in the viewports before this one', size: SIZE, cls: 'legend-text' })
	const colRules = (y0: number, y1: number) => { if (y1 > y0) for (const x of xs.slice(1, -1)) out.push({ k: 'line', pts: [{ x, y: y0 }, { x, y: y1 }], cls: 'legend-rule' }) }
	colRules(TOP, y)
	for (const l of shown) {
		out.push(rule(y))
		if (l.kind === 'head') {
			colRules(runTop, y)
			out.push({ k: 'text', at: { x: PAD, y: y + ROW - 1.1 }, text: `${STATUS_TITLE[l.status]}  (${l.n})`, size: SIZE, cls: 'legend-title', color: `#${STATUS_FG[l.status].slice(2).toLowerCase()}` })
			runTop = y + ROW
		} else cols.forEach(([i], c) => { if (l.cells[i]) out.push({ k: 'text', at: { x: xs[c] + PAD, y: y + ROW - 1.1 }, text: fitText(l.cells[i], widths[c]), size: SIZE, cls: 'legend-text' }) })
		y += ROW
	}
	colRules(runTop, y)
	let next: number | undefined = from >= rows.length ? rows.length + 1 : undefined
	if (more) {
		next = Number(lines.filter((l) => l.kind === 'row')[drawn]?.cells[0] ?? 0)
		out.push({ k: 'text', at: { x: 0, y: bottom + FOOT - 0.5 }, text: `… ${more} more cord${more === 1 ? '' : 's'}: from #${next} in another viewport (Properties › Continue from)`, size: 2.5, cls: 'legend-text' })
	}
	return { prims: out, next }
}
