// EOS input mode's press-drag drawing (Dave 2026-10-13): press at the first point, drag, release at the second. The
// click tools (line / trunk / conduit / wall runs, dimension) only understand clicks, so this turns one press-drag into
// the clicks they already take — nothing in the tools changes. Shape tools (rectangle, ellipse, box, image) already
// draw on a press-drag themselves and are left alone.
//
//   not drawing yet:  press = the first click now;  release after a drag = the second click there;  release without
//                     a drag = nothing more (the first click stands, the next click is the second, as in ACAD mode)
//   drawing already:  the press itself gives nothing (it is the run's last point, or near it);  release after a drag =
//                     the next click there (a segment);  release without a drag = a plain click at the press point
import type { Pt } from '../domain/types'
import type { PointerIn } from './tools'

/** Tools whose points are clicks. */
export const PRESS_DRAG_TOOLS: ReadonlySet<string> = new Set(['line', 'trunk', 'conduit', 'wall', 'dimension'])

export class PressDrag {
	#press: Pt | null = null
	#moved = false
	#sent = false

	/** `slop`: how far (screen px) the pointer may stray before the press counts as a drag. */
	constructor(private slop = 4) {}

	get pressing(): boolean { return this.#press != null }
	get moved(): boolean { return this.#moved }

	/** A press at screen point `s`. `carryOn` = the tool is mid-run. True = give the
	 *  tool a click at the press point now. */
	down(s: Pt, carryOn: boolean): boolean {
		this.#press = s; this.#moved = false
		this.#sent = !carryOn
		return this.#sent
	}
	move(s: Pt): void {
		const p = this.#press
		if (p && !this.#moved && Math.hypot(s.x - p.x, s.y - p.y) > this.slop) this.#moved = true
	}
	/** The release at screen point `s`: where the click goes ('release' = at the release, 'press' = at the press), or none. */
	up(s: Pt): 'release' | 'press' | null {
		if (!this.#press) return null
		this.move(s)
		const out = this.#moved ? 'release' : this.#sent ? null : 'press'
		this.cancel()
		return out
	}
	cancel(): void { this.#press = null; this.#moved = false; this.#sent = false }
}

/** PressDrag wired to a click sink: the canvas gives it the pointer events, `click` is what the tool takes as a click
 *  (its down, then up). The release's click never counts as a double-click, so a run isn't finished by a drag. */
export class PressDragInput {
	#pd: PressDrag
	#pressIn: PointerIn | null = null

	constructor(private click: (e: PointerIn) => void, slop = 4) { this.#pd = new PressDrag(slop) }

	get pressing(): boolean { return this.#pd.pressing }
	down(e: PointerIn, s: Pt, carryOn: boolean): void {
		this.#pressIn = e
		if (this.#pd.down(s, carryOn)) this.click(e)
	}
	move(s: Pt): void { this.#pd.move(s) }
	up(e: PointerIn, s: Pt): void {
		const how = this.#pd.up(s), at = this.#pressIn
		this.#pressIn = null
		if (how === 'release') this.click({ ...e, count: 1 })
		else if (how === 'press' && at) this.click(at)
	}
	cancel(): void { this.#pd.cancel(); this.#pressIn = null }
}
