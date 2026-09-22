// Pages 3D model registry (P1 — in-memory; Firestore `models3d/{pid}` comes in P6, see model-plan.md).
// A MODEL is a floor's 3D (walls / prisms / conduits, real mm). A page's viewport references a model by
// id + view config. The demo seed models (floor + rack) live in `mock/models.ts` (R10) so this store is
// just the reactive registry + mutators; the backend swap replaces `demoModels()`, not this file.
import type { Model } from './types'
import { migrateModels } from './migrate'
import { demoModels } from '../mock/models'

export const FLOOR_MODEL_ID = 1   // the default model a new viewport / tab points at
export const models = $state<Model[]>(migrateModels(demoModels()))
export const modelById = (id?: number) => (id == null ? undefined : models.find((m) => m.id === id))
// Replace the whole model list in place (keeps the reactive reference) — used by undo/redo to restore a
// history snapshot. `$state.snapshot` UNWRAPS Svelte proxies to plain data (structuredClone throws on a
// proxy — and the stored step's model IS a proxy, living inside the $state history tree), giving a deep
// plain copy so the restored live state never aliases the stored step; splice re-proxies it reactively.
export const snapModels = (): Model[] => $state.snapshot(models) as Model[]
export const setModels = (next: Model[]) => { models.splice(0, models.length, ...($state.snapshot(next) as Model[])) }

// Selected MODEL-object ids (P2). Global to the model for now (a pick in any view highlights it in
// all) — per-view model selection can come with the registry (§5). Mutated in place so importers
// keep the same reactive reference.
export const modelSel = $state<string[]>([])
export const setModelSel = (ids: string[]) => { if (ids.length !== modelSel.length || ids.some((v, i) => v !== modelSel[i])) modelSel.splice(0, modelSel.length, ...ids) }
