// The GLOBAL block library (Firestore `blocks/{id}`, shared by every project — ui/blocks.ts has the model).
// The default outlet blocks are available immediately (even offline / before the first snapshot); the
// stored docs override them by id. `startBlocks` subscribes once per session and seeds any MISSING default
// under its fixed id (idempotent — two sessions seeding at once write the same doc).
import type { Firestore } from '$lib'
import { DEFAULT_BLOCKS, setBlockResolver, type BlockDef } from './ui/blocks'

const byId = $state<Record<string, BlockDef>>(Object.fromEntries(DEFAULT_BLOCKS.map((b) => [b.id, b])))
setBlockResolver((id) => (id ? byId[id] : undefined))

/** Every block (for pickers), by name. */
export const blockList = (): BlockDef[] => Object.values(byId).sort((a, b) => a.name.localeCompare(b.name))

let started = false
export function startBlocks(db: Firestore) {
	if (started) return
	started = true
	let seeded = false
	db.subscribeMany('blocks', (docs) => {
		for (const d of docs) byId[d.id] = d as unknown as BlockDef
		if (seeded) return
		seeded = true
		const have = new Set(docs.map((d) => d.id))
		for (const b of DEFAULT_BLOCKS) if (!have.has(b.id)) void db.save('blocks', { ...b, updatedAt: new Date().toISOString() })
	})
}
