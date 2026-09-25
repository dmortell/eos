// The command line → the ACTIVE viewport. The focused pane's active viewport registers its command target here
// (Viewport.svelte); the command line feeds it typed points / distances / Enter / Esc and selection edits.
// Coordinates here are USER coordinates: model mm with Y UP (like CAD / the DXF export); each viewport maps them to
// its own drawing space (plan: y flipped; an elevation: its on-axis coordinate and height).
import type { Pt } from './geometry'

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
	/** Selection edits (the selected SHAPES): move by (dx, dy) user mm, rotate CCW degrees / scale about their centre. */
	move(dx: number, dy: number): string | null
	rotate(deg: number): string | null
	scale(k: number): string | null
	selectAll(): void; deselect(): void; erase(): void; duplicate(): string | null; group(): string | null; ungroup(): string | null
}

export const cmdBus = $state<{ target: VpCommandTarget | null }>({ target: null })
