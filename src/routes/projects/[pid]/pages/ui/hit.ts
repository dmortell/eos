// Pure hit-testing primitives — the first, ctx-free slice extracted from ui/Viewport.svelte
// (review.md §R1, step 3). These take everything they need as arguments (no component closure), so
// they are unit-testable and shared by hit-testing, grips and the render snippets. The view-dependent
// hit functions (hitEnt/bbox/pickable/hitModel/…) follow in the next slice, taking a ViewCtx.
import type { Pt, Ent } from './geometry'

/** Rotate `p` about centre `c` by `deg` degrees (CW in screen/plan space, y-down). Pure. */
export function rotatePt(p: Pt, c: Pt, deg: number): Pt {
	const a = deg * Math.PI / 180, s = Math.sin(a), co = Math.cos(a), dx = p[0] - c[0], dy = p[1] - c[1]
	return [c[0] + dx * co - dy * s, c[1] + dx * s + dy * co]
}

/** A shape counts as FILLED (pickable anywhere inside) when it has a real fill, not 'none'. */
export const isFilled = (e: Ent): boolean => !!e.fill && e.fill !== 'none'

/** Is `p` within `thr` of the rect [x0,y0]-[x1,y1]? A FILLED rect picks anywhere inside; an unfilled
 *  one picks only within `thr` of the border band (the empty interior is not a hitbox, like CAD). */
export function inBox(p: Pt, x0: number, y0: number, x1: number, y1: number, thr: number, filled: boolean): boolean {
	const outer = p[0] >= x0 - thr && p[0] <= x1 + thr && p[1] >= y0 - thr && p[1] <= y1 + thr
	if (!outer) return false
	if (filled) return true
	const inner = p[0] > x0 + thr && p[0] < x1 - thr && p[1] > y0 + thr && p[1] < y1 - thr
	return !inner   // within the border band only
}

/** Object SPACE: a 'plan'/undefined entity lives in model/plan space (projected into every elevation,
 *  layer-gated); an ElevDir entity is drawn natively in that one elevation. True for the plan-space case. */
export const onPlanPlane = (e: Ent): boolean => !e.plane || e.plane === 'plan'
