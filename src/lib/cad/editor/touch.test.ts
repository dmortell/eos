// Touch: pinch about the fingers' midpoint, one-finger pan on empty space, a tap clears, a finger on a thing passes.
import { describe, it, expect } from 'vitest'
import { pinchCamera, pinchContent, settleScale, TouchNav, type ContentGesture } from './touch'
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

describe('touch on a viewport’s content', () => {
	const vp = { rect: { x: 0, y: 0, w: 200, h: 100 }, centre: { x: 5000, y: 5000 }, scale: 100 }
	it('spreading two fingers zooms the view in (a smaller 1:N), keeping the view point under their midpoint', () => {
		const r = pinchContent(vp, { x: 90, y: 50 }, { x: 110, y: 50 }, { x: 80, y: 50 }, { x: 120, y: 50 })
		expect(r.scale).toBe(50)
		// the midpoint (100, 50) is the window's middle: the view point there is the centre, and stays
		expect(r.centre).toEqual({ x: 5000, y: 5000 })
	})
	it('moving two fingers together pans the view the other way by paper mm × scale', () => {
		const r = pinchContent(vp, { x: 90, y: 50 }, { x: 110, y: 50 }, { x: 100, y: 50 }, { x: 120, y: 50 })
		expect(r.scale).toBe(100)
		expect(r.centre).toEqual({ x: 4000, y: 5000 })
	})
	it('the scale settles on a standard 1:N when within 10 %, else stays', () => {
		expect(settleScale(96)).toBe(100)
		expect(settleScale(70)).toBe(70)
	})
	it('two fingers on a viewport go to its content, not the camera; the end is told once', () => {
		const h = { cam: { x: 0, y: 0, k: 1 } as Camera, ups: 0, moves: 0 }
		const g: ContentGesture = { update: () => { h.moves++ }, end: () => { h.ups++ } }
		const nav = new TouchNav({ cam: () => h.cam, setCam: (c) => { h.cam = c }, emptyAt: () => false, cancel: () => {}, tap: () => {}, content: () => g })
		nav.down(1, { x: 100, y: 100 }); nav.down(2, { x: 200, y: 100 })
		nav.move(2, { x: 300, y: 100 })
		expect(h.cam.k).toBe(1)
		expect(h.moves).toBe(1)
		nav.up(2); nav.up(1)
		expect(h.ups).toBe(1)
	})
})
