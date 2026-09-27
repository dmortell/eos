// The view context a hit/grip/snap function needs (review.md §R1). Built once per render from the
// Viewport's $derived props and passed explicitly as the first argument, so the functions in hit.ts (and
// later grips.ts / snap.ts) read no component closure state and are unit-testable. No component state
// inside — just plain values.
import { frameOf, type ElevDir, type ElevFrame } from './geometry'
import type { Model } from '../3dview/types'

export type ViewCtx = {
	/** The projection this viewport draws: 'plan', an ElevDir, or 'iso' (= the Viewport's `kind`). */
	dir: 'plan' | 'iso' | ElevDir
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
	/** The perspective camera of the orbit view (3dview/projection perspCam); null / unset = parallel. */
	persp?: import('../3dview/projection').Persp
}

/** The elevation's horizontal VIEW FRAME (geometry ElevFrame) about the view's plan centre — valid when isElev. The
 *  one place an oblique view (a section line / elevation marker, phase 2+) will hand its own frame in. */
export const ctxFrame = (ctx: ViewCtx): ElevFrame => frameOf(ctx.elevDir, ctx.cx, ctx.cy)

/** Model-layer visibility/lock predicates a model hit-test gates on (from the model's own layers). */
export type MLayers = { visible(o: import('../3dview/types').Obj): boolean; locked(o: import('../3dview/types').Obj): boolean }
