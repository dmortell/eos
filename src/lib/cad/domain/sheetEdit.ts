// Sheet edits for the register (sheets-organising slice 3): DUPLICATE a sheet (with its viewports and the notes on its
// paper, no number, no revisions, right after the original in print order) and NUMBER a group of sheets from a
// pattern ("RE-01" → RE-01, RE-02 …; "P101" → P101, P102 …). Pure; tested in sheetEdit.test.ts.
import type { Id } from './types'
import type { Sheet } from './drawing'
import type { Shape } from './shapes'

/** A copy of the sheet and its paper notes, with new ids (`id()` makes one). "(copy)" title, no number. */
export function duplicateSheet(s: Sheet, notes: Shape[], id: () => Id): { sheet: Sheet; notes: Shape[] } {
	const vpIds = new Map(s.viewports.map((v) => [v.id, id()]))
	const sheet: Sheet = { ...structuredClone(s), id: id(), number: '', title: `${s.title} (copy)`, order: (s.order ?? 0) + 0.5, status: 'active', revisions: undefined,
		viewports: s.viewports.map((v) => ({ ...structuredClone(v), id: vpIds.get(v.id)! })) }
	const copies = notes.filter((n) => n.sheetId === s.id).map((n) => {
		const c = { ...structuredClone(n), id: id(), sheetId: sheet.id } as Shape
		if (n.vpId) (c as { vpId?: Id }).vpId = vpIds.get(n.vpId)
		if ((c as { groupId?: Id }).groupId) delete (c as { groupId?: Id }).groupId   // not in the original's group
		return c
	})
	return { sheet, notes: copies }
}

/** The numbers for these sheets (in the order given) from a pattern: its last run of digits counts up, keeping its
 *  width ("RE-01" → RE-01, RE-02 …, "S9" → S9, S10). A pattern without digits gets "-01" added. */
export function numberFrom(pattern: string, n: number): string[] {
	const p = pattern.trim(), m = /^(.*?)(\d+)(\D*)$/.exec(p)
	const [pre, digits, post] = m ? [m[1], m[2], m[3]] : [`${p}${p ? '-' : ''}`, '01', '']
	return Array.from({ length: n }, (_, i) => `${pre}${String(Number(digits) + i).padStart(digits.length, '0')}${post}`)
}
