// Rename / delete a level or a server room (split out of ui/Navigator.svelte): the Navigator's row menus and the
// Project menu (the open level) call these. Deleting asks first when more goes with it; Undo brings it all back.
import type { CadProject } from './project.svelte'
import type { Workspace } from './workspace.svelte'
import type { Level } from '../domain/types'
import { deleteEntities, levelContents, levelViewports, levelViewportsOff, deleteImpact, impactText } from '../editor/commands'

/** Rename in the Navigator, in place (its row's label becomes an input — ws.navRename). */
export function renameLevel(_project: CadProject, ws: Workspace, id: string): void { ws.navRename = { id } }
/** The name typed in the Navigator: a level's, a room's, a section's, a sheet's title or number. */
export function applyRename(project: CadProject, id: string, name: string, field?: 'title' | 'number'): void {
	const e = project.index.get(id)
	if (!e) return
	if (e.type === 'sheet') {
		const f = field ?? 'title'
		if (name !== e[f]) project.store.transact(f === 'number' ? `Renumber ${e.number} → ${name}` : `Retitle ${e.number}`, (tx) => tx.put({ ...e, [f]: name }))
		return
	}
	if ((e.type === 'level' || e.type === 'space' || e.type === 'section') && name !== e.name)
		project.store.transact(`Rename ${e.type === 'space' ? 'room' : e.type} ${e.name} → ${name}`, (tx) => tx.put({ ...e, name }))
}
export function deleteLevel(project: CadProject, ws: Workspace, id: string): void {
	const l = project.index.get(id) as Level | undefined
	if (l?.type !== 'level') return
	const on = levelContents(project.store.all(), l.id), vps = levelViewports(project.store, l.id)
	const sheets = new Set(vps.map((v) => v.sheet.id)).size
	const vpText = vps.length ? ` ${vps.length} viewport${vps.length === 1 ? '' : 's'} on ${sheets} sheet${sheets === 1 ? '' : 's'} show${vps.length === 1 ? 's' : ''} it — ${vps.length === 1 ? 'it comes' : 'they come'} off.` : ''
	ws.ask2(`Delete level ${l.name} and everything on it (${on.length} item${on.length === 1 ? '' : 's'}: outlets, racks + devices, links, cords, drawing, floorplan, rooms, sections, views)?${vpText} Undo brings it back.`, 'Delete level', () => {
		deleteEntities(project.store, [l.id, ...levelContents(project.store.all(), l.id)], levelViewportsOff(project.store, l.id))   // what's on it NOW (not when asked)
		if (ws.levelId === l.id) ws.levelId = project.levels.find((x) => x.id !== l.id)?.id ?? null
	})
}
// ── server rooms: rename, delete (Dave: "how to delete unused items like SER-B?") ──
export function renameRoom(_project: CadProject, ws: Workspace, id: string): void { ws.navRename = { id } }
/** A room goes with its racks (and their devices, links, cords) and rows; outlet ports and panels that name it as
 *  their server room keep the id but show none (said in the question). An empty room just goes (Undo brings it back). */
export function deleteRoom(project: CadProject, ws: Workspace, id: string): void {
	const r = project.index.get(id)
	if (r?.type !== 'space') return
	const racks = project.index.racks.filter((k) => k.spaceId === id).map((k) => k.id)
	const rows = [...project.index.byId.values()].filter((e) => e.type === 'rackRow' && e.spaceId === id).map((e) => e.id)
	const ports = project.index.outlets.reduce((n, o) => n + o.ports.filter((pt) => pt.serverRoomId === id).length, 0)
	const go = () => deleteEntities(project.store, [id, ...rows, ...racks])
	const also = [racks.length ? `${racks.length} rack${racks.length === 1 ? '' : 's'} (with their devices, links and cords)` : '', impactText(deleteImpact(project.store, racks)) ?? ''].filter(Boolean)[0]
	if (!racks.length && !ports) { go(); return }
	ws.ask2(`Delete room ${r.name}${also ? ` with ${also}` : ''}?${ports ? ` ${ports} outlet port${ports === 1 ? '' : 's'} name it as their server room — they'll have none.` : ''} Undo brings it back.`, 'Delete room', go)
}
/** A row of racks goes; its racks stay in the room, in no row (and its hand order goes). One undo step. */
export function deleteRow(project: CadProject, id: string): void {
	const w = project.index.get(id)
	if (w?.type !== 'rackRow') return
	const racks = project.index.racks.filter((k) => k.rowId === id)
	const room = project.index.get(w.spaceId)
	project.store.transact(`Delete row ${w.name}`, (tx) => {
		tx.del(id)
		for (const k of racks) tx.put({ ...k, rowId: undefined })
		if (room?.type === 'space' && room.rackOrder?.[id]) { const { [id]: _, ...rest } = room.rackOrder; tx.put({ ...room, rackOrder: Object.keys(rest).length ? rest : undefined }) }
	})
}
