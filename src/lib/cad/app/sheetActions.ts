// Sheet actions shared by the Navigator, the register and Properties (sheets-organising slice 3).
import type { CadProject } from './project.svelte'
import type { Sheet } from '../domain/drawing'
import type { Shape } from '../domain/shapes'
import type { Id, Level, RackRow } from '../domain/types'
import { duplicateSheet, numberFrom, sheetsFromTemplate, templateOf, type SheetTarget } from '../domain/sheetEdit'
import { printOrder } from '../domain/sheetList'
import { newId } from '../domain/ids'
import type { Workspace } from './workspace.svelte'
import { specLabel, isPaperKind, type ViewSpec } from '../views/space'
import type { Bounds } from '../views/display'
import { blankSheet, viewViewport, fitViewport } from '../views/sheet'
import { makeViewportClip, pasteClip, type Pasted } from '../domain/clipboard'

/** Duplicate these sheets (with their viewports and paper notes; no number, no revisions, each after its original),
 *  one undo step; the copies' ids. */
export function duplicateSheets(project: CadProject, ids: Id[]): Id[] {
	const sheets = ids.map((id) => project.index.get(id)).filter((s): s is Sheet => s?.type === 'sheet')
	if (!sheets.length) return []
	const shapes = project.store.ofType('shape') as Shape[]
	const made = sheets.map((s) => duplicateSheet(s, shapes, newId))
	project.store.transact(sheets.length === 1 ? `Duplicate ${sheets[0].number || sheets[0].title}` : `Duplicate ${sheets.length} sheets`, (tx) => { for (const d of made) { tx.put(d.sheet); for (const n of d.notes) tx.put(n) } })
	return made.map((d) => d.sheet.id)
}

/** "A copy for each floor / server room" (W19): this sheet as the template, one copy per other floor (or server room)
 *  that has none from it yet — viewports re-pointed (a room's rack views fitted to its racks), titled and numbered on
 *  from it — one undo step. The copies' ids. */
export function sheetsForEach(project: CadProject, sheetId: Id, kind: 'level' | 'room'): Id[] {
	const s = project.index.getOf('sheet', sheetId)
	if (s?.type !== 'sheet') return []
	const tpl = templateOf(s), ix = project.index
	const levels = (ix.ofType('level') as Level[]).filter((l) => !l.area).sort((a, b) => a.number - b.number)
	const rooms = ix.spaces.filter((x) => x.kind === 'server room')
	const targets: SheetTarget[] = kind === 'level'
		? levels.map((l) => ({ kind, id: l.id, levelId: l.id, name: l.name, number: l.number }))
		: rooms.map((r) => ({ kind, id: r.id, levelId: r.levelId, name: r.name }))
	const fromLevel = levels.find((l) => l.id === tpl.levelId), fromRoom = rooms.find((r) => r.id === tpl.spaceId)
	const from = kind === 'level' ? { name: fromLevel?.name ?? '', number: fromLevel?.number } : { name: fromRoom?.name ?? '' }
	const sheets = project.store.ofType('sheet') as Sheet[]
	const out = sheetsFromTemplate(s, project.store.ofType('shape') as Shape[], targets, from, new Set(sheets.map((x) => x.number).filter(Boolean)), sheets, newId)
	// a room's rack views: fitted to ITS racks (another room's racks are elsewhere in the row view)
	for (const o of out) o.sheet.viewports = o.sheet.viewports.map((v) => (kind === 'room' && v.view.spec.kind === 'row' && (v.view.spec as { spaceId?: Id }).spaceId !== tpl.spaceId ? { ...v, ...fitViewport(ix, v, project.sheetBase) } : v))
	if (out.length) project.store.transact(`${out.length} sheet${out.length === 1 ? '' : 's'} from ${s.number || s.title}`, (tx) => { for (const o of out) { tx.put(o.sheet); for (const n of o.notes) tx.put(n) } })
	return out.map((o) => o.sheet.id)
}

