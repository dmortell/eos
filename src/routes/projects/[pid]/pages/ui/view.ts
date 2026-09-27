// The view context a hit/grip/snap function needs (review.md §R1). Built once per render from the
// Viewport's $derived props and passed explicitly as the first argument, so the functions in hit.ts (and
// later grips.ts / snap.ts) read no component closure state and are unit-testable. No component state
// inside — just plain values.
import { frameOf, frameAxis, type ElevDir, type ElevFrame } from './geometry'
import type { Model, OClip } from '../3dview/types'
import type { ProjDir } from '../3dview/projection'

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
	/** An elevation's EXPLICIT view frame (elevation-section-plan.md phase 2): an oblique section / elevation looks
	 *  along its n instead of `elevDir`'s axis. Unset = the four-dir frame about (cx, cy). */
	frame?: ElevFrame
	/** Its ORIENTED clip (the section's cut line + depth), when the view has one. */
	oclip?: OClip
}

/** The elevation's horizontal VIEW FRAME (geometry ElevFrame) — valid when isElev: the view's own frame when it has
 *  one (an oblique view), else `elevDir`'s about the plan centre. The one place a view's frame is resolved. */
export const ctxFrame = (ctx: ViewCtx): ElevFrame => ctx.frame ?? frameOf(ctx.elevDir, ctx.cx, ctx.cy)
/** What the projection engine (`project` / `viewMap`) draws this view as: its explicit frame in an elevation that has
 *  one, else `dir`. */
export const ctxProj = (ctx: ViewCtx): ProjDir => (ctx.isElev && ctx.frame ? ctx.frame : ctx.dir)
/** An OBLIQUE elevation (a frame off the four axes): 3D objects move along its t (phase 5); no graph drawing / guides. */
export const ctxOblique = (ctx: ViewCtx): boolean => ctx.isElev && !!ctx.frame && frameAxis(ctx.frame) === null
/** A cache-key fragment for the view frame (hit / snap caches key on the view). */
export const frameKey = (ctx: ViewCtx): string => (ctx.frame ? `${ctx.frame.o}|${ctx.frame.t}` : '')

/** Model-layer visibility/lock predicates a model hit-test gates on (from the model's own layers). */
export type MLayers = { visible(o: import('../3dview/types').Obj): boolean; locked(o: import('../3dview/types').Obj): boolean }
