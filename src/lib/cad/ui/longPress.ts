// LONG-PRESS = RIGHT-CLICK on a touch screen (an iPad has no right button, so the selection, tab, Navigator and table
// menus were out of reach). A finger or pen held still ~500 ms sends a `contextmenu` event to what it's on, so every
// right-click menu opens unchanged; moving more than ~8 px, a second finger (a pinch) or lifting first cancels it.
// When a menu was opened, the click the finger's lift makes is swallowed (it would close the menu, or act on the row).
// `LongPress` is the timer (tested with fake timers in longPress.test.ts); `longPress` the action that wires it up.
import type { Pt } from '../domain/types'

export const LONG_PRESS_MS = 500
/** Screen px the finger may drift and still be "held still" (a press that moves further is a drag or a pan). */
export const LONG_PRESS_SLOP = 8

/** The timer for one press. `fire` runs once the finger has been still for `ms`; it returns whether a menu took it. */
export class LongPress {
	#pts = new Set<number>()
	#press: { id: number; at: Pt } | null = null
	#timer: ReturnType<typeof setTimeout> | null = null
	/** The last press fired and a menu took it: its click is not a click. */
	fired = false
	constructor(private fire: (at: Pt) => boolean, private ms = LONG_PRESS_MS, private slop = LONG_PRESS_SLOP) {}

	/** A finger down. `first`: the first finger of a new touch (any finger left over from a lost `up` is forgotten). */
	down(id: number, at: Pt, first = false): void {
		if (first) { this.cancel(); this.#pts.clear() }
		this.#pts.add(id)
		if (this.#pts.size > 1) { this.cancel(); return }   // two fingers: a pinch / pan, never a menu
		this.fired = false
		this.#press = { id, at }
		this.#timer = setTimeout(() => {
			this.#timer = null
			const p = this.#press
			this.#press = null
			if (p) this.fired = this.fire(p.at)
		}, this.ms)
	}
	move(id: number, at: Pt): void {
		const p = this.#press
		if (p && p.id === id && Math.hypot(at.x - p.at.x, at.y - p.at.y) > this.slop) this.cancel()
	}
	/** A finger up (or cancelled). True = this press opened a menu. */
	up(id: number): boolean {
		this.#pts.delete(id)
		if (this.#press?.id === id) this.cancel()
		return this.fired
	}
	/** Whatever is pending won't fire (a drag started, the browser opened its own menu). */
	cancel(): void {
		if (this.#timer) clearTimeout(this.#timer)
		this.#timer = null
		this.#press = null
	}
	get pending(): boolean { return this.#timer !== null }
}

/** Fields keep the system's own long-press (select text, the magnifier, paste). */
const FIELD = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])'

/** Svelte action: long-presses (touch, pen) anywhere inside `node` become right-clicks on the element pressed. The
 *  `contextmenu` sent is a PointerEvent carrying the press's `pointerType`, so a handler can tell it from a mouse's. */
export function longPress(node: HTMLElement): { destroy(): void } {
	let target: Element | null = null, type = 'touch', upAt = -Infinity
	/** The event we're sending (any other `contextmenu` during a press is the browser's own). */
	let mine: Event | null = null
	const lp = new LongPress((at) => {
		const el = target?.isConnected ? target : document.elementFromPoint(at.x, at.y)
		if (!el) return false
		const init = { bubbles: true, cancelable: true, composed: true, clientX: at.x, clientY: at.y, button: 2 }
		const ev = typeof PointerEvent === 'function' ? new PointerEvent('contextmenu', { ...init, pointerType: type }) : new MouseEvent('contextmenu', init)
		mine = ev
		const taken = !el.dispatchEvent(ev)   // a handler that opened a menu called preventDefault
		mine = null
		return taken
	})
	const at = (e: PointerEvent): Pt => ({ x: e.clientX, y: e.clientY })
	const down = (e: PointerEvent) => {
		if (e.pointerType === 'mouse') return
		target = e.target as Element
		type = e.pointerType
		lp.down(e.pointerId, at(e), e.isPrimary)
		if (target?.closest?.(FIELD)) lp.cancel()
	}
	const move = (e: PointerEvent) => { if (e.pointerType !== 'mouse') lp.move(e.pointerId, at(e)) }
	const up = (e: PointerEvent) => { if (e.pointerType !== 'mouse' && lp.up(e.pointerId)) upAt = performance.now() }
	// the browser's own long-press menu (Android) came first: that one is the menu, ours doesn't follow
	const menu = (e: Event) => { if (e !== mine && lp.pending) lp.cancel() }
	// a drag lifted by the long press (a draggable row / tab) — before ours fired the drag wins; after, it doesn't start
	const drag = (e: DragEvent) => { if (lp.pending) lp.cancel(); else if (lp.fired) e.preventDefault() }
	const click = (e: MouseEvent) => {
		if (!lp.fired) return
		lp.fired = false
		if (performance.now() - upAt < 1000) { e.preventDefault(); e.stopPropagation() }
	}
	const opts = { capture: true }
	node.addEventListener('pointerdown', down, opts)
	node.addEventListener('pointermove', move, opts)
	node.addEventListener('pointerup', up, opts)
	node.addEventListener('pointercancel', up, opts)
	node.addEventListener('contextmenu', menu, opts)
	node.addEventListener('dragstart', drag, opts)
	node.addEventListener('click', click, opts)
	return {
		destroy() {
			lp.cancel()
			node.removeEventListener('pointerdown', down, opts)
			node.removeEventListener('pointermove', move, opts)
			node.removeEventListener('pointerup', up, opts)
			node.removeEventListener('pointercancel', up, opts)
			node.removeEventListener('contextmenu', menu, opts)
			node.removeEventListener('dragstart', drag, opts)
			node.removeEventListener('click', click, opts)
		},
	}
}
