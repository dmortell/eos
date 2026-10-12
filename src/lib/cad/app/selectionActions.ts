// Actions on the selection (split out of CadShell): Delete (the smallest thing picked first, asking when more goes
// with it), draw order (Ctrl+] / Ctrl+[) and group / ungroup (Ctrl+G / Ctrl+Shift+G). The keys, the toolbar's bin
// and the Edit menu all call these.
import type { CadProject } from './project.svelte'
import type { Workspace } from './workspace.svelte'
import { deleteEntities, deleteViewport, deleteImpact, impactText, installedCordsGoing, sectionViewports, retargetSectionViewports, groupSelection, ungroupSelection } from '../editor/commands'
import { deletePicked } from '../editor/pathSel'
import { reservePorts, portRanges } from '../domain/ports'
import { removeCord } from '../domain/cords'
import { kindOf, countsText, selectionKinds } from '../ui/propsKit'
import type { Entity } from '../domain/drawing'
import { reorderShapes } from '../domain/shapes'
import { deleteRoom, deleteRow } from './navActions'

/** The one confirmation rule: an undoable delete of only what's picked happens at once and says so like this; it asks
 *  first only when more goes with it (a rack's devices, a sheet's viewports) or it can't be undone. */
const UNDONE = (what: string) => `${what} — Undo brings it back`

/** Delete acts on the smallest thing picked: a hole (the wall stays), a viewport (the sheet stays), ports (their
 *  reservation; the device stays). Racks holding devices ask first — the devices, links and cords go too. */
export function deleteSelected(project: CadProject, ws: Workspace): void {
	const op = ws.openingSel, wall = op ? project.store.get(op.wallId) : undefined
	if (op && wall?.type === 'shape' && wall.role?.kind === 'wall') {
		const role = wall.role
		project.store.transact('Delete opening', (tx) => tx.put({ ...wall, role: { ...role, openings: role.openings.filter((o) => o.id !== op.openingId) } }))
		ws.selectOpening(op.wallId, null)
		ws.say(UNDONE('Deleted the opening (the wall stays)'))
		return
	}
	const sheet = ws.viewportId && ws.selection.length === 1 ? project.store.get(ws.selection[0]) : undefined
	const vp = sheet?.type === 'sheet' ? sheet.viewports.find((v) => v.id === ws.viewportId) : undefined
	if (sheet?.type === 'sheet' && vp) {
		deleteViewport(project.store, sheet, vp); ws.selectViewport(null)
		ws.say(UNDONE(`Deleted the viewport from sheet ${sheet.number} (its notes stay on the sheet)`))
		return
	}
	const ps = ws.portSel, dev = ps ? project.store.get(ps.on) : undefined
	if (ps) {
		const next = dev?.type === 'device' ? reservePorts(dev, ps.ports, '', '') : null
		if (next && dev?.type === 'device') {
			const held = (dev.panel?.reservations ?? []).flatMap((r) => r.ports).filter((n) => ps.ports.includes(n))
			project.store.transact('Clear reservation', (tx) => tx.put(next))
			ws.say(UNDONE(`Cleared the reservation on ${dev.name} port${held.length === 1 ? '' : 's'} ${portRanges(held)} (the device stays)`))
		}
		else ws.say('Delete on ports clears their reservation — none here. Click the device body to delete the device.')
		return
	}
	// picked nodes / segments of the selected run: just those (a node heals the run; segments may split it)
	const pth = ws.pathSel, run = pth ? project.store.get(pth.shape) : undefined
	if (pth && run?.type === 'shape') {
		const out = deletePicked(run, pth)
		project.store.transact(pth.nodes.length ? (pth.nodes.length === 1 ? 'Delete node' : `Delete ${pth.nodes.length} nodes`) : pth.segs.length === 1 ? 'Delete segment' : `Delete ${pth.segs.length} segments`, (tx) => { if (!out.length) tx.del(run.id); for (const p of out) tx.put(p) })
		ws.selectPath(null)
		ws.select(out.some((p) => p.id === run.id) ? [run.id] : [])
		if (out.length > 1) ws.say(`The run is now ${out.length} separate runs`)
		return
	}
	if (!ws.selection.length) return
	// a server room (with its racks, asked) or a row of racks (its racks stay), picked in the Navigator / Racks window
	const lone = ws.selection.length === 1 ? project.store.get(ws.selection[0]) : undefined
	if (lone?.type === 'space') { deleteRoom(project, ws, lone.id); return }
	if (lone?.type === 'rackRow') { deleteRow(project, lone.id); ws.select([]); ws.say(UNDONE(`Deleted row ${lone.name} (its racks stay in the room)`)); return }
	// a rack's devices, a device's links / cords, a sheet's viewports / notes go too: ask first, saying what
	const ids = ws.selection, also = impactText(deleteImpact(project.store, ids))
	// a section shown in viewports: keep them as plain elevations (same view direction), or take them off too
	const shown = sectionViewports(project.store, ids)
	if (shown.length) {
		const del = (keep: boolean) => () => { deleteEntities(project.store, ids, retargetSectionViewports(project.store, project.index, ids, keep)); ws.select([]) }
		const where = [...new Set(shown.map((h) => h.sheet.number))].join(', ')
		ws.ask2(`The section is shown in ${shown.length} viewport${shown.length === 1 ? '' : 's'} (${where})${also ? `; ${also} go too` : ''}.`, 'Delete, keep viewports as elevations', del(true), { label: 'Delete with its viewports', apply: del(false) })
		return
	}
	const go = () => { deleteEntities(project.store, ids); ws.select([]) }
	const items = ids.map((id) => project.store.get(id)).filter((e): e is Entity => !!e)
	const nameOf = (e: Entity) => e.type === 'sheet' ? e.number : e.type === 'shape' && e.geom.kind === 'insert' ? project.blockOf(e.geom.blockId)?.name ?? '' : project.index.nameOf(e.id)
	const what = itemsText(items, nameOf)
	if (!also) { const said = deletedText(items, nameOf); go(); ws.say(said); return }
	const inst = installedCordsGoing(project.store, ids)
	const warn = inst ? ` ${inst} of the cords ${inst === 1 ? 'is' : 'are'} installed: they go from the record, not into the removal list — export the changes first if the installer needs them.` : ''
	ws.ask2(`Delete ${what} with ${also}?${warn} Undo brings them back.`, 'Delete', go)
}
/** "trunk T1" (one, in the Properties header's word) or "3 racks · 5 outlets" (several). */
function itemsText(items: Entity[], nameOf: (e: Entity) => string): string {
	if (items.length === 1) return `${kindOf(items[0])[0].toLowerCase()} ${nameOf(items[0])}`.trim()
	return countsText(selectionKinds(items).map((k) => [k.items.length, k.one, k.many])) || `${items.length} items`
}
/** What a Delete of these did, in words: what went, the installed cords only marked for removal (they come out on
 *  site — the delete keeps them on the record), cords already marked (nothing to do). */
