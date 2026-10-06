// Sheet actions shared by the Navigator, the register and Properties (sheets-organising slice 3).
import type { CadProject } from './project.svelte'
import type { Sheet } from '../domain/drawing'
import type { Shape } from '../domain/shapes'
import type { Id } from '../domain/types'
import { duplicateSheet, numberFrom } from '../domain/sheetEdit'
import { printOrder } from '../domain/sheetList'
import { newId } from '../domain/ids'

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
