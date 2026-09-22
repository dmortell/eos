// The view context a hit/grip/snap function needs (review.md §R1). Built once per render from the
// Viewport's $derived props and passed explicitly as the first argument, so the functions in hit.ts (and
// later grips.ts / snap.ts) read no component closure state and are unit-testable. No component state
// inside — just plain values.
import type { ElevDir } from './geometry'
import type { Model } from '../3dview/types'

export type ViewCtx = {
	/** The projection this viewport draws: 'floorplan' (plan), an ElevDir, or 'iso'. (Today Viewport's
	 *  `kind`; a later mop-up renames 'floorplan' → 'plan'.) */
	dir: 'floorplan' | 'iso' | ElevDir
	isPlan: boolean
	isElev: boolean
	isIso: boolean
	/** Valid when isElev; defaults 'front' otherwise. */
	elevDir: ElevDir
	/** Scale pivot / plan centre (PLAN_CX / PLAN_CY, mm). */
	cx: number
	cy: number
	/** Elevation ground-line y (GROUND). */
	ground: number
	/** This viewport's frame id, for `space: 'view:<id>'` scoping (undefined on a model-layout tab). */
	frameId?: string
	/** Model mm per paper mm (= 1/dscale), for sizing paper-constant geometry like the text box. */
	paperMm: number
	/** The 3D model this viewport renders/edits (its objects/layers), for model-object hit-testing. */
	mdl: Model | undefined
	/** Iso (oblique) camera angles, for the 3D-view projection + depth pick. */
	yaw: number
	pitch: number
}

/** Model-layer visibility/lock predicates a model hit-test gates on (from the model's own layers). */
export type MLayers = { visible(o: import('../3dview/types').Obj): boolean; locked(o: import('../3dview/types').Obj): boolean }
