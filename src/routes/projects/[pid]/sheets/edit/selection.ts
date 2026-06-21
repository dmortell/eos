import type { SurfaceEditor } from './surface.svelte'

/**
 * Orchestrates selection actions across the editors that share a surface (the object +
 * annotation peer pair). Each editor still owns its own id-based selection state (so the
 * edit layers can render it), but cross-cutting actions run over the COMBINED selection
 * here — so a mixed object+annotation selection deletes / duplicates / clears as one,
 * without the host hand-coding "do X on editor A, then editor B".
 *
 * Selection itself is unified at the gesture level by SurfaceEditor (constrain /
 * beginGroupDrag / beginItemDrag / driveCtrlDrag / applyToggle) + the peer link; this
 * coordinator is the single entry point for the non-gesture actions (Delete, Ctrl+D, …).
 */
export class SelectionCoordinator {
	constructor(private editors: SurfaceEditor[]) {}

	/** Editors that currently have a selection. */
	private active() { return this.editors.filter((e) => e.selectedIds().length > 0) }
	hasSelection() { return this.active().length > 0 }
	/** Total number of selected items across all editors. */
	count() { return this.editors.reduce((n, e) => n + e.selectedIds().length, 0) }

	/** Drop every editor's selection (single + multi). */
	clear() { for (const e of this.editors) { e.clearSel(); e.clearMulti() } }
	/** Delete the whole combined selection (each editor keeps its own delete semantics). */
	deleteSelection() { for (const e of this.active()) e.deleteSelection() }
	/** Ctrl+D / panel: offset-duplicate the combined selection, selecting the clones. */
	duplicateSelection(d = 500) { for (const e of this.active()) e.duplicateSelection(d) }
}
