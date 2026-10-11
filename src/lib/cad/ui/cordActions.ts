// The actions on several selected cords (patch-list-plan.md Slice 2): Installed · Add · Remove · Restore · Delete —
// for the patch list's bar and right-click, and Properties when several cords are selected. The rules are
// `cordAction` (domain/cords.ts); this runs one as an undo step, asking first when records go.
import type { CadProject } from '../app/project.svelte'
import type { Workspace } from '../app/workspace.svelte'
import type { Cord } from '../domain/types'
import { cordAction, type CordAction } from '../domain/cords'
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
	const go = () => {
		project.store.transact(label, (tx) => { for (const c of r.put) tx.put(c); for (const id of r.del) tx.del(id) })
		if (r.del.length) ws.select(ws.selection.filter((id) => !r.del.includes(id)))
		const marked = a === 'remove' && r.put.length ? ` (${r.put.length} marked for removal${r.del.length ? `, ${r.del.length} never installed deleted` : ''})` : ''
		ws.say(`${label}${marked} — Ctrl+Z undoes`)
	}
	if (a === 'delete') return ws.ask2(`Delete ${plural(n)} outright? No removal work is listed for them — use Remove for cords that are on site. Undo brings them back.`, 'Delete', go)
	if (a === 'installed' && r.del.length) return ws.ask2(`${plural(n)} done on site: ${r.del.length} of them ${r.del.length === 1 ? 'was' : 'were'} marked for removal — ${r.del.length === 1 ? 'its record goes' : 'their records go'}. Undo brings them back.`, 'Done on site', go)
	go()
}

/** The same as right-click menu items. */
export function cordActionMenu(project: CadProject, ws: Workspace, cords: Cord[]): MenuItem[] {
	return cordActionsFor(cords).map((x) => ({ label: `${x.label} (${x.n})`, title: x.title, run: () => runCordAction(project, ws, cords, x.a) }))
}
