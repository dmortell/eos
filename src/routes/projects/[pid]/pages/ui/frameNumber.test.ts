import { describe, it, expect } from 'vitest'
import { readingOrder } from './frameNumber'

const f = (id: string, x: number, y: number, seq: number, label?: string) => ({ id, x, y, w: 100, h: 80, seq, label })

describe('B4 viewport numbering', () => {
	it('numbers rows top → bottom, then left → right; auto labels follow, custom ones stay', () => {
		const out = readingOrder([f('a', 300, 10, 1), f('b', 10, 30, 2, 'Plan'), f('c', 10, 200, 3, '3')])
		expect(out.map((x) => [x.id, x.seq, x.label])).toEqual([['a', 2, undefined], ['b', 1, 'Plan'], ['c', 3, '3']])
	})
	it('returns the same array when nothing changes', () => {
		const fs = [f('a', 10, 10, 1), f('b', 300, 10, 2)]
		expect(readingOrder(fs)).toBe(fs)
	})
})
