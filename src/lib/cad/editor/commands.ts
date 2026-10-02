// Edits that touch more than the selected records: deleting cascades to what can't exist without them.
import type { EntityStore } from '../store/store'
import type { Id } from '../domain/types'

/** Delete the given entities, plus the links and cords that end on a deleted outlet or device. One undo step. */
export function deleteEntities(store: EntityStore, ids: Id[]): number {
	const gone = new Set(ids.filter((id) => store.has(id)))
	if (!gone.size) return 0
	for (const e of store.all()) {
		if ((e.type === 'link' || e.type === 'cord') && (gone.has(e.a.on) || gone.has(e.b.on))) gone.add(e.id)
		if (e.type === 'device' && gone.has(e.rackId)) gone.add(e.id)
	}
	// Devices removed with their rack take their links / cords too.
	for (const e of store.all()) if ((e.type === 'link' || e.type === 'cord') && (gone.has(e.a.on) || gone.has(e.b.on))) gone.add(e.id)
	store.transact(gone.size === 1 ? 'Delete' : `Delete ${gone.size} items`, (tx) => { for (const id of gone) tx.del(id) })
	return gone.size
}
