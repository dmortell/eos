// Zoom previous (User 2026-10-14): each view steps back through where it came to rest.
import { describe, it, expect } from 'vitest'
import { ZoomHistory } from './camera'

const c = (x: number, k = 1) => ({ x, y: 0, k })

describe('ZoomHistory', () => {
	it('steps back through the settled cameras, newest first, then has none', () => {
		const h = new ZoomHistory()
		h.settle('v', c(1)); h.settle('v', c(2)); h.settle('v', c(3))
		expect(h.back('v')).toEqual(c(2))
		expect(h.back('v')).toEqual(c(1))
		expect(h.back('v')).toBeNull()
	})
	it('the same camera again is no step; a step back then settling there adds none', () => {
		const h = new ZoomHistory()
		h.settle('v', c(1)); h.settle('v', c(1.2)); h.settle('v', c(5))
		const b = h.back('v')!
		h.settle('v', b)   // the view comes to rest where Previous put it
		expect(h.back('v')).toBeNull()
	})
	it('each view has its own; at most `max` kept', () => {
		const h = new ZoomHistory(2)
		for (const x of [1, 2, 3, 4]) h.settle('a', c(x))
		h.settle('b', c(9))
		expect(h.back('b')).toBeNull()
		expect([h.back('a'), h.back('a'), h.back('a')]).toEqual([c(3), c(2), null])
	})
})
