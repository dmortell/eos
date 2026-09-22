// Alignment GUIDE LINES (Visio-style) — full-view horizontal/vertical lines the user drops on a plan or
// elevation to align drawing and, crucially, to set the DEPTH PLANE for drawing 3D objects across views:
// a horizontal plan guide (constant y) fixes the off-axis depth for a FRONT/REAR elevation; a vertical
// plan guide (constant x) fixes it for LEFT/RIGHT.
//
// Guides live IN THE MODEL (`Model.guides`) — shown across every view of that model, undo/redo riding the
// model snapshot (`snapModels`) like walls/prisms, selection reusing the shared `modelSel`. This module is
// now just PURE helpers over a passed guides array (the caller resolves which model, per the §5 registry).
import type { Guide } from './3dview/types'
import { newId } from './ids'
export type { Guide }

export const guideId = () => newId('g')

// The currently-selected PLAN guide of a given orientation (h → front/rear depth, v → left/right), used
// to fix the off-axis depth when drawing a conduit in an elevation. `guides` is the model's guide list.
export function selectedPlanGuide(guides: Guide[], selIds: string[], orient: 'h' | 'v'): Guide | null {
	for (const id of selIds) { const g = guides.find((x) => x.id === id); if (g && g.plane === 'plan' && g.orient === orient) return g }
	return null
}
