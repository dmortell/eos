// Floor heights from the old Risers tool's docs.
import { describe, it, expect } from 'vitest'
import { riserHeights } from './legacyHeights'

const h = (clear: number) => ({ slabMm: 200, raisedFloorMm: 300, clearHeightMm: clear, plenumMm: 700 })

describe('riser heights', () => {
	it('takes each floor from the first doc that sets it, and the first doc default for the rest', () => {
		const r = riserHeights([
			{ floorHeights: { 3: h(2800), 4: { clearHeightMm: 1 } }, settings: { defaultFloorHeights: h(2600) } },
			{ floorHeights: { 3: h(9999), 5: h(3000) } },
		])
		expect([...r.byFloor].map(([n, x]) => [n, x.clearHeightMm])).toEqual([[3, 2800], [5, 3000]])   // floor 4 is incomplete: skipped
		expect(r.fallback?.clearHeightMm).toBe(2600)
	})
})
