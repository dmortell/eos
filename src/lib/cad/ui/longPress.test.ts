// Long-press = right-click on touch: a finger held still fires once, after the delay; drifting, a second finger or
// lifting first cancels it; a press nobody took doesn't count as fired (its click stays a click).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LongPress, LONG_PRESS_MS, LONG_PRESS_SLOP } from './longPress'
import type { Pt } from '../domain/types'

const make = (taken = true) => {
	const fired: Pt[] = []
	const lp = new LongPress((at) => { fired.push(at); return taken })
	return { lp, fired }
}

describe('long-press', () => {
	beforeEach(() => { vi.useFakeTimers() })
	afterEach(() => { vi.useRealTimers() })

	it('a finger held still opens the menu once, where it was pressed, and its lift is not a click', () => {
		const { lp, fired } = make()
		lp.down(1, { x: 10, y: 20 }, true)
		vi.advanceTimersByTime(LONG_PRESS_MS - 1)
		expect(fired).toEqual([])
		lp.move(1, { x: 13, y: 24 })   // a little drift is still "held"
		vi.advanceTimersByTime(1)
		expect(fired).toEqual([{ x: 10, y: 20 }])
		vi.advanceTimersByTime(LONG_PRESS_MS * 3)
		expect(fired.length).toBe(1)
		expect(lp.up(1)).toBe(true)
	})
	it('a tap (lifted before the delay) is not a long-press', () => {
		const { lp, fired } = make()
		lp.down(1, { x: 0, y: 0 }, true)
		vi.advanceTimersByTime(LONG_PRESS_MS / 2)
		expect(lp.up(1)).toBe(false)
		vi.advanceTimersByTime(LONG_PRESS_MS)
		expect(fired).toEqual([])
	})
	it('moving further than the slop is a drag or a pan, not a long-press', () => {
		const { lp, fired } = make()
		lp.down(1, { x: 0, y: 0 }, true)
		lp.move(1, { x: LONG_PRESS_SLOP + 1, y: 0 })
		vi.advanceTimersByTime(LONG_PRESS_MS * 2)
		expect(fired).toEqual([])
		expect(lp.up(1)).toBe(false)
	})
	it('a second finger (a pinch) cancels it, and the finger left behind does not start a new one', () => {
		const { lp, fired } = make()
		lp.down(1, { x: 0, y: 0 }, true)
		vi.advanceTimersByTime(LONG_PRESS_MS / 2)
		lp.down(2, { x: 100, y: 0 })
		vi.advanceTimersByTime(LONG_PRESS_MS * 2)
		lp.up(2)
		vi.advanceTimersByTime(LONG_PRESS_MS * 2)
		expect(fired).toEqual([])
		lp.up(1)
		lp.down(3, { x: 5, y: 5 }, true)   // the next touch starts afresh
		vi.advanceTimersByTime(LONG_PRESS_MS)
		expect(fired).toEqual([{ x: 5, y: 5 }])
	})
	it('a press nobody made a menu for does not swallow its click', () => {
		const { lp, fired } = make(false)
		lp.down(1, { x: 0, y: 0 }, true)
		vi.advanceTimersByTime(LONG_PRESS_MS)
		expect(fired.length).toBe(1)
		expect(lp.up(1)).toBe(false)
	})
	it('a finger whose lift was lost does not block the next touch', () => {
		const { lp, fired } = make()
		lp.down(1, { x: 0, y: 0 }, true)   // its up never arrives
		lp.down(2, { x: 9, y: 9 }, true)
		vi.advanceTimersByTime(LONG_PRESS_MS)
		expect(fired).toEqual([{ x: 9, y: 9 }])
	})
	it('cancel (the browser opened its own menu, a drag began) stops it firing', () => {
		const { lp, fired } = make()
		lp.down(1, { x: 0, y: 0 }, true)
		expect(lp.pending).toBe(true)
		lp.cancel()
		expect(lp.pending).toBe(false)
		vi.advanceTimersByTime(LONG_PRESS_MS * 2)
		expect(fired).toEqual([])
	})
})
