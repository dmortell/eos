import { describe, it, expect } from 'vitest'
import { SNAP_STEP, snapToGrid, snapDelta, entSnaps } from './snap'
import type { Ent } from './geometry'
import type { ViewCtx } from './view'

const planCtx: ViewCtx = { dir: 'floorplan', isPlan: true, isElev: false, isIso: false, elevDir: 'front', cx: 14000, cy: 8750, ground: 10250, frameId: 'f', paperMm: 1, mdl: undefined, yaw: 0, pitch: 0 }
const ent = (over: Partial<Ent> = {}): Ent => ({ id: 'e', type: 'rect', a: [0, 0], b: [200, 100], ...over } as Ent)

describe('snapToGrid', () => {
	it('rounds to the step (default SNAP_STEP)', () => {
		expect(snapToGrid([149, 151])).toEqual([100, 200])
		expect(snapToGrid([149, 151], 50)).toEqual([150, 150])
		expect(SNAP_STEP).toBe(100)
	})
})

describe('snapDelta', () => {
	it('step 0 leaves the delta untouched; a real step snaps the base point to the grid', () => {
		expect(snapDelta(37, -12, ent({ a: [10, 10] }), 0)).toEqual([37, -12])
		// base a=(10,10); +delta(37,-12) → (47,-2) → grid(0,0) → delta (-10,-10)
		expect(snapDelta(37, -12, ent({ a: [10, 10] }), 100)).toEqual([-10, -10])
	})
})

describe('entSnaps', () => {
	it('a line gives 2 ends + 1 mid; a rect gives 4 corners + 4 mids + centre', () => {
		expect(entSnaps(planCtx, ent({ type: 'line', a: [0, 0], b: [10, 20] }))).toEqual([
			{ point: [0, 0], type: 'end' }, { point: [10, 20], type: 'end' }, { point: [5, 10], type: 'mid' },
		])
		const rs = entSnaps(planCtx, ent({ a: [0, 0], b: [200, 100] }))
		expect(rs.length).toBe(9)
		expect(rs.filter((s) => s.type === 'center')).toEqual([{ point: [100, 50], type: 'center' }])
	})
})
