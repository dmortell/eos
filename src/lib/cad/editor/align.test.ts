// Align / distribute: the moves of each box.
import { describe, it, expect } from 'vitest'
import { alignMoves } from './align'

const box = (key: string, x0: number, y0: number, w: number, h: number) => ({ key, b: { x0, y0, x1: x0 + w, y1: y0 + h } })
const A = box('A', 0, 0, 100, 100), B = box('B', 300, 50, 200, 100), C = box('C', 1000, 20, 100, 300)

describe('align / distribute', () => {
	it('lines up the left / right / centre edges (only the ones that move)', () => {
		expect([...alignMoves([A, B, C], 'left')]).toEqual([['B', { x: -300, y: 0 }], ['C', { x: -1000, y: 0 }]])
		expect(alignMoves([A, B, C], 'right').get('A')).toEqual({ x: 1000, y: 0 })
		expect(alignMoves([A, B], 'centre').get('A')).toEqual({ x: 200, y: 0 })   // the middle of the lot: 250
	})
	it('top / middle / bottom', () => {
		expect(alignMoves([A, B, C], 'top').get('B')).toEqual({ x: 0, y: -50 })
		expect(alignMoves([A, B, C], 'bottom').get('A')).toEqual({ x: 0, y: 220 })
		expect(alignMoves([A, C], 'middle').get('A')).toEqual({ x: 0, y: 110 })
	})
	it('distribute: equal gaps, the first and last stay; needs three', () => {
		const m = alignMoves([C, A, B], 'across')
		expect(m.has('A') || m.has('C')).toBe(false)
		// span 0…1100, boxes 400 wide → gaps of 350: B goes to 450
		expect(m.get('B')).toEqual({ x: 150, y: 0 })
		expect(alignMoves([A, B], 'across').size).toBe(0)
	})
})