/** What a viewport paste says after it: the sheet selected with the new viewports picked. */
export function pickPasted(ws: Workspace, r: Pasted): void {
	if (!r.viewports?.length) { ws.select(r.select); return }
	ws.select(r.select); ws.selectViewports(r.viewports)
	const n = r.viewports.length
	ws.say(`${n === 1 ? 'Viewport' : `${n} viewports`} pasted${r.reset ? ` — ${r.reset === 1 ? 'its' : 'their'} level or view isn’t in this project, so ${r.reset === 1 ? 'it shows' : 'they show'} a plan: Fit in Properties` : ''} · Undo takes ${n === 1 ? 'it' : 'them'} off`)
}

/** Ctrl+D: a copy of the picked viewports (with their views and tied notes) a little to one side on the same sheet,
 *  one undo step; the copies are picked. False = no viewport is picked. */
export function duplicateViewports(project: CadProject, ws: Workspace): boolean {
	const sheet = ws.selection.length === 1 ? project.index.getOf('sheet', ws.selection[0]) : undefined
	const clip = sheet?.type === 'sheet' ? makeViewportClip(project.index, sheet.id, ws.pickedViewports, project.pid) : null
	if (!sheet || !clip) return false
	const r = pasteClip(clip, { pid: project.pid, ix: project.index, to: { kind: 'sheet', id: sheet.id } })
	project.store.transact(`Duplicate ${clip.viewports!.length === 1 ? 'viewport' : `${clip.viewports!.length} viewports`}`, (tx) => r.put.forEach((x) => tx.put(x)))
	pickPasted(ws, r)
	return true
}

/** Number these sheets in print order from a pattern ("RE-01" → RE-01, RE-02 …), one undo step. */
export function numberSheets(project: CadProject, ids: Id[], pattern: string): number {
	const sheets = printOrder(ids.map((id) => project.index.get(id)).filter((s): s is Sheet => s?.type === 'sheet'))
	const nums = numberFrom(pattern, sheets.length)
	const changed = sheets.map((s, i) => ({ ...s, number: nums[i] })).filter((s, i) => s.number !== sheets[i].number)
	if (changed.length) project.store.transact(`Number ${sheets.length} sheets from ${nums[0]}`, (tx) => { for (const s of changed) tx.put(s) })
	return changed.length
}

/** A rack sheet's title: "1F MDF Row A front", two rows "1F MDF Rows A–B front" (rows named "Row X"), else
 *  "1F MDF Row A + Hot aisle front"; no row: the room's racks. */
export function rowSheetTitle(project: CadProject, levelId: Id, spaceId: Id, rowIds: (Id | undefined)[], face: string): string {
	const ix = project.index, names = rowIds.map((r) => (r ? ix.nameOf(r) : 'racks'))
	const tags = names.map((n) => /^Row\s+(\S+)$/i.exec(n)?.[1])
	const rows = names.length === 2 && tags.every(Boolean) ? `Rows ${tags[0]}–${tags[1]}` : names.join(' + ')
	return [ix.nameOf(levelId), ix.nameOf(spaceId), rows, face].filter(Boolean).join(' ')
}

/** "Rows on sheets" (User 2026-10-17): every row of a server room on sheets, two rows a sheet side by side, the
 *  fronts then the rears, titled "1F MDF Rows A–B front" and numbered on — one undo step. A room without rows: its
 *  racks, front and rear. The new sheets' ids. */
