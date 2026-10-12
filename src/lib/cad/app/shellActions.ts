// Workspace actions that need only the project and the workspace (split out of CadShell): a new sheet, sheet PDFs,
// F4 (repeat the last device edit), the status bar's "12 selected (outlets)".
import type { CadProject } from './project.svelte'
import type { Workspace } from './workspace.svelte'
import type { Sheet } from '../domain/drawing'
import type { Device, Id } from '../domain/types'
import { blankSheet } from '../views/sheet'
import { newId } from '../domain/ids'
import { repeatOn } from '../domain/repeatEdit'
import { downloadSheetsPdf, unsupportedNote } from './sheetsPdf'
import { specLabel, type ViewSpec } from '../views/space'
import { portMapTitle } from '../domain/portMap'

/** The sheets in print order (archived left out). */
export const activeSheets = (project: CadProject): Sheet[] =>
	[...project.index.byId.values()].filter((e): e is Sheet => e.type === 'sheet' && e.status !== 'archived').sort((a, b) => a.order - b.order)

/** A new blank sheet (the next number), one undo step, selected; its id. */
export function newSheetIn(project: CadProject, ws: Workspace): Id {
	const sh = blankSheet(activeSheets(project), newId())
	project.store.transact(`New sheet ${sh.number}`, (tx) => tx.put(sh))
	ws.select([sh.id])
	return sh.id
}

/** These sheets as one PDF (downloaded), said in the status bar. */
export async function sheetsPdf(project: CadProject, ws: Workspace, sheets: Sheet[]): Promise<void> {
	try { const r = await downloadSheetsPdf(project, sheets, ws.monoPdf); ws.say(`PDF: ${r.pages} page${r.pages === 1 ? '' : 's'}${unsupportedNote(r.unsupported, r.rasterised)}`) }
	catch (e) { project.error = `PDF failed: ${(e as Error).message}` }
}

/** F4: the last device edit (Properties) again, on the selected devices — one undo step; those it can't go on are
 *  skipped and named (domain/repeatEdit.ts). */
export function repeatDeviceEdit(project: CadProject, ws: Workspace): void {
	const edit = ws.lastDeviceEdit
	if (!edit) { ws.say('F4 repeats a device edit — change a field of a device in Properties first'); return }
	const devices = ws.selection.map((id) => project.index.get(id)).filter((d): d is Device => d?.type === 'device')
	if (!devices.length) { ws.say(`F4: select the devices to repeat "${edit.label}" on`); return }
	const r = repeatOn(edit, devices, project.index.devices, (id) => { const x = project.index.get(id); return x?.type === 'rack' ? x : undefined })
	if (r.next.length) project.store.transact(`${edit.label} (repeated on ${r.next.length})`, (tx) => { for (const n of r.next) tx.put(n) })
	ws.say(`Repeated "${edit.label}" on ${r.next.length} device${r.next.length === 1 ? '' : 's'}${r.skipped.length ? ` · skipped ${r.skipped.join('; ')}` : ''}`)
}

/** "12 selected (outlets)" for the status bar (UX review V3). */
export function selectedText(project: CadProject, ws: Workspace): string {
	const n = ws.selection.length
	if (!n) return ''
	const kinds = [...new Set(ws.selection.map((id) => project.index.get(id)?.type).filter(Boolean))]
	return `${n} selected${kinds.length === 1 ? ` (${kinds[0]}${n > 1 ? 's' : ''})` : ''}`
}

/** A view's name for the tabs' back / forward titles. */
export function viewTitle(project: CadProject, v: ViewSpec | undefined): string | undefined {
	if (!v) return undefined
	if (v.kind === 'sheet') { const sh = project.index.get(v.sheetId); return sh?.type === 'sheet' ? `${sh.number} ${sh.title}` : 'a sheet' }
	if (v.kind === 'row') return `${project.index.nameOf(v.spaceId)} rack view`
	if (v.kind === 'section') return `Section ${project.index.nameOf(v.sectionId)}`
	if (v.kind === 'portmap') return portMapTitle(project.index, v.deviceIds)
	return specLabel(v)
}
/** Is what this view shows still there (a deleted sheet / section isn't)? */
export const viewExists = (project: CadProject, v: ViewSpec): boolean =>
	v.kind === 'sheet' ? !!project.index.get(v.sheetId) : v.kind === 'section' ? !!project.index.get(v.sectionId) : v.kind === 'portmap' ? v.deviceIds.some((id) => !!project.index.get(id)) : true

/** F9 / F3 / F7 and the status bar: SNAP, OSNAP, GRID on / off, said. */
export function toggleDrafting(ws: Workspace, k: 'snap' | 'osnap' | 'showGrid'): void {
	ws.drafting[k] = !ws.drafting[k]; ws.saveDrafting()
	ws.say(`${{ snap: 'SNAP', osnap: 'OSNAP', showGrid: 'GRID' }[k]} ${ws.drafting[k] ? 'on' : 'off'}`)
}
