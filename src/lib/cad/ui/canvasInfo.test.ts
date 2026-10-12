// Click counting (Q76: a double-tap finishes a run on a touch screen).
import { describe, it, expect } from 'vitest'
import { ClickCounter } from './canvasInfo'

describe('ClickCounter', () => {
	it('a mouse double-click is within 5 px and 400 ms', () => {
		const c = new ClickCounter()
		expect(c.press({ x: 100, y: 100 }, 0)).toBe(1)
		expect(c.press({ x: 103, y: 100 }, 200)).toBe(2)
		expect(c.press({ x: 120, y: 100 }, 300)).toBe(1)
		expect(c.press({ x: 100, y: 100 }, 900)).toBe(1)
	})
	it('a double-tap is allowed a finger’s wobble (24 px)', () => {
		const c = new ClickCounter()
		c.press({ x: 100, y: 100 }, 0, 24)
		expect(c.press({ x: 115, y: 108 }, 250, 24)).toBe(2)
		const d = new ClickCounter()
		d.press({ x: 100, y: 100 }, 0)
		expect(d.press({ x: 115, y: 108 }, 250)).toBe(1)   // the mouse tolerance would not
	})
})
