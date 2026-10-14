// The Floor manager's rules: a range with gaps, names from a pattern, elevations stacked from the heights.
import { describe, it, expect } from 'vitest'
import { floorName, floorNumbers, restack, planFloors, renameFloors, newAreaLevel, renumberFloor, DEFAULT_HEIGHTS, DEFAULT_NAMES, heightsOf, outletZ } from './floors'
import { moveBy } from '../editor/behaviours'
import type { Outlet } from './types'
import type { Level } from './types'

const lv = (number: number, extra: Partial<Level> = {}): Level => ({ type: 'level', id: `L${number}${extra.area ?? ''}`, buildingId: 'B', number, name: `${number}F`, order: number, elevationMm: 0, heights: { ...DEFAULT_HEIGHTS }, ...extra })
let n = 0
const id = () => `new${++n}`

describe('floor names', () => {
	it('a pattern names floors; basements drop the minus', () => {
		expect([1, 12, -2].map((x) => floorName(x, DEFAULT_NAMES))).toEqual(['1F', '12F', 'B2F'])
		expect(floorName(3, { above: 'L{nn}', below: 'B{nn}' })).toBe('L03')
	})
	it('a range runs lowest to top without the floors that don\'t exist (no GF)', () => {
		expect(floorNumbers(-2, 3, [0])).toEqual([-2, -1, 1, 2, 3])
	})
})

describe('stacking', () => {
	it('each floor sits on the one below: clear + plenum + its slab + its raised floor; floor 1 stays put', () => {
		const typical = DEFAULT_HEIGHTS.clearHeightMm + DEFAULT_HEIGHTS.plenumMm + DEFAULT_HEIGHTS.slabMm + DEFAULT_HEIGHTS.raisedFloorMm
		const out = new Map(restack([lv(-1), lv(1), lv(2), lv(3, { heights: { ...DEFAULT_HEIGHTS, raisedFloorMm: 600 } })], [0]).map((l) => [l.number, l.elevationMm]))
		expect(out.get(1)).toBeUndefined()                 // the anchor doesn't move
		expect(out.get(2)).toBe(typical)
		expect(out.get(3)).toBe(2 * typical + 300)         // its own raised floor is 300 deeper
		expect(out.get(-1)).toBe(-typical)                 // no floor 0 (GF): -1 sits right under 1
	})
	it('a datum floor sits at FFL 0 and the rest stack from it (W10: GF = 0 in AU / UK)', () => {
		const typical = DEFAULT_HEIGHTS.clearHeightMm + DEFAULT_HEIGHTS.plenumMm + DEFAULT_HEIGHTS.slabMm + DEFAULT_HEIGHTS.raisedFloorMm
		const at = (ls: ReturnType<typeof lv>[], d?: number) => { const m = new Map(ls.map((l) => [l.number, l.elevationMm])); for (const l of restack(ls, [], d)) m.set(l.number, l.elevationMm); return m }
		const gf = at([lv(0, { elevationMm: -typical }), lv(1), lv(2, { elevationMm: typical })], 0)
		expect([gf.get(0), gf.get(1), gf.get(2)]).toEqual([0, typical, 2 * typical])
		expect(at([lv(1, { elevationMm: 777 }), lv(2)], 1).get(1)).toBe(0)            // floor 1 as the datum: moved to 0
		expect(at([lv(1, { elevationMm: 777 }), lv(2)]).get(1)).toBe(777)             // no datum: floor 1 stays put
	})
	it('a floor with no level still takes a storey; one that doesn\'t exist doesn\'t', () => {
		const typical = DEFAULT_HEIGHTS.clearHeightMm + DEFAULT_HEIGHTS.plenumMm + DEFAULT_HEIGHTS.slabMm + DEFAULT_HEIGHTS.raisedFloorMm
		expect(restack([lv(1), lv(4)]).find((l) => l.number === 4)?.elevationMm).toBe(3 * typical)       // 2F, 3F not drawn
		expect(restack([lv(1), lv(4)], [2, 3]).find((l) => l.number === 4)?.elevationMm).toBe(typical)   // 2F, 3F don't exist
	})
	it('an area level (a separate plan of the floor) follows its floor', () => {
		const out = restack([lv(1), lv(2), lv(2, { area: '3307', elevationMm: 5 })])
		expect(out.find((l) => l.area)?.elevationMm).toBe(out.find((l) => l.number === 2 && !l.area)?.elevationMm)
	})
})

