// Sheet actions shared by the Navigator, the register and Properties (sheets-organising slice 3).
import type { CadProject } from './project.svelte'
import type { Sheet } from '../domain/drawing'
import type { Shape } from '../domain/shapes'
import type { Id, Level } from '../domain/types'
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
	const s = project.index.get<Sheet>(sheetId)
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
	const sheet = ws.selection.length === 1 ? project.index.get<Sheet>(ws.selection[0]) : undefined
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

/** Put a view on a sheet (backlog "A sheet from the current view", split out of ViewCanvas): a viewport centred on
 *  `visible` (what the pane shows), at the largest standard scale it fits at, on a new sheet (`target` 'new') or that
 *  sheet; one undo step, the sheet selected with the new viewport picked. The sheet and the viewport. */
export function viewToSheet(project: CadProject, ws: Workspace, view: { levelId: Id; spec: Exclude<ViewSpec, { kind: 'sheet' }> }, visible: Bounds, target: string): { sheet: Sheet; vpId: Id; scale: number } | null {
	const sheets = (project.store.ofType('sheet') as Sheet[]).filter((s) => s.status !== 'archived')
	// a new sheet is named after its view (R7-16, User 2026-10-16: it was "New sheet"): "1F plan", "1F north elevation"
	const lv = project.index.nameOf(view.levelId), what = view.spec.kind === 'plan' ? 'plan' : view.spec.kind === 'elevation' ? `${view.spec.dir} elevation` : specLabel(view.spec)
	const title = isPaperKind(view.spec.kind) || view.spec.kind === 'riser' || !lv ? specLabel(view.spec) : `${lv} ${what}`
	const base = target === 'new' ? { ...blankSheet(sheets, newId()), title } : project.index.get<Sheet>(target)
	if (base?.type !== 'sheet') return null
	const vp = viewViewport(project.index, base, view, visible, newId(), { ...project.sheetBase, underlay: project.pdf.placement })   // the floorplans' crop centres a floor's sheet (W18)
	const next = { ...base, viewports: [...base.viewports, vp] }
	project.store.transact(target === 'new' ? `New sheet ${next.number} from this view` : `View onto ${next.number}`, (tx) => tx.put(next))
	ws.select([next.id])
	ws.selectViewport(vp.id)
	return { sheet: next, vpId: vp.id, scale: vp.scale }
}
