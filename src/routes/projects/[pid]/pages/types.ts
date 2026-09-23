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

// R9 (review.md §R9, moved here from +page.svelte per eos-07's review of commit 1 — B15 already made this
// file the one owner of shared Pages types, so the workspace shapes belong here too, not duplicated
// locally in every extracted component). `WorkPane` (not `Pane`) — the SPLIT-EDITOR pane, i.e. one of
// `session.panes` — because `parts/Pane.svelte` (the component that renders one) needs to import both the
// TYPE and the COMPONENT in the same file tree, and `+page.svelte` needs both in the same file.

/** An open document tab (shared — the same tab can show in both split panes). */
export type Kind = 'plan' | 'sheet' | 'elevation' | 'model'
export type Tab = { id: string; title: string; kind: Kind; dirty: boolean; preview?: boolean; modelId?: number }

/** One split-editor pane (VS Code-style): which tab it shows, its own tool, and paper-vs-full-size layout. */
export type WorkPane = { id: string; activeId: string; tool: string; layout: 'model' | 'sheet' }

/** A viewport's content pan/zoom (not the paper-canvas pan/zoom — see viewState.svelte.ts). */
export type View = { zoom: number; x: number; y: number }

/** One entry in the floating tool strip: a single tool, or a grouped fly-out of variants (Guide is a
 *  special case with no `members` — its fly-out picks H/V orientation instead of a tool). */
export type StripItem = { tool: string } | { group: string; label: string; members: string[] }
