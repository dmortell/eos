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

// Model-object + guide selection (P2) used to live here as a GLOBAL `modelSel` store (a pick in any view
// highlighted it in every view showing that model). R3 commit 2a (review.md §R3) replaced it with the one
// Selection model (ui/selection.ts), stored per VIEWPORT in `../selStore.svelte.ts` — Viewport.svelte reads
// its OWN viewport's obj/guide ids from `editor.sel.get()`; +page.svelte derives the Properties panel's
// view from whichever viewport is ACTIVE. No replacement export needed here.
