// One pointer-drag helper for the Pages Viewport (review.md §R1, step 7). Every drag machine in the
// Viewport (orbit, section move/resize, guide, scale-line endpoint, model move, model grip, marquee,
// press-draw, entity move/grip) used to hand-roll the same six lines: setPointerCapture (try/catch for
// synthetic events), preventDefault, window pointermove/pointerup listeners, a `moved` flag, the listener
// teardown on release, and a matching branch in one big cancelPointerDrag(). beginPointerDrag does all of
// that once; the DragRegistry tracks the live drags so a second finger (2-finger pan/zoom) can cancel them
// all, and counts pressed pointers so the caller can detect that second finger.
//
// Svelte delegation gotchas that shaped the callers (kept here so they aren't rediscovered):
//  (a) a child's own stopPropagation() is invisible to a DELEGATED root handler (Svelte 5 delegates
//      onpointerdown/onclick to the root and dispatches by walking up from the target) — so onDown/onClick
//      bail with `closest('.section-arrow.pick')` instead of relying on the arrow's stopPropagation;
//  (b) right/middle-button presses never reach the delegated onpointerdown because the panzoom action's
//      own listener stopPropagation()s them — hence the CAPTURE-phase `rDownPt` listener on the root.
//
// No component state here; plain DOM. Unit-tested with a stubbed window (gestures.test.ts).

export type DragHandlers<T> = {
	/** Every pointermove once the drag counts as moved (past `thresholdPx`, default 0 = immediately). */
	onMove: (e: PointerEvent, s: T) => void
	/** Release. `moved` = at least one pointermove was delivered. Listeners are already torn down. */
	onUp?: (e: PointerEvent, s: T, moved: boolean) => void
	/** Cancelled from outside (second finger / Esc / unmount) — never followed by onUp. */
	onCancel?: (s: T, moved: boolean) => void
}

export type DragHandle = {
	/** Tear the drag down without a release: listeners off, unregistered, onCancel called once. */
	cancel(): void
	/** Has a pointermove been delivered (past the threshold)? */
	readonly moved: boolean
}

export type DragOpts = {
	/** Screen px the pointer must travel before the drag counts as moved (and onMove starts). 0 = every move. */
	thresholdPx?: number
}

/** Tracks the live drags (so `cancelAll()` aborts them, e.g. when a second finger lands) and the pressed
 *  pointers (so the caller can tell a second finger from the first). Plain object, not reactive. */
export class DragRegistry {
	private live = new Set<DragHandle>()
	private pointers = new Set<number>()

	/** A press: remember the pointer. Returns true when this is a SECOND (or later) pointer. */
	noteDown(e: PointerEvent): boolean { this.pointers.add(e.pointerId); return this.pointers.size > 1 }
	/** A release / cancel (from the window-level listener the Viewport installs). */
	noteUp(e: PointerEvent): void { this.pointers.delete(e.pointerId) }
	/** Forget a pointer whose press decided NOT to start a drag (so it can't count as a first finger). */
	forget(e: PointerEvent): void { this.pointers.delete(e.pointerId) }
	/** More than one pointer is down right now. */
	get multiTouch(): boolean { return this.pointers.size > 1 }
	/** Any drag in progress. */
	get active(): boolean { return this.live.size > 0 }
	/** Abort every live drag (each one's onCancel runs). */
	cancelAll(): void { for (const h of [...this.live]) h.cancel() }

	/** @internal */ _add(h: DragHandle): void { this.live.add(h) }
	/** @internal */ _remove(h: DragHandle): void { this.live.delete(h) }
}

/** Start a pointer drag from a pointerdown: captures the pointer on `e.currentTarget` (tolerating synthetic
 *  events with no capture support), preventDefault()s, and listens on `window` for pointermove/pointerup
 *  until release or cancel. `state` is whatever the caller wants back in its handlers. */
export function beginPointerDrag<T>(e: PointerEvent, state: T, h: DragHandlers<T>, reg: DragRegistry, opts: DragOpts = {}): DragHandle {
	try { (e.currentTarget as Element | null)?.setPointerCapture?.(e.pointerId) } catch { /* synthetic events */ }
	e.preventDefault()
	const thr = opts.thresholdPx ?? 0, sx = e.clientX, sy = e.clientY
	let moved = false, done = false
	const off = () => {
		done = true
		window.removeEventListener('pointermove', onMove)
		window.removeEventListener('pointerup', onUp)
		reg._remove(handle)
	}
	const onMove = (ev: PointerEvent) => {
		if (done) return
		if (!moved && (thr <= 0 || Math.hypot(ev.clientX - sx, ev.clientY - sy) >= thr)) moved = true
		if (moved) h.onMove(ev, state)
	}
	const onUp = (ev: PointerEvent) => { if (done) return; off(); h.onUp?.(ev, state, moved) }
	const handle: DragHandle = {
		cancel() { if (done) return; off(); h.onCancel?.(state, moved) },
		get moved() { return moved },
	}
	reg._add(handle)
	window.addEventListener('pointermove', onMove)
	window.addEventListener('pointerup', onUp)
	return handle
}
