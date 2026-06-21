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
	/** Host hook: checkpoint the pre-mutate state into undo (so undo of a cut re-selects). */
	beforeMutate: (() => void) | null = null

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

	// ── clipboard: copy / cut / paste span objects AND annotations ──
	/** Copy the combined selection. Clears all clipboards first so only the current selection
	 *  (whichever editors it spans) ends up on the clipboard. */
	copySelection() { for (const e of this.editors) e.clearClipboard(); for (const e of this.active()) e.copySel() }
	/** Cut = copy + delete, checkpointed so undo restores + re-selects the originals. */
	cutSelection() { this.beforeMutate?.(); for (const e of this.editors) e.clearClipboard(); for (const e of this.active()) { e.copySel(); e.deleteSelection() } }
	/** Paste every editor's clipboard (only the editors that were copied have content). */
	paste() { for (const e of this.editors) e.paste() }

	// ── arrow-key nudge / resize over the combined selection (history coalesces via touch) ──
	nudge(dx: number, dy: number) { for (const e of this.active()) e.nudgeSelection(dx, dy) }
	resize(dw: number, dh: number) { for (const e of this.active()) e.resizeSelection(dw, dh) }

	// ── grouping (H12): tag the combined selection with one group id so they move/select together ──
	group(makeId: () => string) {
		if (this.count() < 2) return // need ≥2 items to form a group
		this.beforeMutate?.()
		const gid = makeId()
		for (const e of this.active()) e.setGroup(e.selectedIds(), gid)
	}
	ungroup() {
		this.beforeMutate?.()
		for (const e of this.active()) e.setGroup(e.selectedIds(), undefined)
	}

	// ── group transform box (H9): combined SVG-world bounds + move/rotate/scale of the selection ──
	count2() { return this.count() } // alias for readability at call sites
	/** Combined AABB (SVG world) of the whole selection across both editors, or null. */
	groupBounds() {
		let b: { x0: number; y0: number; x1: number; y1: number } | null = null
		for (const e of this.editors) {
			const eb = e.selWorldBounds(); if (!eb) continue
			b = b ? { x0: Math.min(b.x0, eb.x0), y0: Math.min(b.y0, eb.y0), x1: Math.max(b.x1, eb.x1), y1: Math.max(b.y1, eb.y1) } : eb
		}
		return b
	}
	/** The transform box: a SINGLE box-like item gives an oriented box (its angle); 2+ give an AABB
	 *  (angle 0). Null → nothing, or a single line/graph item that keeps its own endpoint handles. */
	orientedBox(): { cx: number; cy: number; hw: number; hh: number; angle: number; single: boolean } | null {
		const total = this.count()
		if (total === 1) { const sb = this.active()[0]?.singleBox(); return sb ? { ...sb, single: true } : null }
		if (total >= 2) {
			const bb = this.groupBounds(); if (!bb) return null
			return { cx: (bb.x0 + bb.x1) / 2, cy: (bb.y0 + bb.y1) / 2, hw: (bb.x1 - bb.x0) / 2, hh: (bb.y1 - bb.y0) / 2, angle: 0, single: false }
		}
		return null
	}
	moveGroup(dx: number, dy: number) { for (const e of this.active()) e.nudgeSelection(dx, dy) }
	rotateGroup(deg: number, cx: number, cy: number) { for (const e of this.active()) e.rotateSelection(deg, cx, cy) }
	scaleGroup(sx: number, sy: number, ax: number, ay: number, angle = 0) { for (const e of this.active()) e.scaleSelection(sx, sy, ax, ay, angle) }
}
