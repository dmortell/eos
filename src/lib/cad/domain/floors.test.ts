// The Floor manager's rules: a range with gaps, names from a pattern, elevations stacked from the heights.
import { describe, it, expect } from 'vitest'
import { floorName, floorNumbers, restack, planFloors, renameFloors, DEFAULT_HEIGHTS, DEFAULT_NAMES } from './floors'
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
