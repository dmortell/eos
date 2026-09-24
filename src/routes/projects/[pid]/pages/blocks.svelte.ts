// The GLOBAL block library (Firestore `blocks/{id}`, shared by every project — ui/blocks.ts has the model).
// The default outlet blocks are available immediately (even offline / before the first snapshot); the
// stored docs override them by id. `startBlocks` subscribes once per session and seeds any MISSING default
// under its fixed id — or one stored at an older `rev` than the built-in (idempotent — two sessions seeding
// at once write the same doc).
import type { Firestore } from '$lib'
import { DEFAULT_BLOCKS, setBlockResolver, type BlockDef } from './ui/blocks'
import { encodeShapes, decodeShapes } from './store/mappers'

const byId = $state<Record<string, BlockDef>>(Object.fromEntries(DEFAULT_BLOCKS.map((b) => [b.id, b])))
setBlockResolver((id) => (id ? byId[id] : undefined))

/** Every block (for pickers), by name. */
export const blockList = (): BlockDef[] => Object.values(byId).sort((a, b) => a.name.localeCompare(b.name))

let started = false, dbRef: Firestore | null = null
/** D5: save a block to the global library (a new custom block, or an edit) — shared by every project. */
export function saveBlock(def: BlockDef) {
	byId[def.id] = def
	if (dbRef) void dbRef.save('blocks', { ...def, shapes: encodeShapes(def.shapes), updatedAt: new Date().toISOString() })
}
/** D5: delete a CUSTOM block from the global library (the built-in defaults can't be). */
export function deleteBlock(id: string) {
	if (DEFAULT_BLOCKS.some((b) => b.id === id)) return
	delete byId[id]
	if (dbRef) void dbRef.delete('blocks', id)
}
export const isDefaultBlock = (id: string) => DEFAULT_BLOCKS.some((b) => b.id === id)
export function startBlocks(db: Firestore) {
	if (started) return
	started = true; dbRef = db
	let seeded = false
	db.subscribeMany('blocks', (docs) => {
		for (const d of docs) { const b = d as unknown as BlockDef; byId[d.id] = { ...b, shapes: decodeShapes(b.shapes) ?? [] } }
		if (seeded) return
		seeded = true
		const revOf = new Map(docs.map((d) => [d.id, (d as unknown as BlockDef).rev ?? 0]))
		// a missing default, or a stored one older than the built-in (`rev`), is (re)written from the default;
		// shapes' points as {x,y} (Firestore can't store nested arrays)
		for (const b of DEFAULT_BLOCKS) {
			const stored = revOf.get(b.id)
			if (stored === undefined || stored < (b.rev ?? 0)) {
				byId[b.id] = b
				void db.save('blocks', { ...b, shapes: encodeShapes(b.shapes), updatedAt: new Date().toISOString() })
			}
		}
	})
}
