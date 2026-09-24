import { describe, it, expect } from 'vitest'
import { storeyMap, BREAK_GAP } from './storeyMap'
import type { Storey } from './types'

// 1F..5F, 3800 floor-to-floor, the top soffit 3600 above 5F
const st: Storey[] = [1, 2, 3, 4, 5].map((n, i) => ({ id: `F${n}`, name: `${n}F`, z: i * 3800, ceilingSlab: 3600 }))

describe('storey map (a riser drawing showing some floors)', () => {
	it('shows everything unchanged when no floor is hidden', () => {
		const m = storeyMap(st)
		expect([m.map(5000), m.gaps.length, m.hidden(0, 100)]).toEqual([5000, 0, false])
	})
	it('collapses consecutive hidden floors into ONE break gap and moves what is above down', () => {
		const m = storeyMap(st, ['F1', 'F4', 'F5'])   // 2F + 3F hidden
		expect(m.gaps).toEqual([{ z0: 3800, z1: 3800 + BREAK_GAP }])
		expect(m.map(1000)).toBe(1000)                       // 1F unchanged
		expect(m.map(3 * 3800)).toBe(3800 + BREAK_GAP)       // 4F datum sits right above the gap
		expect(m.map(3 * 3800 + 500)).toBe(3800 + BREAK_GAP + 500)
		expect(m.map(3800 + 3800)).toBe(3800 + BREAK_GAP / 2)   // halfway through the hidden run
		expect(m.shown.map((s) => s.name)).toEqual(['1F', '4F', '5F'])
	})
	it('an object wholly inside hidden floors is hidden; one crossing them is not', () => {
		const m = storeyMap(st, ['F1', 'F5'])
		expect(m.hidden(3800 + 300, 3800 + 2900)).toBe(true)   // a room on 2F
		expect(m.hidden(0, 5 * 3800)).toBe(false)              // a ladder through every floor
	})
})
