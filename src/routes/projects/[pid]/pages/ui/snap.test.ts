import { describe, it, expect } from 'vitest'
import { SNAP_STEP, snapToGrid, snapDelta, entSnaps, findSnap, drawPoint } from './snap'
import type { Mapper } from './mapper'
import type { Ent, Pt } from './geometry'
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

// An identity mapper: client px == drawing mm, so screen distances read directly in the fixtures.
const ident: Mapper = { toModel: (x, y) => [x, y], toClient: (x, y) => ({ x, y }), tolMm: (px) => px }

describe('findSnap', () => {
	const ents = [ent({ id: 'r', a: [0, 0], b: [200, 100] }), ent({ id: 'l', type: 'line', a: [500, 500], b: [600, 500] })]
	it('returns the nearest snap point within the radius (default 11px), with its kind', () => {
		expect(findSnap(planCtx, ident, ents, 205, 4)).toEqual({ p: [200, 0], type: 'end' })
		expect(findSnap(planCtx, ident, ents, 100, 3)).toEqual({ p: [100, 0], type: 'mid' })
		expect(findSnap(planCtx, ident, ents, 98, 52)).toEqual({ p: [100, 50], type: 'center' })
		expect(findSnap(planCtx, ident, ents, 220, 0)).toBe(null)   // 20px away
		expect(findSnap(planCtx, ident, ents, 220, 0, { radiusPx: 25 })).toEqual({ p: [200, 0], type: 'end' })
	})
	it('skips the excluded (dragged) entity and the inline-edited one', () => {
		expect(findSnap(planCtx, ident, ents, 501, 501, { exclude: 'l' })).toBe(null)
		expect(findSnap(planCtx, ident, ents, 501, 501, { editingId: 'l' })).toBe(null)
		expect(findSnap(planCtx, ident, ents, 501, 501)).toEqual({ p: [500, 500], type: 'end' })
	})
})

describe('drawPoint', () => {
	const ents = [ent({ id: 'r', a: [0, 0], b: [200, 100] })]
	const inp = { osnap: true, snap: false, ortho: false, tool: 'Line', ents }
	it('object snap wins and returns the mark; OSNAP off → raw pointer, no mark', () => {
		expect(drawPoint(planCtx, ident, inp, 203, 2)).toEqual({ p: [200, 0], mark: { p: [200, 0], type: 'end' } })
		expect(drawPoint(planCtx, ident, { ...inp, osnap: false }, 203, 2)).toEqual({ p: [203, 2], mark: null })
	})
	it('no snap hit: shift constrains (15°), ortho locks H/V for Line only, SNAP grid-rounds', () => {
		const base: Pt = [1000, 1000]
		expect(drawPoint(planCtx, ident, { ...inp, ortho: true }, 1300, 1040, base)).toEqual({ p: [1300, 1000], mark: null })
		expect(drawPoint(planCtx, ident, { ...inp, ortho: true, tool: 'Polyline' }, 1300, 1040, base)).toEqual({ p: [1300, 1040], mark: null })
		const s = drawPoint(planCtx, ident, inp, 1300, 1020, base, true)   // shift: ~3.8° → 0°
		expect(s.p[1]).toBeCloseTo(1000); expect(s.mark).toBe(null)
		expect(drawPoint(planCtx, ident, { ...inp, snap: true }, 1349, 1051, base)).toEqual({ p: [1300, 1100], mark: null })
	})
})
