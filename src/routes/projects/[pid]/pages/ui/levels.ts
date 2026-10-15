// A FLOOR model's height datum is its FINISHED FLOOR LEVEL (User 2026-09-27): FL±0 = the top of the raised floor, so
// racks, furniture and walls drawn from z 0 stand ON the raised floor, and the slab lies below (FL−raised floor). The
// model's `levels` stay stored as the Risers tool gives them — heights above the SLAB TOP — and are read relative to FL
// here. (A building model's storeys keep their own datum: each storey's z is its slab top.) Tested in levels.test.ts.
import type { Levels } from '../3dview/types'

/** The raised floor's height above the slab = how far FL±0 sits above the slab top. */
export const flOffset = (lv?: Levels | null): number => lv?.raisedFloor ?? 0

/** A floor model's levels relative to FL±0: the slab top (≤ 0), the ceiling (the plenum's bottom) and the ceiling slab's
 *  underside (the plenum's top); undefined where the level isn't set. */
export function levelsFromFL(lv?: Levels | null): { slabTop: number; ceilingTile?: number; ceilingSlab?: number } {
	const r = flOffset(lv)
	return { slabTop: r ? -r : 0, ceilingTile: lv?.ceilingTile != null ? lv.ceilingTile - r : undefined, ceilingSlab: lv?.ceilingSlab != null ? lv.ceilingSlab - r : undefined }
}
