// Edits that touch more than the selected records: deleting cascades to what can't exist without them.
import type { EntityStore } from '../store/store'
import type { Id, Cord } from '../domain/types'
import type { Entity, Sheet, Viewport } from '../domain/drawing'
import { removeCord } from '../domain/cords'
import { untie } from './noteTool'

/** Everything that lives on a level: its outlets, racks, shapes, floorplans, rooms / zones, and the rack rows of those
 *  rooms (devices, links and cords follow through deleteEntities). For deleting a level. */
export function levelContents(all: Iterable<Entity>, levelId: Id): Id[] {
	const list = [...all], out: Id[] = [], spaces = new Set<Id>()
	for (const e of list) {
		if ((e.type === 'outlet' || e.type === 'rack' || e.type === 'underlay' || e.type === 'space') && e.levelId === levelId) out.push(e.id)
		else if (e.type === 'shape' && (e.levelId === levelId || (e.geom.kind === 'path' && e.geom.nodes.some((n) => n.levelId === levelId)))) out.push(e.id)
		if (e.type === 'space' && e.levelId === levelId) spaces.add(e.id)
	}
	for (const e of list) if (e.type === 'rackRow' && spaces.has(e.spaceId)) out.push(e.id)
	return out
}

/**
 * Delete the given entities, plus the links and cords that end on a deleted outlet or device. One undo step.
 * A SELECTED cord follows the install workflow instead (removeCord): a planned one goes, an installed one is only
 * marked `remove` — it still has to come out on site. Cords on a deleted device go with it.
 */
export function deleteEntities(store: EntityStore, ids: Id[]): number {
	const marked: Cord[] = []
	const gone = new Set(ids.filter((id) => {
		const e = store.get(id)
		if (e?.type !== 'cord') return !!e
		const next = removeCord(e)
		if (next && next !== e) marked.push(next)
		return !next
	}))
	if (marked.length && !gone.size) {
		store.transact(marked.length === 1 ? 'Mark cord for removal' : `Mark ${marked.length} cords for removal`, (tx) => { for (const c of marked) tx.put(c) })
		return marked.length
	}
	if (!gone.size) return 0
	for (const e of store.all()) {
		if ((e.type === 'link' || e.type === 'cord') && (gone.has(e.a.on) || gone.has(e.b.on))) gone.add(e.id)
		if (e.type === 'device' && gone.has(e.rackId)) gone.add(e.id)
		// a sheet's paper notes (and a view's own shapes) belong to it alone
		if (e.type === 'shape' && ((e.sheetId && gone.has(e.sheetId)) || (e.viewId && gone.has(e.viewId)))) gone.add(e.id)
	}
	// Devices removed with their rack take their links / cords too.
	for (const e of store.all()) if ((e.type === 'link' || e.type === 'cord') && (gone.has(e.a.on) || gone.has(e.b.on))) gone.add(e.id)
	store.transact(gone.size === 1 ? 'Delete' : `Delete ${gone.size} items`, (tx) => {
		for (const id of gone) tx.del(id)
		for (const c of marked) if (!gone.has(c.id)) tx.put(c)
	})
	return gone.size + marked.length
}

/** Take one viewport off its sheet; the notes tied to it go back on the paper where they showed. One undo step. */
export function deleteViewport(store: EntityStore, sheet: Sheet, vp: Viewport): void {
	store.transact('Delete viewport', (tx) => {
		tx.put({ ...sheet, viewports: sheet.viewports.filter((x) => x.id !== vp.id) })
		for (const n of store.ofType('shape')) if (n.sheetId === sheet.id && n.vpId === vp.id) tx.put(untie(n, vp))
	})
}

/** What deleting `ids` takes WITH it (beyond the selected things): devices in deleted racks, links and cords on
 *  deleted devices, a deleted sheet's viewports and notes. Ask first when any of it is non-zero. */
export interface DeleteImpact { devices: number; links: number; cords: number; viewports: number; notes: number }
export function deleteImpact(store: EntityStore, ids: Id[]): DeleteImpact {
	const sel = new Set(ids)
	const racks = new Set(ids.filter((id) => store.get(id)?.type === 'rack'))
	const inRacks = store.ofType('device').filter((d) => racks.has(d.rackId) && !sel.has(d.id))
	const devs = new Set([...inRacks.map((d) => d.id), ...ids.filter((id) => store.get(id)?.type === 'device')])
	const on = (e: { id: Id; a: { on: Id }; b: { on: Id } }) => !sel.has(e.id) && (devs.has(e.a.on) || devs.has(e.b.on))
	const sheets = store.ofType('sheet').filter((s) => sel.has(s.id))
	const sheetIds = new Set(sheets.map((s) => s.id))
	return {
		devices: inRacks.length,
		links: store.ofType('link').filter(on).length,
		cords: store.ofType('cord').filter(on).length,
		viewports: sheets.reduce((n, s) => n + s.viewports.length, 0),
		notes: store.ofType('shape').filter((s) => s.sheetId && sheetIds.has(s.sheetId)).length,
	}
}
/** "14 devices, 30 links and 12 cords" — or null when nothing else goes. */
export function impactText(i: DeleteImpact): string | null {
	const parts = (Object.entries(i) as [keyof DeleteImpact, number][]).filter(([, n]) => n > 0)
		.map(([k, n]) => `${n} ${n === 1 ? k.slice(0, -1) : k}`)
	return parts.length ? parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : null
}
