// Touch: pinch about the fingers' midpoint, one-finger pan on empty space, a tap clears, a finger on a thing passes.
import { describe, it, expect } from 'vitest'
import { pinchCamera, TouchNav } from './touch'
import type { Camera } from './camera'

const host = (empty = true) => {
	const h = { cam: { x: 0, y: 0, k: 1 } as Camera, cancelled: 0, taps: 0 }
	return { h, nav: new TouchNav({ cam: () => h.cam, setCam: (c) => { h.cam = c }, emptyAt: () => empty, cancel: () => { h.cancelled++ }, tap: () => { h.taps++ } }) }
}

describe('touch', () => {
	it('a pinch keeps the drawing point under the fingers and zooms by their spread', () => {
		const c = pinchCamera({ x: 0, y: 0, k: 1 }, { x: 100, y: 100 }, { x: 200, y: 100 }, { x: 50, y: 100 }, { x: 250, y: 100 })
		expect(c.k).toBe(2)
		expect((150 - c.x) / c.k).toBe(150)   // the model point at the midpoint is still 150
	})
	it('two fingers pinch (cancelling the tool) and pan; the last finger does nothing until all are up', () => {
		const { h, nav } = host(false)
		expect(nav.down(1, { x: 100, y: 100 })).toBe(false)   // on a thing: the tool's
		expect(nav.down(2, { x: 200, y: 100 })).toBe(true)
		expect(h.cancelled).toBe(1)
		nav.move(2, { x: 300, y: 100 })
		expect(h.cam.k).toBe(2)
		expect(nav.up(2)).toBe(true)
		expect(nav.move(1, { x: 0, y: 0 })).toBe(true)        // swallowed
		const k = h.cam.k
		expect(nav.up(1)).toBe(true)
		expect(h.cam.k).toBe(k)
	})
	it('one finger on empty space pans; a tap there clears; on a thing it passes to the tool', () => {
		const { h, nav } = host(true)
		nav.down(1, { x: 10, y: 10 }); nav.move(1, { x: 60, y: 30 }); nav.up(1)
		expect(h.cam).toMatchObject({ x: 50, y: 20 })
		expect(h.taps).toBe(0)
		nav.down(1, { x: 10, y: 10 }); nav.up(1)
		expect(h.taps).toBe(1)
		const b = host(false)
		expect(b.nav.down(1, { x: 10, y: 10 })).toBe(false)
		expect(b.nav.move(1, { x: 20, y: 10 })).toBe(false)
		expect(b.nav.up(1)).toBe(false)
	})
})
