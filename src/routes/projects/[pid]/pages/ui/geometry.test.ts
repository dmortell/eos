import { describe, it, expect } from 'vitest'
import { type Ent, dist, segDist, translate, textBox, elevU, flatSpan, isNote, migrateNote, dimExtLines, PLAN_CX, PLAN_CY } from './geometry'

describe('dist / segDist', () => {
	it('dist is euclidean', () => {
		expect(dist([0, 0], [3, 4])).toBe(5)
	})
	it('segDist projects onto the segment and clamps to the ends', () => {
		expect(segDist([5, 5], [0, 0], [10, 0])).toBe(5)       // above the middle
		expect(segDist([-5, 0], [0, 0], [10, 0])).toBe(5)      // past the start → clamps to a
		expect(segDist([3, 0], [0, 0], [10, 0])).toBe(0)       // on the segment
	})
})

describe('translate', () => {
	it('moves a/b/c and every polyline point, leaving others untouched', () => {
		const e: Ent = { id: 'p', type: 'polyline', pts: [[0, 0], [10, 5]] }
		expect(translate(e, 3, -2).pts).toEqual([[3, -2], [13, 3]])
		const l: Ent = { id: 'l', type: 'dim', a: [0, 0], b: [4, 4] }
		const t = translate(l, 1, 1)
		expect(t.a).toEqual([1, 1]); expect(t.b).toEqual([5, 5])
	})
})

describe('textBox', () => {
	it('grows with the longest line and the line count', () => {
		const one = textBox({ id: 't', type: 'text', a: [10, 20], text: 'AB' })
		const two = textBox({ id: 't', type: 'text', a: [10, 20], text: 'ABCDEFGH\nX' })
		expect(two[2]).toBeGreaterThan(one[2])   // wider (longer line)
		expect(two[3]).toBeGreaterThan(one[3])   // taller (2 lines)
		expect(one[0]).toBe(10)                  // left = anchor x
	})
})

describe('elevU — per-direction horizontal projection (Kestrel/Sheets BASIS)', () => {
	it('front is identity, rear mirrors x, right/left use y (mirrored) about the plan centre', () => {
		expect(elevU('front', 100)).toBe(100)          // +x, centred at CX=200 → identity
		expect(elevU('rear', 100)).toBe(2 * PLAN_CX - 100)   // −x mirror about CX
		expect(elevU('right', 50)).toBe(PLAN_CX + (50 - PLAN_CY))    // +y re-centred about the plan centre
		expect(elevU('left', 50)).toBe(PLAN_CX - (50 - PLAN_CY))     // −y mirror
		// mirror is symmetric: rear/left applied twice returns the original
		expect(elevU('rear', elevU('rear', 137))).toBe(137)
		expect(elevU('left', elevU('left', 88))).toBe(88)
	})
})

describe('flatSpan — flat objects collapse to a ground line on the view axis', () => {
	it('a 2-point polyline (a migrated line) spans its x in front and its y in right', () => {
		const line: Ent = { id: 'l', type: 'polyline', pts: [[120, 60], [180, 140]] }
		expect(flatSpan(line, 'front')).toEqual([120, 180])          // x-extent
		expect(flatSpan(line, 'right')).toEqual([elevU('right', 60), elevU('right', 140)])   // y-extent
	})
})


describe('NOTE merged into TEXT', () => {
	it('a stored note becomes a wrapped text; a plain text stays plain', () => {
		const old = { id: 'n', type: 'note', a: [0, 0], text: '# T' } as unknown as Ent
		const m = migrateNote(old)
		expect(m.type).toBe('text'); expect(m.noteW).toBe(90); expect(isNote(m)).toBe(true)
		const t: Ent = { id: 't', type: 'text', a: [0, 0], text: 'x' }
		expect(migrateNote(t)).toBe(t); expect(isNote(t)).toBe(false)
	})
})

describe('dimExtLines', () => {
	it('none without dimExt; with it, each line runs from near the measured point to past the dim line', () => {
		const d: Ent = { id: 'd', type: 'dim', a: [0, 100], b: [1000, 100] }
		expect(dimExtLines(d, 1)).toEqual([])
		// a→b along +x: the perpendicular is +y, so the measured points are 100 back at y = 0
		const [la, lb] = dimExtLines({ ...d, dimExt: 100 }, 1)
		expect(la[0][0]).toBeCloseTo(0); expect(la[0][1]).toBeCloseTo(1); expect(la[1][1]).toBeCloseTo(101.5)
		expect(lb[0][0]).toBeCloseTo(1000)
	})
})
