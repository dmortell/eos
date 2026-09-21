// Alignment GUIDE LINES (Visio-style) — full-view horizontal/vertical lines the user drops on a plan or
// elevation to align drawing and, crucially, to set the DEPTH PLANE for drawing 3D objects across views:
// a horizontal plan guide (constant y) fixes the off-axis depth for a FRONT/REAR elevation; a vertical
// plan guide (constant x) fixes it for LEFT/RIGHT.
//
// Guides now live IN THE MODEL (`Model.guides`) rather than a separate global store — so they are shown
// across every view of that model and their undo/redo ride the model history snapshot (`snapModels`) for
// free, like walls/prisms. Selection reuses the shared `modelSel`. This module is a thin API over the
// model store. Single floor model for now; the per-viewport model registry is a later slice.
import { models } from './3dview/models.svelte'
import type { Guide } from './3dview/types'
export type { Guide }

let seq = 0
export const guideId = () => 'g' + Date.now().toString(36) + seq++

// The model that owns guides (models[0] until the model registry lands).
const guideModel = () => models[0]

export function modelGuides(): Guide[] { return guideModel()?.guides ?? [] }

export function addGuide(g: Guide) {
	const m = guideModel(); if (!m) return
	;(m.guides ??= []).push(g)
}
export function removeGuide(id: string) {
	const m = guideModel(); if (!m?.guides) return
	const i = m.guides.findIndex((x) => x.id === id); if (i >= 0) m.guides.splice(i, 1)
}

// The currently-selected PLAN guide of a given orientation (h → front/rear depth, v → left/right), used
// to fix the off-axis depth when drawing a conduit in an elevation. Selection is the shared `modelSel`.
export function selectedPlanGuide(selIds: string[], orient: 'h' | 'v'): Guide | null {
	const gs = modelGuides()
	for (const id of selIds) { const g = gs.find((x) => x.id === id); if (g && g.space === 'plan' && g.orient === orient) return g }
	return null
}
