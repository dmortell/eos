// The command line → the ACTIVE viewport. The focused pane's active viewport registers its command target here
// (Viewport.svelte); the command line feeds it typed points / distances / Enter / Esc and selection edits.
// Coordinates here are USER coordinates: model mm with Y UP (like CAD / the DXF export); each viewport maps them to
// its own drawing space (plan: y flipped; an elevation: its on-axis coordinate and height).
//
// A running command that wants a point / a shape posts a PICK request (`cmdBus.pick`); the target viewport then
// routes its clicks to it (snapped like a draw click, ORTHO relative to `base`) and reports the cursor (`hover`) for
// the rubber band and direct-distance entry.
import type { Pt, Ent } from './geometry'
import type { GraphIssue } from '../3dview/graphAudit'

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
export type Xf = { move: Pt } | { rotate: number; base?: Pt } | { scale: number; base?: Pt } | { mirror: [Pt, Pt] }

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
	/** The shapes that can be picked / edited here (shown, unlocked, in this view) — STRETCH / QSELECT. */
	pickableEnts(): Ent[]
	/** Model mm per paper mm in this view (annotative sizes). */
	paperMm(): number
	/** User ↔ this view's drawing coords (null in 3D). */
	toDraw(u: Pt): Pt | null
	toUser(d: Pt): Pt | null
	/** Selection edits (the selected SHAPES), user coords: move by (dx, dy); rotate CCW degrees / scale about `base`
	 *  (default: their centre); copy by (dx, dy) — returns the copies' ids. */
	move(dx: number, dy: number): string | null
	rotate(deg: number, base?: Pt): string | null
	scale(k: number, base?: Pt): string | null
	copyBy(dx: number, dy: number): string | null
	/** A copy of the selection per transform (ARRAY / MIRROR), all in ONE undo step. */
	copyMany(ops: Xf[]): string | null
	/** Apply a transform to the selection (MIRROR without keeping the source). */
	transform(op: Xf): string | null
	/** EXPLODE these shapes (one undo step): a group → ungrouped; a polyline / rect / block → its parts. */
	explode(ids: string[]): { done: number; skipped: number }
	/** A shape's unrotated box in this view (drawing coords). */
	bboxOf(e: Ent): [number, number, number, number]
	/** The selection with `op` applied, uncommitted (drawing coords) — a command's ghost. */
	preview(op: Xf): Ent[]
	/** Replace / add / delete shapes (drawing coords) as ONE undo step. */
	apply(ch: { update?: Ent[]; add?: Ent[]; remove?: string[] }): void
	/** New shapes go on the current layer + this view's plane. */
	newEnt(e: Omit<Ent, 'id'>): Ent
	/** Select every pickable shape in the view (that `keep` accepts). */
	selectAll(keep?: (e: Ent) => boolean): void; deselect(): void; select(ids: string[]): void
	reorder(ids: string[], op: 'front' | 'back' | 'forward' | 'backward'): void
	erase(): void; duplicate(): string | null; group(): string | null; ungroup(): string | null
	/** The last pointer position over this view (drawing coords), or null — Ctrl+Shift+V pastes there. */
	cursor(): Pt | null
	/** ZOOM Object: frame the selection (error text when nothing's selected); whether anything is selected. */
	zoomSelection(): string | null
	hasSelection(): boolean
	/** Zoom to a window (user coords) / back to the previous view. */
	zoomWindow(a: Pt, b: Pt): void
	zoomPrev(): string | null
	/** The armed draw tool's prompt for the command line ("Specify next point" [Close/Undo]), or null (Select). */
	drawPrompt(): { prompt: string; options?: string[] } | null
	/** RACK: place a rack (a Box with rack data) centred at `at` (user coords), w × d mm, `u` units, rotated `rot`° —
	 *  plan only; returns its label, or an error. */
	addRack(o: { u: number; w: number; d: number; at: Pt; rot: number }): { label: string } | { err: string }
	/** Pasted text from another app: a text shape or a NOTE at the last cursor position here (else the view centre),
	 *  selected; returns an error to show, or null. */
	placeText(kind: 'text' | 'note', text: string): string | null
	/** Named views: this viewport's zoom / pan + drawing scale, and putting one back. */
	viewState(): { view: { zoom: number; x: number; y: number }; scale: string }
	restoreView(s: { view: { zoom: number; x: number; y: number }; scale: string }): void
	/** The viewport's <svg> (SVGOUT / PNGOUT). */
	svg(): SVGSVGElement | undefined
	/** AUDIT: this view's model's graph / connection faults (3dview/graphAudit.ts); `fix` repairs them in one undo step. */
	graphAudit(fix: boolean): GraphIssue[] | null
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
