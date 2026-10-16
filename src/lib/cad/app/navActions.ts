// Rename / delete a level or a server room (split out of ui/Navigator.svelte): the Navigator's row menus and the
// Project menu (the open level) call these. Deleting asks first when more goes with it; Undo brings it all back.
import type { CadProject } from './project.svelte'
import type { Workspace } from './workspace.svelte'
import type { Level } from '../domain/types'
import { newServerRoom, nextRoomName } from '../domain/devices'
import { allocate } from '../domain/allocate'
import { deleteEntities, levelContents, levelRisers, withoutLevelNodes, contentsText, levelViewports, levelViewportsOff, roomViewports, roomViewportsOff, roomElevations, deleteImpact, impactText } from '../editor/commands'

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
	const on = levelContents(project.store.all(), l.id), vps = levelViewports(project.store, l.id), risers = levelRisers(project.store.all(), l.id)
	const sheets = new Set(vps.map((v) => v.sheet.id)).size
	const vpText = vps.length ? ` ${vps.length} viewport${vps.length === 1 ? '' : 's'} on ${sheets} sheet${sheets === 1 ? '' : 's'} show${vps.length === 1 ? 's' : ''} it — ${vps.length === 1 ? 'it comes' : 'they come'} off.` : ''
	// W36: runs of other floors reaching it are cut back to their own floor (they used to go whole)
	const riserText = risers.length ? ` ${risers.length} run${risers.length === 1 ? '' : 's'} from other floors ${risers.length === 1 ? 'rises / drops' : 'rise / drop'} to it (${risers.map((s) => `${s.label || 'a run'} on ${project.index.nameOf(s.levelId ?? '') || '?'}`).join(', ')}) — ended on the nearest floor with a model between (else cut back to ${risers.length === 1 ? 'its' : 'their'} own floor).` : ''
	const go = () => {
		// what's on it NOW (not when asked); the runs reaching it cut back in the same step
		deleteEntities(project.store, [l.id, ...levelContents(project.store.all(), l.id)], (tx) => {
			levelViewportsOff(project.store, l.id)(tx)
			for (const s of levelRisers(project.store.all(), l.id)) { const cut = withoutLevelNodes(s, l.id, project.levels); if (cut) tx.put(cut); else tx.del(s.id) }
		})
		if (ws.levelId === l.id) ws.levelId = project.levels.find((x) => x.id !== l.id)?.id ?? null
	}
	// an empty level, shown nowhere, just goes; asked only when more goes with it (W35: says what)
	if (!on.length && !vps.length && !risers.length) { go(); ws.say(`Deleted level ${l.name} — the building keeps the floor (riser view, Floors); Undo brings it back`); return }
	const what = contentsText(project.store.all(), on)
	ws.ask2(`Delete level ${l.name}${what ? ` and what's on it: ${what} (with their devices, links and cords)` : ''}?${vpText}${riserText} The building keeps the floor (riser view; Floors › + model makes it again). Undo brings it back.`, 'Delete level', go)
}
// ── server rooms: rename, delete (User: "how to delete unused items like SER-B?") ──
export function renameRoom(_project: CadProject, ws: Workspace, id: string): void { ws.navRename = { id } }
/** A room goes with its racks (and their devices, links, cords) and rows; the sheet viewports showing it come off;
 *  outlet ports, panels and runs that name it as their server room let go (said in the question). An empty room, shown
 *  nowhere, just goes (Undo brings it back). */
