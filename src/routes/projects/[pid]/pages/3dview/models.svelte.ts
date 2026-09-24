// Pages 3D model registry (P1 — in-memory; Firestore `models3d/{pid}` comes in P6, see model-plan.md).
// A MODEL is a floor's 3D (walls / prisms / conduits, real mm). A page's viewport references a model by
// id + view config. The demo seed models (floor + rack) live in `mock/models.ts` (R10) so this store is
// just the reactive registry + mutators; the backend swap replaces `demoModels()`, not this file.
import type { Model, ModelId } from './types'
import { migrateModels } from './migrate'
import { demoModels, emptyFloor } from '../mock/models'
import { newId } from '../ids'

export const FLOOR_MODEL_ID: ModelId = 'm1'   // the default model a new viewport / tab points at
export const models = $state<Model[]>(migrateModels(demoModels()))
export const modelById = (id?: ModelId) => (id == null ? undefined : models.find((m) => m.id === id))
/** The model of a floor, by the floor's name in the navigator ('33F'); undefined if there is none. */
export const floorModelId = (floor?: string) => (floor ? models.find((m) => m.name === floor)?.id : undefined)
/** The model of a floor, creating an EMPTY one if the floor has none yet (a real project's floors — 10F,
 *  12F… — have no demo model; without this they fell back to 33F's). Mock until X4 persists models. */
export function ensureFloorModel(floor: string): ModelId {
	const have = floorModelId(floor); if (have != null) return have
	const id = newId('m')
	models.push(emptyFloor(id, floor))
	return id
}
// Replace the whole model list in place (keeps the reactive reference) — used by undo/redo to restore a
// history snapshot. `$state.snapshot` UNWRAPS Svelte proxies to plain data (structuredClone throws on a
// proxy — and the stored step's model IS a proxy, living inside the $state history tree), giving a deep
// plain copy so the restored live state never aliases the stored step; splice re-proxies it reactively.
/** Put a model into the registry: replace the one with its id IN PLACE (keeps the array reference), or append. */
export function upsertModel(m: Model) {
	const i = models.findIndex((x) => x.id === m.id)
	if (i >= 0) models[i] = m; else models.push(m)
}
/** Drop models from the registry (their project closed, or they were deleted remotely). */
export function removeModels(ids: Iterable<ModelId>) {
	const rm = new Set(ids)
	for (let i = models.length - 1; i >= 0; i--) if (rm.has(models[i].id)) models.splice(i, 1)
}
/** The (first non-archived, else any) model filed under a Pages place. */
export const modelForPlace = (placeId: string) => models.find((m) => m.placeId === placeId && !m.archived) ?? models.find((m) => m.placeId === placeId)
export const snapModels = (): Model[] => $state.snapshot(models) as Model[]
// Restore BY ID: each model in the snapshot replaces the registry model with its id; a registry model the
// snapshot doesn't know (created or loaded after it was taken — a stored Pages model) is kept, never dropped.
// (Replacing the whole array removed such a model on undo: its tab went "Missing model" and its save stopped.)
export const setModels = (next: Model[]) => {
	const snap = $state.snapshot(next) as Model[], byId = new Map(snap.map((m) => [m.id, m]))
	for (let i = 0; i < models.length; i++) { const m = byId.get(models[i].id); if (m) models[i] = keepMeta(m, models[i]) }
}
/** Management stamps (drawings-plan phases 6–7) record saves / archiving, not drawing edits — an undo restores
 *  a model's CONTENT but keeps its current version stamp and archived flag. */
const META_KEYS = ['version', 'versionHash', 'archived'] as const
function keepMeta(restored: Model, cur: Model): Model {
	const out = { ...restored }
	for (const k of META_KEYS) { if (cur[k] === undefined) delete out[k]; else (out as Record<string, unknown>)[k] = cur[k] }
	return out
}

// Model-object + guide selection (P2) used to live here as a GLOBAL `modelSel` store (a pick in any view
// highlighted it in every view showing that model). R3 commit 2a (review.md §R3) replaced it with the one
// Selection model (ui/selection.ts), stored per VIEWPORT in `../selStore.svelte.ts` — Viewport.svelte reads
// its OWN viewport's obj/guide ids from `editor.sel.get()`; +page.svelte derives the Properties panel's
// view from whichever viewport is ACTIVE. No replacement export needed here.
