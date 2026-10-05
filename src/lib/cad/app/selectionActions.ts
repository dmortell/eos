// Actions on the selection (split out of CadShell): Delete (the smallest thing picked first, asking when more goes
// with it), draw order (Ctrl+] / Ctrl+[) and group / ungroup (Ctrl+G / Ctrl+Shift+G). The keys, the toolbar's bin
// and the Edit menu all call these.
import type { CadProject } from './project.svelte'
import type { Workspace } from './workspace.svelte'
import { deleteEntities, deleteViewport, deleteImpact, impactText, sectionViewports, retargetSectionViewports, groupSelection, ungroupSelection } from '../editor/commands'
import { deletePicked } from '../editor/pathSel'
import { reservePorts } from '../domain/ports'
import { reorderShapes } from '../domain/shapes'

/** Delete acts on the smallest thing picked: a hole (the wall stays), a viewport (the sheet stays), ports (their
 *  reservation; the device stays). Racks holding devices ask first — the devices, links and cords go too. */
export function deleteSelected(project: CadProject, ws: Workspace): void {
	const op = ws.openingSel, wall = op ? project.store.get(op.wallId) : undefined
	if (op && wall?.type === 'shape' && wall.role?.kind === 'wall') {
		const role = wall.role
		project.store.transact('Delete opening', (tx) => tx.put({ ...wall, role: { ...role, openings: role.openings.filter((o) => o.id !== op.openingId) } }))
		ws.selectOpening(op.wallId, null)
		return
	}
	const sheet = ws.viewportId && ws.selection.length === 1 ? project.store.get(ws.selection[0]) : undefined
	const vp = sheet?.type === 'sheet' ? sheet.viewports.find((v) => v.id === ws.viewportId) : undefined
	if (sheet?.type === 'sheet' && vp) { deleteViewport(project.store, sheet, vp); ws.selectViewport(null); return }
	const ps = ws.portSel, dev = ps ? project.store.get(ps.on) : undefined
	if (ps) {
		const next = dev?.type === 'device' ? reservePorts(dev, ps.ports, '', '') : null
		if (next) project.store.transact('Clear reservation', (tx) => tx.put(next))
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
	if (!also) return go()
	const one = ids.length === 1 ? project.store.get(ids[0]) : undefined
	const what = !one ? `${ids.length} items` : one.type === 'sheet' ? `sheet ${one.number}` : `${one.type} ${project.index.nameOf(one.id)}`.trim()
	ws.ask2(`Delete ${what} with ${also}? Undo brings them back.`, 'Delete', go)
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
