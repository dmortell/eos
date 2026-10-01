// DEV-ONLY: look at an elevation from ANY plan angle before the section-line / elevation markers exist
// (elevation-section-plan.md phase 2; phases 3–4 add the real, user-facing markers that hand a view its frame).
// No UI and nothing persisted — from the browser console in `pnpm dev`:
//   __pagesOblique(30)          every elevation viewport is seen from plan 30° (frameAt: 90 = front, 0 = right, 180 = left)
//   __pagesOblique(30, 'vf…')   only that sheet frame (its id — a frame's Properties / the DOM)
//   __pagesOblique(null)        back to normal (null with an id clears just that frame)
//   __pagesOblique()            lists what is set
// The view keeps its ElevDir `kind` (shapes drawn in it still land on that dir's plane); a section-linked frame's box
// becomes the oblique frame's covering OClip (projection `oclipOf`). 3D objects move / resize along its t (phase 5).
// A production build compiles all of this away (`import.meta.env.DEV` is false: nothing is set, no hook installed).
import { SvelteMap } from 'svelte/reactivity'
import { frameAt, PLAN_CX, PLAN_CY, type ElevFrame } from './geometry'

/** Angle (plan degrees) per sheet frame id; '*' = every elevation viewport (model-space panes too). */
const angles = new SvelteMap<string, number>()

/** The dev oblique angle for a viewport (its frame id, else only the '*' wildcard applies); undefined = none. */
export function devObliqueAngle(frameId?: string): number | undefined {
	if (!import.meta.env.DEV) return undefined
	return (frameId != null ? angles.get(frameId) : undefined) ?? angles.get('*')
}
/** That angle's view frame about the plan centre (what the Viewport draws with; +page's Fit uses it too); null = none. */
export function devObliqueFrame(frameId?: string): ElevFrame | null {
	const deg = devObliqueAngle(frameId)
	return deg == null ? null : frameAt([PLAN_CX, PLAN_CY], deg)
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
	;(window as unknown as { __pagesOblique: (deg?: number | null, id?: string) => Record<string, number> }).__pagesOblique = (deg, id = '*') => {
		if (deg === undefined) return Object.fromEntries(angles)
		if (deg === null) { if (id === '*') angles.clear(); else angles.delete(id) }
		else if (Number.isFinite(deg)) angles.set(id, ((deg % 360) + 360) % 360)
		return Object.fromEntries(angles)
	}
}