export function roomRowsToSheets(project: CadProject, ws: Workspace, spaceId: Id): Id[] {
	const ix = project.index, room = ix.get(spaceId)
	if (room?.type !== 'space') return []
	const rows = (ix.ofType('rackRow') as RackRow[]).filter((r) => r.spaceId === spaceId && ix.racks.some((k) => k.rowId === r.id)).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
	const groups: (Id | undefined)[][] = rows.length ? Array.from({ length: Math.ceil(rows.length / 2) }, (_, i) => rows.slice(2 * i, 2 * i + 2).map((r) => r.id)) : [[undefined]]
	if (!ix.racks.some((k) => k.spaceId === spaceId)) { ws.say(`${room.name} has no racks yet`); return [] }
	const sheets = (project.store.ofType('sheet') as Sheet[]).filter((s) => s.status !== 'archived'), made: Sheet[] = []
	const o = { ...project.sheetBase, underlay: project.pdf.placement }
	for (const face of ['front', 'rear'] as const) for (const g of groups) {
		let sh: Sheet = { ...blankSheet([...sheets, ...made], newId()), title: rowSheetTitle(project, room.levelId, spaceId, g, face) }
		for (const rowId of g) {
			const view = { levelId: room.levelId, spec: { kind: 'row' as const, spaceId, face, ...(rowId ? { rowId } : {}) } }
			sh = { ...sh, viewports: [...sh.viewports, viewViewport(ix, sh, view, { x0: 0, y0: 0, x1: 1, y1: 1 }, newId(), o)] }
		}
		made.push(sh)
	}
	project.store.transact(`${made.length} rack sheets for ${room.name}`, (tx) => { for (const s of made) tx.put(s) })
	ws.say(`${made.length} sheets: ${made.map((s) => `${s.number} ${s.title}`).join(' · ')} — Undo takes them off`)
	return made.map((s) => s.id)
}

/** Put a view on a sheet (backlog "A sheet from the current view", split out of ViewCanvas): a viewport centred on
 *  `visible` (what the pane shows), at the largest standard scale it fits at, on a new sheet (`target` 'new') or that
 *  sheet; one undo step, the sheet selected with the new viewport picked. The sheet and the viewport. */
export function viewToSheet(project: CadProject, ws: Workspace, view: { levelId: Id; spec: Exclude<ViewSpec, { kind: 'sheet' }> }, visible: Bounds, target: string): { sheet: Sheet; vpId: Id; scale: number } | null {
	const sheets = (project.store.ofType('sheet') as Sheet[]).filter((s) => s.status !== 'archived')
	// a new sheet is named after its view (R7-16, User 2026-10-16: it was "New sheet"): "1F plan", "1F north elevation"
	const lv = project.index.nameOf(view.levelId), what = view.spec.kind === 'plan' ? 'plan' : view.spec.kind === 'elevation' ? `${view.spec.dir} elevation` : view.spec.kind === 'section' ? project.index.nameOf(view.spec.sectionId) || 'section'
		// a rack view: its room and row (Round 9: "1F Racks front" said neither)
		: view.spec.kind === 'row' ? [project.index.nameOf(view.spec.spaceId), view.spec.rowId ? project.index.nameOf(view.spec.rowId) : 'racks', view.spec.face].filter(Boolean).join(' ')
		: specLabel(view.spec)
	const title = isPaperKind(view.spec.kind) || view.spec.kind === 'riser' || !lv ? specLabel(view.spec) : `${lv} ${what}`
	const base = target === 'new' ? { ...blankSheet(sheets, newId()), title } : project.index.getOf('sheet', target)
	if (base?.type !== 'sheet') return null
	const vp = viewViewport(project.index, base, view, visible, newId(), { ...project.sheetBase, underlay: project.pdf.placement })   // the floorplans' crop centres a floor's sheet (W18)
	// a second row of the same room and face onto a sheet still titled after the first: "Rows A–B" (Round 9)
	let retitle = base.title
	const one = base.viewports.length === 1 ? base.viewports[0].view : null, s = view.spec
	if (one && one.spec.kind === 'row' && s.kind === 'row' && one.spec.spaceId === s.spaceId && one.spec.face === s.face && one.spec.rowId !== s.rowId
		&& base.title === rowSheetTitle(project, one.levelId, s.spaceId, [one.spec.rowId], s.face)) retitle = rowSheetTitle(project, one.levelId, s.spaceId, [one.spec.rowId, s.rowId], s.face)
	const next = { ...base, title: retitle, viewports: [...base.viewports, vp] }
	project.store.transact(target === 'new' ? `New sheet ${next.number} from this view` : `View onto ${next.number}`, (tx) => tx.put(next))
	ws.select([next.id])
	ws.selectViewport(vp.id)
	return { sheet: next, vpId: vp.id, scale: vp.scale }
}