export function deleteRoom(project: CadProject, ws: Workspace, id: string): void {
	const r = project.index.get(id)
	if (r?.type !== 'space') return
	const racksIn = () => project.store.ofType('rack').filter((k) => k.spaceId === id).map((k) => k.id)
	const rowsIn = () => project.store.all().filter((e) => e.type === 'rackRow' && e.spaceId === id).map((e) => e.id)
	const racks = racksIn(), rows = rowsIn(), vps = roomViewports(project.store, id)
	const ports = project.index.outlets.reduce((n, o) => n + o.ports.filter((pt) => pt.serverRoomId === id).length, 0)
	const runs = project.index.shapes.filter((s) => s.role?.kind === 'containment' && s.role.serves?.includes(id)).length
	// what's in it NOW (a rack added while the question was open goes too), not when asked
	const elevs = roomElevations(project.store, id)
	const go = () => deleteEntities(project.store, [id, ...rowsIn(), ...racksIn(), ...roomElevations(project.store, id)], roomViewportsOff(project.store, id))
	const also = [racks.length ? `${racks.length} rack${racks.length === 1 ? '' : 's'} (with their devices, links and cords)` : '', impactText(deleteImpact(project.store, racks)) ?? ''].filter(Boolean)[0]
	if (!racks.length && !ports && !runs && !vps.length && !elevs.length) { go(); ws.say(`Deleted room ${r.name}${rows.length ? ` (and its ${rows.length} empty row${rows.length === 1 ? '' : 's'})` : ''} — Undo brings it back`); return }
	const sheets = new Set(vps.map((v) => v.sheet.id)).size
	const notes = [
		ports ? ` ${ports} outlet port${ports === 1 ? '' : 's'} name it as their server room — they'll have none.` : '',
		runs ? ` ${runs} run${runs === 1 ? '' : 's'} serve${runs === 1 ? 's' : ''} it — it's taken off what ${runs === 1 ? 'it serves' : 'they serve'} (a run serving only it then serves every room).` : '',
		elevs.length ? ` Its ${elevs.length} room elevation${elevs.length === 1 ? '' : 's'} go${elevs.length === 1 ? 'es' : ''} too.` : '',
		vps.length ? ` ${vps.length} viewport${vps.length === 1 ? '' : 's'} on ${sheets} sheet${sheets === 1 ? '' : 's'} show${vps.length === 1 ? 's' : ''} it — ${vps.length === 1 ? 'it comes' : 'they come'} off.` : '',
	].join('')
	ws.ask2(`Delete room ${r.name}${also ? ` with ${also}` : ''}?${notes} Undo brings it back.`, 'Delete room', go)
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

/** A new server room on a floor (User 2026-10-16: "+ Server room" was only in the Racks window, which isn't open at
 *  first): its name in a dialog, the next free one offered (SR-A …); Cabling › New server room… and a floor's menu in
 *  the Navigator. */
export function addServerRoom(project: CadProject, ws: Workspace, levelId: string | null): void {
	const l = levelId ? project.index.get(levelId) : undefined
	if (l?.type !== 'level') { ws.say('Open a floor first — the server room goes on it'); return }
	ws.textAsk = {
		title: `New server room on ${l.name}`, label: 'Name', value: nextRoomName(project.index, l.id), ok: 'Add',
		hint: 'Then draw its racks with the Rack tool (Cabling › Rack); Window › Racks lists the rooms and their racks.',
		apply: (t) => {
			const name = t.trim()
			if (!name) return
			const room = newServerRoom(project.index, l.id, name)
			project.store.transact(`New server room ${room.name}`, (tx) => tx.put(room))
			ws.say(`${room.name} added on ${l.name} — draw its racks with the Rack tool`)
		},
	}
}

/** Cabling › Allocate this level (Round 7: Allocate was only in the Outlets table's ⋯ menu): every unallocated outlet
 *  port of the open level onto a panel of its server room — the table's own Allocate this level; asks first only when
 *  existing links would move (they don't here: existing links stay). */
export function allocateLevel(project: CadProject, ws: Workspace, levelId: string | null): void {
	if (!levelId) { ws.say('Open a floor first'); return }
	const r = allocate(project.index, { levelId, reallocate: false, includePinned: false })
	const n = r.add.length, left = r.unallocated.length
	if (!n) { ws.say(left ? `Nothing to allocate — ${left} port(s) can't be placed (Outlets table: the list)` : 'Every outlet port on this floor is already allocated'); return }
	project.applyLinks('Allocate this level', r.add, r.remove)
	ws.say(`Allocate this level: ${n} port(s) to panels${left ? ` · ${left} can't be placed` : ''} — Undo brings them back`)
}
