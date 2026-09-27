import { describe, it, expect } from 'vitest'
import { flOffset, levelsFromFL } from './levels'

describe('floor levels from FL±0 (the raised floor top)', () => {
	it('stored above the slab → read from the finished floor', () => {
		const lv = { floorSlab: 0, raisedFloor: 300, ceilingTile: 2900, ceilingSlab: 3600 }
		expect(flOffset(lv)).toBe(300)
		expect(levelsFromFL(lv)).toEqual({ slabTop: -300, ceilingTile: 2600, ceilingSlab: 3300 })
	})
	it('no raised floor: FL = the slab top; missing levels stay undefined', () => {
		expect(levelsFromFL({ ceilingSlab: 2100 })).toEqual({ slabTop: 0, ceilingTile: undefined, ceilingSlab: 2100 })
		expect(flOffset(undefined)).toBe(0)
	})
})
