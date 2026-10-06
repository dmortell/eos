// Sheet actions shared by the Navigator, the register and Properties (sheets-organising slice 3).
import type { CadProject } from './project.svelte'
import type { Sheet } from '../domain/drawing'
import type { Shape } from '../domain/shapes'
import type { Id } from '../domain/types'
import { duplicateSheet, numberFrom } from '../domain/sheetEdit'
import { printOrder } from '../domain/sheetList'
import { newId } from '../domain/ids'
import type { Workspace } from './workspace.svelte'
import type { ViewSpec } from '../views/space'
import type { Bounds } from '../views/display'
import { blankSheet, viewViewport } from '../views/sheet'

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
	const base = target === 'new' ? blankSheet(sheets, newId()) : project.index.get<Sheet>(target)
	if (base?.type !== 'sheet') return null
	const vp = viewViewport(project.index, base, view, visible, newId(), { projectName: project.name, template: project.settings?.titleBlock })
	const next = { ...base, viewports: [...base.viewports, vp] }
	project.store.transact(target === 'new' ? `New sheet ${next.number} from this view` : `View onto ${next.number}`, (tx) => tx.put(next))
	ws.select([next.id])
	ws.selectViewport(vp.id)
	return { sheet: next, vpId: vp.id, scale: vp.scale }
}
