// Shared Pages types + option lists — one home for what used to be defined several times over (B15):
// a projection direction (`Proj`, identical to the 3D engine's `Dir`), a sheet viewport frame
// (`SheetFrame`, previously duplicated in +page, PaperPage and PropertiesPanel), and the scale /
// projection option lists (`SCALES` was two slightly different arrays; the projection labels were
// `PROJ_LABEL` vs `DIR_LABEL` vs `PROJ_OPTS`). All derive from the engine's `Dir`/`DIR_LABEL`.
import type { Dir, Clip } from './3dview/types'
import { DIR_LABEL } from './3dview/types'
export type { Dir, Clip }
export { DIR_LABEL }

/** Pages historically names a projection direction `Proj` — identical to the model engine's `Dir`. */
export type Proj = Dir

/** [value, label] pairs for a projection <select>, derived from DIR_LABEL. */
export const PROJ_OPTS = Object.entries(DIR_LABEL) as [Proj, string][]

/** A sheet's viewport frame (AutoCAD paper space): its own projection + scale + geometry + optional
 *  model. The sheet's page model is just an array of these; no special "primary". */
export type SheetFrame = {
	id: string; x: number; y: number; w: number; h: number
	border: 'dashed' | 'solid' | 'none'
	proj: Proj; scale: string; clip: Clip | null; label: string; modelId?: number
}

/** Drawing scales offered in the scale pickers (viewport bar + Properties). */
export const SCALES = ['1:1', '1:2', '1:5', '1:10', '1:15', '1:20', '1:25', '1:50', '1:100', '1:150', '1:200', '1:500']
