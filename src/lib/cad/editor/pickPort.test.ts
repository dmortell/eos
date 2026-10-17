// A click on a tiny port cell takes the cell it's IN, not a later-drawn neighbour within the tolerance (Round 9).
import { describe, it, expect } from 'vitest'
import { pickPrim } from './pick'
import type { Prim } from '../views/display'

const cell = (n: number, x: number): Prim => ({ k: 'line', closed: true, pts: [{ x, y: 0 }, { x: x + 10, y: 0 }, { x: x + 10, y: 10 }, { x, y: 10 }], cls: 'port', src: 'PP1', sub: String(n) })

describe('picking a port', () => {
	it('takes the cell under the point', () => {
		const prims = [cell(1, 0), cell(3, 10)]   // port 3 drawn after port 1, right beside it
		expect(pickPrim(prims, { x: 8, y: 5 }, 5)?.k === 'line' && (pickPrim(prims, { x: 8, y: 5 }, 5) as { sub?: string }).sub).toBe('1')
		expect((pickPrim(prims, { x: 12, y: 5 }, 5) as { sub?: string }).sub).toBe('3')
	})
})

describe('a port label spilling over the next cell', () => {
	it('does not take the click from the cell under it', () => {
		const label: Prim = { k: 'text', at: { x: 15, y: 5 }, text: '1-001.B long label', size: 4, anchor: 'middle', cls: 'port-label', src: 'PP1', sub: '2' }
		const prims = [cell(1, 0), cell(2, 10), label]
		expect((pickPrim(prims, { x: 5, y: 5 }, 1) as { sub?: string }).sub).toBe('1')
	})
})
