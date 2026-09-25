// The command line → the ACTIVE viewport. The focused pane's active viewport registers its command target here
// (Viewport.svelte); the command line feeds it typed points / distances / Enter / Esc and selection edits.
// Coordinates here are USER coordinates: model mm with Y UP (like CAD / the DXF export); each viewport maps them to
// its own drawing space (plan: y flipped; an elevation: its on-axis coordinate and height).
//
// A running command that wants a point / a shape posts a PICK request (`cmdBus.pick`); the target viewport then
// routes its clicks to it (snapped like a draw click, ORTHO relative to `base`) and reports the cursor (`hover`) for
// the rubber band and direct-distance entry.
import type { Pt, Ent } from './geometry'

export type PickReq = {
	kind: 'point' | 'ent'
	/** user coords — the rubber band starts here; ORTHO / Shift constrain relative to it */
	base?: Pt
	/** a live preview for the cursor (user coords) → shapes in the view's DRAWING coords, drawn ghosted */
	ghost?: (u: Pt) => Ent[]
	/** draw the rubber band as a rectangle from `base` (a zoom window) */
	box?: boolean
	/** a click: `p` user coords; `ent` the top pickable shape under it (kind 'ent') */
	resolve: (r: { p: Pt; ent?: string }) => void
}

/** A selection transform, user coords: move by a vector / rotate CCW degrees / scale — about `base` (default: the
 *  selection's centre). */
export type Xf = { move: Pt } | { rotate: number; base?: Pt } | { scale: number; base?: Pt }

export type VpCommandTarget = {
	/** A draw tool is waiting for points (a draft is open, or a draw tool is armed). */
	drawing(): boolean
	/** The last point typed / placed (user coords) — the base for @relative input. */
	lastPoint(): Pt | null
	/** Feed a point to the active tool as if clicked there; returns an error to show, or null. */
	acceptPoint(u: Pt): string | null
	/** A bare number while drawing: that far from the last point, toward the cursor (direct distance entry). */
	distance(n: number): string | null
	finish(): void; cancel(): void; close(): void; undoPoint(): void
	/** The selected shapes (ids), and shapes by id (plain snapshots, drawing coords). */
	selected(): string[]
	ents(ids: string[]): Ent[]
	/** Every shape shown in this view (drawing coords) — cutting / boundary edges for TRIM / EXTEND. */
	visibleEnts(): Ent[]
	/** User ↔ this view's drawing coords (null in 3D). */
	toDraw(u: Pt): Pt | null
	toUser(d: Pt): Pt | null
	/** Selection edits (the selected SHAPES), user coords: move by (dx, dy); rotate CCW degrees / scale about `base`
	 *  (default: their centre); copy by (dx, dy) — returns the copies' ids. */
	move(dx: number, dy: number): string | null
	rotate(deg: number, base?: Pt): string | null
	scale(k: number, base?: Pt): string | null
	copyBy(dx: number, dy: number): string | null
	/** The selection with `op` applied, uncommitted (drawing coords) — a command's ghost. */
	preview(op: Xf): Ent[]
	/** Replace / add / delete shapes (drawing coords) as ONE undo step. */
	apply(ch: { update?: Ent[]; add?: Ent[]; remove?: string[] }): void
	/** New shapes go on the current layer + this view's plane. */
	newEnt(e: Omit<Ent, 'id'>): Ent
	selectAll(): void; deselect(): void; select(ids: string[]): void
	reorder(ids: string[], op: 'front' | 'back' | 'forward' | 'backward'): void
	erase(): void; duplicate(): string | null; group(): string | null; ungroup(): string | null
	/** Zoom to a window (user coords) / back to the previous view. */
	zoomWindow(a: Pt, b: Pt): void
	zoomPrev(): string | null
	/** Pick the shape at a user point (top-most pickable), or null. */
	entAt(u: Pt): string | null
}

/** RAW state (not deep $state): the viewport compares `target` by identity with its own `cmdTarget` — a deep proxy
 *  would never be `===` the original. */
class CmdBus {
	target = $state.raw<VpCommandTarget | null>(null)
	pick = $state.raw<PickReq | null>(null)
	hover = $state.raw<Pt | null>(null)
	/** a command is running (it owns Enter / Esc / right-click); `signal` delivers those keys to it */
	busy = $state(false)
	signal: ((k: 'enter' | 'cancel') => void) | null = null
}
export const cmdBus = new CmdBus()