describe('a building with basements', () => {
	const typical = DEFAULT_HEIGHTS.clearHeightMm + DEFAULT_HEIGHTS.plenumMm + DEFAULT_HEIGHTS.slabMm + DEFAULT_HEIGHTS.raisedFloorMm
	/** Set the range on a project that has only 1F, then stack: name → FFL. */
	const build = (skip: number[]) => {
		const r = planFloors([lv(1)], { lowest: -2, top: 2, skip, names: DEFAULT_NAMES, buildingId: 'B' }, () => 0, id)
		const all = [lv(1), ...r.add]
		const moved = new Map(restack(all, skip).map((l) => [l.id, l.elevationMm]))
		return Object.fromEntries(all.sort((a, b) => a.number - b.number).map((l) => [l.name, moved.get(l.id) ?? l.elevationMm]))
	}
	it('without a GF: B2F, B1F, 1F, 2F — B1F sits right under 1F', () => {
		expect(build([0])).toEqual({ B2F: -2 * typical, B1F: -typical, '1F': 0, '2F': typical })
	})
	it('with a GF: B2F, B1F, GF, 1F, 2F — GF is a storey between B1F and 1F', () => {
		expect(build([])).toEqual({ B2F: -3 * typical, B1F: -2 * typical, GF: -typical, '1F': 0, '2F': typical })
	})
	it('the ground floor takes its own name', () => {
		expect(floorName(0, { above: 'L{nn}', below: 'B{n}', ground: 'G' })).toBe('G')
	})
})

describe('setting the range', () => {
	it('adds the missing floors, removes empty ones outside the range, keeps ones with content', () => {
		const r = planFloors([lv(1), lv(5), lv(6)], { lowest: 1, top: 3, skip: [2], names: DEFAULT_NAMES, buildingId: 'B' }, (i) => (i === 'L6' ? 4 : 0), id)
		expect(r.add.map((l) => [l.number, l.name])).toEqual([[3, '3F']])
		expect(r.remove.map((l) => l.number)).toEqual([5])
		expect(r.keep.map((l) => l.number)).toEqual([6])
	})
	it('renaming from a pattern changes only what differs; areas keep their suffix', () => {
		const r = renameFloors([lv(1, { name: '1F' }), lv(2, { name: 'old' }), lv(2, { area: '3307', name: 'x' })], { above: 'L{nn}', below: 'B{n}' })
		expect(r.map((l) => l.name)).toEqual(['L01', 'L02', 'L02 3307'])
	})
})

describe('area plans and floor numbers (Floor manager)', () => {
	const lv = (id: string, number: number, area?: string): Level => ({ type: 'level', id, buildingId: 'B', number, name: area ? `${number}F ${area}` : `${number}F`, order: number, elevationMm: number * 4000, heights: { slabMm: 200, raisedFloorMm: 100, clearHeightMm: 2700, plenumMm: 800 }, ...(area ? { area } : {}) })
	it('a new area plan takes its floor’s number, elevation and heights', () => {
		expect(newAreaLevel(lv('F33', 33), '3303', 'A1')).toMatchObject({ id: 'A1', number: 33, name: '33F 3303', area: '3303', elevationMm: 132000, order: 33.5 })
	})
	it('a floor renumbered takes its area plans with it; a number in use is refused', () => {
		const ls = [lv('F33', 33), lv('A', 33, '3303'), lv('F34', 34)]
		const r = renumberFloor(ls, 'F33', 35)
		expect('put' in r && r.put.map((l) => [l.id, l.number])).toEqual([['F33', 35], ['A', 35]])
		expect(renumberFloor(ls, 'F33', 34)).toEqual({ problem: '34F is already floor 34' })
		expect(renumberFloor(ls, 'F33', 2.5)).toMatchObject({ problem: expect.stringMatching(/whole/) })
	})
})

describe('one height rule for outlets (Review 2 Q5)', () => {
	const level = { heights: { ...DEFAULT_HEIGHTS, clearHeightMm: 2800 } } as Level
	const outlet = (o: Partial<Outlet>): Outlet => ({ type: 'outlet', id: 'O', levelId: 'L', label: 'A.001', tier: 'high', ports: [], at: { x: 0, y: 0 }, ...o }) as Outlet
	it('own Z, else ceiling = the clear height, wall = 300, floor = 0; no level = the defaults', () => {
		expect(outletZ(outlet({ z: 1200, mount: 'ceiling' }), level)).toBe(1200)
		expect(outletZ(outlet({ mount: 'ceiling' }), level)).toBe(2800)
		expect(outletZ(outlet({ mount: 'ceiling' }), undefined)).toBe(DEFAULT_HEIGHTS.clearHeightMm)
		expect(outletZ(outlet({ mount: 'wall' }), level)).toBe(300)
		expect(outletZ(outlet({}), level)).toBe(0)   // the tier no longer decides (the elevation went by tier)
		expect(heightsOf(undefined)).toEqual(DEFAULT_HEIGHTS)
	})
	it('moved up, an outlet with no Z starts from its mount height, not the floor', () => {
		const lv = { ...level, type: 'level', id: 'L' } as Level
		const moved = moveBy(outlet({ mount: 'ceiling' }), { x: 0, y: 0, z: 100 }, (id) => (id === 'L' ? lv : undefined))
		expect(moved.z).toBe(2900)
		expect(moveBy(outlet({ mount: 'wall' }), { x: 0, y: 0, z: -50 }).z).toBe(250)
		expect(moveBy(outlet({ mount: 'ceiling' }), { x: 10, y: 0 }).z).toBeUndefined()   // a flat move keeps "by mount"
	})
})
