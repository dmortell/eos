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
	/** Ctrl+A — select every visible + unlocked item across all editors. */
	selectAll() { for (const e of this.editors) e.selectAllVisible() }
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
	/** The common SVG angle of the selected box-like items (within 0.5°), else 0 — so a uniformly
	 *  rotated row keeps its box angle on re-select / undo (derived from the items, not stored). */
	private commonAngle(): number {
		const norm = (a: number) => { a %= 360; if (a > 180) a -= 360; if (a < -180) a += 360; return a }
		const angles = this.active().flatMap((e) => e.selAngles())
		if (!angles.length) return 0
		const first = norm(angles[0])
		for (const a of angles) if (Math.abs(norm(a) - first) > 0.5) return 0
		return first
	}
	/** The transform box: a SINGLE box-like item gives an oriented box (its angle); 2+ give a tight
	 *  oriented box at the items' common angle. Null → nothing, or a single line/graph item. */
	orientedBox(): { cx: number; cy: number; hw: number; hh: number; angle: number; single: boolean } | null {
		const total = this.count()
		if (total === 1) { const sb = this.active()[0]?.singleBox(); return sb ? { ...sb, single: true } : null }
		if (total < 2) return null
		const pts = this.editors.flatMap((e) => e.selWorldPoints())
		if (pts.length < 2) return null
		const a = this.commonAngle(), r = (-a * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
		let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity // AABB in the rotated frame
		for (const p of pts) { const lx = p.x * c - p.y * s, ly = p.x * s + p.y * c; minx = Math.min(minx, lx); miny = Math.min(miny, ly); maxx = Math.max(maxx, lx); maxy = Math.max(maxy, ly) }
		const lcx = (minx + maxx) / 2, lcy = (miny + maxy) / 2, rr = (a * Math.PI) / 180, rc = Math.cos(rr), rs = Math.sin(rr)
		return { cx: lcx * rc - lcy * rs, cy: lcx * rs + lcy * rc, hw: (maxx - minx) / 2, hh: (maxy - miny) / 2, angle: a, single: false }
	}
	moveGroup(dx: number, dy: number) { for (const e of this.active()) e.nudgeSelection(dx, dy) }
	rotateGroup(deg: number, cx: number, cy: number) { for (const e of this.active()) e.rotateSelection(deg, cx, cy) }
	scaleGroup(sx: number, sy: number, ax: number, ay: number, angle = 0) { for (const e of this.active()) e.scaleSelection(sx, sy, ax, ay, angle) }
}
