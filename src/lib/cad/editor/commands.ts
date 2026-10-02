// Edits that touch more than the selected records: deleting cascades to what can't exist without them.
import type { EntityStore } from '../store/store'
import type { Id, Cord } from '../domain/types'
import type { Entity } from '../domain/drawing'
import { removeCord } from '../domain/cords'

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
	}
	// Devices removed with their rack take their links / cords too.
	for (const e of store.all()) if ((e.type === 'link' || e.type === 'cord') && (gone.has(e.a.on) || gone.has(e.b.on))) gone.add(e.id)
	store.transact(gone.size === 1 ? 'Delete' : `Delete ${gone.size} items`, (tx) => {
		for (const id of gone) tx.del(id)
		for (const c of marked) if (!gone.has(c.id)) tx.put(c)
	})
	return gone.size + marked.length
}