export function deletedText(items: Entity[], nameOf: (e: Entity) => string): string {
	const marked = items.filter((e) => e.type === 'cord' && removeCord(e) !== null && removeCord(e) !== e)
	const already = items.filter((e) => e.type === 'cord' && removeCord(e) === e)
	const gone = items.filter((e) => !marked.includes(e) && !already.includes(e))
	const parts: string[] = []
	if (gone.length) parts.push(`Deleted ${itemsText(gone, nameOf)}`)
	if (marked.length) {
		const which = marked.length === 1 ? (items.length === 1 ? itemsText(marked, nameOf) : 'an installed patch cord') : `${marked.length} installed patch cords`
		parts.push(`${parts.length ? 'marked' : 'Marked'} ${which} for removal — ${marked.length === 1 ? 'it comes' : 'they come'} out on site (the patch list shows ${marked.length === 1 ? 'it' : 'them'})`)
	}
	const changed = parts.length > 0
	if (already.length) parts.push(`${already.length === 1 ? (items.length === 1 ? 'the patch cord is' : '1 patch cord is') : `${already.length} patch cords are`} already marked for removal${changed ? '' : ' — Purge removed (Patching ⋯) takes removed cords off the record'}`)
	const text = parts.join(' · ')
	const said = text.charAt(0).toUpperCase() + text.slice(1)
	return changed ? UNDONE(said) : said
}
/** Ctrl+] / Ctrl+[ bring the selected shapes forward / send them back; with Shift to the front / back. */
export function orderKey(project: CadProject, ws: Workspace, how: 'forward' | 'backward' | 'front' | 'back'): void {
	const moved = reorderShapes(project.index.shapes, ws.selection, how)
	const word = { forward: 'Bring forward', backward: 'Send backward', front: 'Bring to front', back: 'Send to back' }[how]
	if (!moved.length) { ws.say(ws.selection.length ? `${word}: already there` : 'Select drawn shapes first'); return }
	project.store.transact(word, (tx) => { for (const s of moved) tx.put(s) })
}
/** Ctrl+G groups the selected shapes, Ctrl+Shift+G ungroups them (backlog "Group / ungroup"). */
export function groupKey(project: CadProject, ws: Workspace, ungroup: boolean): void {
	if (ungroup) { const n = ungroupSelection(project.store, ws.selection); ws.say(n ? `Ungrouped ${n} shapes` : 'Nothing selected is in a group'); return }
	const r = groupSelection(project.store, ws.selection)
	ws.say('problem' in r ? r.problem : `Grouped ${r.n} shapes · a click on one selects them all · Ctrl+Shift+G ungroups`)
}
