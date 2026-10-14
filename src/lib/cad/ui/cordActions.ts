// The actions on several selected cords (patch-list-plan.md Slice 2): Installed · Add · Remove · Restore · Delete —
// for the patch list's bar and right-click, and Properties when several cords are selected. The rules are
// `cordAction` (domain/cords.ts); this runs one at once as an undo step, and says what went.
import type { CadProject } from '../app/project.svelte'
import type { Workspace } from '../app/workspace.svelte'
import type { Cord } from '../domain/types'
import { cordAction, type CordAction } from '../domain/cords'
import { portFromText, repatchRun } from '../domain/repatchText'
import type { MenuItem } from './cadMenus'

const ACTIONS: { a: CordAction; label: string; title: string }[] = [
	{ a: 'installed', label: 'Installed', title: 'Done on site: added / changed cords become installed; cords marked for removal are out — their records go' },
	{ a: 'add', label: 'Add', title: 'Back to planned (add): not on site yet; any change history is forgotten' },
	{ a: 'remove', label: 'Remove', title: 'To come out on site: installed cords are marked for removal, planned ones deleted' },
	{ a: 'restore', label: 'Restore', title: 'Back to the ends and status before the change / removal' },
	{ a: 'delete', label: 'Delete', title: 'Delete the records outright — no removal work is listed (use Remove for cords on site)' },
]

const plural = (n: number) => `${n} cord${n === 1 ? '' : 's'}`
const DONE: Record<CordAction, (n: number) => string> = {
	installed: (n) => `${plural(n)} installed`, add: (n) => `${plural(n)} back to add`, remove: (n) => `Remove ${plural(n)}`,
	restore: (n) => `Restore ${plural(n)}`, delete: (n) => `Delete ${plural(n)}`,
}

/** The actions that do something to these cords, with how many each touches. */
export function cordActionsFor(cords: Cord[]): { a: CordAction; label: string; title: string; n: number }[] {
	return ACTIONS.map((x) => { const r = cordAction(cords, x.a); return { ...x, n: r.put.length + r.del.length } }).filter((x) => x.n > 0)
}

export function runCordAction(project: CadProject, ws: Workspace, cords: Cord[], a: CordAction): void {
	const r = cordAction(cords, a), n = r.put.length + r.del.length
	if (!n) return
	const label = DONE[a](n)
	// undoable, and only the picked cords change: at once, saying what happened (no question)
	project.store.transact(label, (tx) => { for (const c of r.put) tx.put(c); for (const id of r.del) tx.del(id) })
	if (r.del.length) ws.select(ws.selection.filter((id) => !r.del.includes(id)))
	const note = a === 'remove' && r.put.length ? ` (${r.put.length} marked for removal${r.del.length ? `, ${r.del.length} never installed deleted` : ''})`
		: a === 'delete' ? ' outright — no removal work is listed for them (Remove is for cords on site)'
		: a === 'installed' && r.del.length ? ` — ${r.del.length} marked for removal ${r.del.length === 1 ? 'is' : 'are'} out: ${r.del.length === 1 ? 'its record goes' : 'their records go'}` : ''
	ws.say(`${label}${note} — Undo brings them back`)
}

/** The same as right-click menu items. */
export function cordActionMenu(project: CadProject, ws: Workspace, cords: Cord[]): MenuItem[] {
	return [
		...cordActionsFor(cords).map((x): MenuItem => ({ label: `${x.label} (${x.n})`, title: x.title, run: () => runCordAction(project, ws, cords, x.a) })),
		...(cords.length ? ['-' as const, { label: cords.length === 1 ? 'Re-patch…' : `Re-patch ${cords.length} cords…`, title: REPATCH_TITLE, run: () => askRepatch(project, ws, cords) }] : []),
	]
}

/** The end a re-patch starts from: the switch side (a cord's end NOT on a panel when the other is), else To (b). */
function switchEnd(project: CadProject, c: Cord): 'a' | 'b' {
	const panel = (on: string) => (project.index.get(on) as { kind?: string } | undefined)?.kind === 'panel'
	return panel(c.b.on) && !panel(c.a.on) ? 'a' : 'b'
}

/** Re-patch from a typed port (W17): "SW1:41", "R301 · SW1 : 41" or "41" (the first cord's device). The first cord goes
 *  there, the others, in the order given, to the next free ports — one undo step, all or none. `which`: 'b' = the To
 *  ends (the To cell); 'kind' = on each cord the end on the same kind of device as the port typed (its switch end). */
export function repatchFrom(project: CadProject, ws: Workspace, cords: Cord[], text: string, which: 'b' | 'kind' = 'kind'): void {
	if (!cords.length || !text.trim()) return
	const near = cords[0][which === 'b' ? 'b' : switchEnd(project, cords[0])]
	if (cords.length === 1 && text.trim() === project.index.portPlace(near)) return
	const p = portFromText(project.index, text, near)
	if ('problem' in p) { ws.say(p.problem); return }
	const r = repatchRun(project.index, cords, which, p.to)
	if ('problem' in r) { ws.say(`Not re-patched — ${r.problem}`); return }
	const n = r.cords.length, first = project.index.portPlace(p.to)
	project.store.transact(n === 1 ? `Re-patch → ${first}` : `Re-patch ${n} cords from ${first}`, (tx) => { for (const x of r.cords) tx.put(x) })
	ws.say(n === 1 ? `Re-patched to ${first} · Ctrl+Z undoes` : `${n} cords re-patched from ${first} on (the next free ports) · Ctrl+Z undoes`)
}

export const REPATCH_TITLE = 'Move the cords’ switch ends (whichever column) to a port you type, e.g. SW1:41 — several cords go on to the next free ports of that device'

/** Asks for the port the cords' switch ends start from (the first one's as it is now), then re-patches them. */
export function askRepatch(project: CadProject, ws: Workspace, cords: Cord[]): void {
	if (!cords.length) return
	const n = cords.length
	ws.askText(n === 1 ? 'Re-patch to (device : port, e.g. SW1:41)' : `Re-patch ${n} cords from (device : port — the rest go on to the next free ports)`,
		project.index.portPlace(cords[0][switchEnd(project, cords[0])]), (t) => repatchFrom(project, ws, cords, t))
}
