// RACK UNITS and sizes, in one place (hacky-code review #7: 1U = 44.45 mm was written four times, a rack's height
// from its U three times). Pure.
import type { Rack } from './types'

/** One rack unit (1U), mm. */
export const RU_MM = 44.45
/** The 19" mounting rails' outer width, mm (a cord crossing the rack goes this far). */
export const RAIL_W = 482.6
/** A rack's frame above and below its U space (top and plinth together), mm. */
export const RACK_FRAME_MM = 150

/** A rack's height: its own, else from its U plus its frame. */
export const rackHeight = (r: Pick<Rack, 'heightU' | 'heightMm'>): number => r.heightMm ?? r.heightU * RU_MM + RACK_FRAME_MM
/** Where its U space starts above the rack's foot (the frame split top / bottom). */
export const rackUBase = (r: Pick<Rack, 'heightU' | 'heightMm'>): number => (rackHeight(r) - r.heightU * RU_MM) / 2
