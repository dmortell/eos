import { describe, it, expect } from 'vitest'
import { pickPrim } from './pick'
import type { Prim } from '../views/display'

describe('pickPrim', () => {
	// an outlet (a circle) drawn first, a desk's filled box drawn over it
	const outlet: Prim = { k: 'circle', c: { x: 50, y: 50 }, r: 5, src: 'O', cls: 'outlet' }
	const desk: Prim = { k: 'line', pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], closed: true, fill: true, src: 'D', cls: 'block' }
	it('takes what is drawn on top', () => {
		expect(pickPrim([outlet, desk], { x: 50, y: 50 }, 1)?.src).toBe('D')
	})
	it('a preferred item under the point wins over what is drawn on top of it (R7-23)', () => {
		expect(pickPrim([outlet, desk], { x: 50, y: 50 }, 1, undefined, (s) => s === 'O')?.src).toBe('O')
		expect(pickPrim([outlet, desk], { x: 80, y: 80 }, 1, undefined, (s) => s === 'O')?.src).toBe('D')   // off the outlet: the desk
	})
})
