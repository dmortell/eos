// Shared Pages types + option lists — one home for what used to be defined several times over (B15):
// a projection direction (`Proj`, identical to the 3D engine's `Dir`), a sheet viewport frame
// (`SheetFrame`, previously duplicated in +page, PaperPage and PropertiesPanel), and the scale /
// projection option lists (`SCALES` was two slightly different arrays; the projection labels were
// `PROJ_LABEL` vs `DIR_LABEL` vs `PROJ_OPTS`). All derive from the engine's `Dir`/`DIR_LABEL`.
import type { Dir, Clip, ModelId } from './3dview/types'
import { DIR_LABEL } from './3dview/types'
export type { Dir, Clip, ModelId }
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
	proj: Proj; scale: string; clip: Clip | null; label: string; modelId?: ModelId
	/** Pages sheets (drawings-plan §2.2): the frame's sequence number on its sheet — its default, printable label. */
	seq?: number
	/** VP Freeze (AutoCAD): layer ids hidden in THIS frame only, on top of the model's own layer on/off.
	 *  Document state — it rides the frames history, so a freeze is undoable. */
	frozen?: string[]
	/** XP22: a locked frame can't be moved or resized on the paper (still selectable, editable inside). */
	locked?: boolean
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
// B18: `docId` is the tab's stable DRAWING id — the navigator node id for a tree drawing, `floor:<name>` for
// a floor's model tab, a fresh id for a New page. Every per-drawing store (docs, the persisted canvas view)
// is keyed by it, so renaming a tab's title orphans nothing, and a drawing is found again by id, not title.
export type Tab = { id: string; docId: string; title: string; kind: Kind; dirty: boolean; preview?: boolean; modelId?: ModelId }

/** One split-editor pane (VS Code-style): which tab it shows, its own tool, and paper-vs-full-size layout. */
export type WorkPane = { id: string; activeId: string; tool: string; layout: 'model' | 'sheet' }

/** A viewport's content pan/zoom (not the paper-canvas pan/zoom — see viewState.svelte.ts). */
export type View = { zoom: number; x: number; y: number }

/** One entry in the floating tool strip: a single tool, or a grouped fly-out of variants (Guide is a
 *  special case with no `members` — its fly-out picks H/V orientation instead of a tool). */
export type StripItem = { tool: string } | { group: string; label: string; members: string[] }

// R9's workspace-object step (eos-07's review of commit 1, point 3): +page.svelte's ~30 doc/view accessor
// FUNCTIONS (framesOf, viewOf, vpEditor, …) were each their own prop on Pane.svelte — an R6-callback-bundle
// problem one level down. `Workspace` bundles all of them (plus the handful of small per-pane ACTIONS that
// used to be built as one-off closures per pane — `setFocused`/`setPaneTool`/etc. take the pane/index
// explicitly instead, since Pane already has `pane`/`pi`) into ONE prop every pane-level component takes.
// It is NOT the full B17 fix (the module-level singletons — models/layers/imgEdit/docs/viewState/selStore —
// still leak across a project→project client-side navigation); it only addresses the prop-explosion half.
export type Workspace = {
	tabs: Tab[]; kindIcon: Record<Kind, string>; STRIP: StripItem[]; iconOf: (tool: string) => string
	rev: string; revisions: { name: string; note: string; snap: unknown; t: number }[]
	/** The tab's filled title block (phase 5, titleBlock.ts). */
	titleBlockOf: (tabId: string) => { logo?: string; cells: import('./titleBlock').TbCell[] }
	acadMode: boolean; statusText: string
	openTab: (id: string, pane?: number) => void; promoteTab: (id: string) => void
	closeTab: (id: string, e?: Event) => void; addTab: (kind?: Kind, title?: string, modelId?: ModelId, docId?: string) => void
	pickFromMenu: (id: string, pane: number) => void; splitVertical: () => void; closePane: (idx: number) => void
	setFocused: (pi: number) => void; toggleTabMenu: (pi: number) => void
	setPaneTool: (pane: WorkPane, t: string) => void; toggleLayout: (pane: WorkPane) => void
	setCanvasEl: (pi: number, el: HTMLElement | undefined) => void
	activeVpOf: (tabId: string) => string | null; isVpActive: (id?: string) => boolean; deactivateVp: (id?: string) => void
	onCanvasMove: () => void
	canvasPan: (pane: { id: string; activeId: string }, dx: number, dy: number) => void
	canvasZoomFn: (pane: { id: string; activeId: string }, el: HTMLElement, f: number, clientX: number, clientY: number) => void
	framesOf: (tabId: string) => SheetFrame[]; scaleOf: (id?: string) => string
	updateFrame: (tabId: string, id: string, patch: Partial<SheetFrame>) => void
	setScale: (id: string | undefined, s: string) => void
	fitPane: (idx: number) => void
	canvasViewOf: (pane: { id: string; activeId: string }) => View
	paperOf: (id?: string) => { size: import('./constants').PaperSize; landscape: boolean; margin?: number }
	paperDimsOf: (id?: string) => { w: number; h: number }
	navZoom: (f: number) => void; navFit: () => void
	projOf: (pane: { id: string }, a: Tab | null) => Proj
	gizmoProj: (pane: { id: string }, a: Tab | null) => Proj
	gizmoSet: (pane: { id: string }, a: Tab | null, proj: Proj) => void
	orbitOf: (paneId: string, viewId: string, proj: Proj) => { yaw: number; pitch: number }
	viewOf: (paneId: string, viewId: string, proj: Proj) => View
	entsOf: (id: string) => import('./ui/geometry').Ent[]
	entsForModel: (mid?: ModelId) => import('./ui/geometry').Ent[]
	paperEditor: (a: Tab) => import('./ui/editor').Editor
	vpFrameView: (a: Tab, pane: { id: string; tool: string }, frame: SheetFrame) => import('./ui/vpTypes').VpOn
	vpEditor: (a: Tab, viewId: string) => import('./ui/editor').Editor
	vpView: (a: Tab, pane: { id: string; tool: string }) => import('./ui/vpTypes').VpOn
	seedFrame: (tabId: string, x: number, y: number, w: number, h: number) => void
	addFrame: (tabId: string, x: number, y: number, w: number, h: number) => void
	commitFrame: (tabId: string, label: string) => void
	envFor: (pane: { id: string; activeId: string }) => import('./ui/vpTypes').Env
}
