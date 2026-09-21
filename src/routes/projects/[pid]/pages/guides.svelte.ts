// Alignment GUIDE LINES (Visio-style) — full-view horizontal/vertical lines the user drops on a plan or
// elevation to align drawing, and, crucially, to set the DEPTH PLANE for drawing 3D objects across views:
// a horizontal guide on the plan (constant y) fixes the off-axis depth for a FRONT/REAR elevation; a
// vertical plan guide (constant x) fixes it for LEFT/RIGHT. `pos` is in the DRAWING coords of `space`
// (for the plan that's model x/y). Model-scoped + reactive, shared by every viewport like `modelSel`.
export type Guide = { id: string; space: string; orient: 'h' | 'v'; pos: number }   // space = 'plan' | ElevDir

export const guides = $state<Guide[]>([])
export const guideSel = $state<string[]>([])   // selected guide ids (single-select for now; array for parity with modelSel)

let seq = 0
export const guideId = () => 'g' + Date.now().toString(36) + seq++

export function addGuide(g: Guide) { guides.push(g); setGuideSel([g.id]) }
export function removeGuide(id: string) {
	const i = guides.findIndex((x) => x.id === id); if (i >= 0) guides.splice(i, 1)
	const j = guideSel.indexOf(id); if (j >= 0) guideSel.splice(j, 1)
}
export function setGuideSel(ids: string[]) { guideSel.splice(0, guideSel.length, ...ids) }

// The currently-selected PLAN guide of a given orientation (h for front/rear depth, v for left/right),
// used to fix the off-axis depth when drawing a conduit in an elevation. null → no guide chosen.
export function selectedPlanGuide(orient: 'h' | 'v'): Guide | null {
	for (const id of guideSel) { const g = guides.find((x) => x.id === id); if (g && g.space === 'plan' && g.orient === orient) return g }
	return null
}
