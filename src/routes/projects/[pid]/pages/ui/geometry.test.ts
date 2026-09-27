import { describe, it, expect } from 'vitest'
import { type Ent, dist, segDist, translate, textBox, elevU, flatSpan, isNote, migrateNote, dimExtLines, dimGeom, dimTextAt, dimTextOffMm, dimSetLine, dimSetMode, autoDimMode, PLAN_CX, PLAN_CY } from './geometry'

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
	it('a linear (H) dim: an extension line from each measured point to the horizontal dim line', () => {
		const d: Ent = { id: 'd', type: 'dim', a: [0, 0], b: [1000, 400], dimMode: 'h' }   // the line through a (no dimExt)
		const ls = dimExtLines(d, 1)
		expect(ls).toHaveLength(1)   // a sits ON the line: only b's
		expect(ls[0][0][0]).toBeCloseTo(1000); expect(ls[0][0][1]).toBeCloseTo(399)   // 1 paper mm gap off b, toward the line
		expect(ls[0][1][0]).toBeCloseTo(1000); expect(ls[0][1][1]).toBeCloseTo(-1.5)  // 1.5 past the line (y = 0)
	})
})

describe('dimGeom — aligned / horizontal / vertical dimensions', () => {
	const near = (p: number[], q: number[]) => p.forEach((v, i) => expect(v).toBeCloseTo(q[i], 9))
	it('aligned (unset): the true a→b distance, the dim line on a / b, measured points dimExt back', () => {
		const g = dimGeom({ id: 'd', type: 'dim', a: [0, 0], b: [300, 400], dimExt: 50 })
		expect(g.len).toBe(500)
		near(g.A, [0, 0]); near(g.B, [300, 400]); near(g.u, [0.6, 0.8]); near(g.p, [-0.8, 0.6])
		near(g.M1, [40, -30]); near(g.M2, [340, 370])
	})
	it('horizontal: only Δx, a horizontal dim line through a (moved dimExt along p), the points are a / b', () => {
		const g = dimGeom({ id: 'd', type: 'dim', a: [0, 0], b: [300, 400], dimMode: 'h' })
		expect(g.len).toBe(300)
		near(g.A, [0, 0]); near(g.B, [300, 0]); near(g.M1, [0, 0]); near(g.M2, [300, 400]); near(g.u, [1, 0]); near(g.p, [0, 1])
		const r = dimGeom({ id: 'd', type: 'dim', a: [300, 400], b: [0, 0], dimMode: 'h', dimExt: 100 })   // right → left: u / p flip
		expect(r.len).toBe(300); near(r.u, [-1, 0]); near(r.p, [0, -1])
		near(r.A, [300, 300]); near(r.B, [0, 300])   // y = a.y + p.y · dimExt
	})
	it('vertical: only Δy, a vertical dim line through a moved dimExt along p', () => {
		const g = dimGeom({ id: 'd', type: 'dim', a: [0, 0], b: [300, 400], dimMode: 'v', dimExt: -50 })
		expect(g.len).toBe(400)
		near(g.u, [0, 1]); near(g.p, [-1, 0])
		near(g.A, [50, 0]); near(g.B, [50, 400]); near(g.M1, [0, 0]); near(g.M2, [300, 400])
	})
	it('autoDimMode (DIMLINEAR) picks the larger delta', () => {
		expect(autoDimMode([0, 0], [300, 100])).toBe('h'); expect(autoDimMode([0, 0], [100, -300])).toBe('v')
	})
	it('the text: dimTextOff (paper mm) wins over the older dimOff (model mm); upright along the dim line', () => {
		const d: Ent = { id: 'd', type: 'dim', a: [0, 0], b: [1000, 0] }
		expect(dimTextOffMm(d, 100)).toBe(250)
		expect(dimTextOffMm({ ...d, dimOff: 70 }, 100)).toBe(70)
		expect(dimTextOffMm({ ...d, dimOff: 70, dimTextOff: -4 }, 100)).toBe(-400)
		const t = dimTextAt({ ...d, dimTextOff: 4, dimT: 0.25 }, 100)
		near(t.p, [250, 400]); expect(t.rot).toBe(0)
		const v = dimTextAt({ id: 'd', type: 'dim', a: [0, 400], b: [300, 0], dimMode: 'v' }, 1)   // upward: u = (0, −1) → turned upright
		expect(v.rot).toBe(-90); near(v.p, [2.5, 200])   // p = (−u.y, u.x) = (1, 0)
	})
	it('dimSetLine moves the dim line through a point, the measured points kept', () => {
		const h = dimSetLine({ id: 'd', type: 'dim', a: [0, 0], b: [300, 400], dimMode: 'h' }, [150, -200])
		expect(h.dimExt).toBe(-200); near(dimGeom(h).A, [0, -200])
		const al = dimSetLine({ id: 'd', type: 'dim', a: [0, 0], b: [1000, 0] }, [500, -300])
		expect(al.dimExt).toBe(-300); near(al.a!, [0, -300]); near(al.b!, [1000, -300])
		near(dimGeom(al).M1, [0, 0]); near(dimGeom(al).M2, [1000, 0])
	})
	it('dimSetMode keeps the measured points and the dim line through the old middle', () => {
		const al: Ent = { id: 'd', type: 'dim', a: [0, -300], b: [1000, -100], dimExt: -300 }   // measured points below the line
		const g0 = dimGeom(al)
		const h = dimSetMode(al, 'h')
		expect(h.dimMode).toBe('h'); near(h.a!, g0.M1); near(h.b!, g0.M2)
		expect(dimGeom(h).A[1]).toBeCloseTo(-200, 0)   // the old line's middle y
		const back = dimSetMode(h, 'aligned')
		expect(back.dimMode).toBeUndefined(); near(dimGeom(back).M1, g0.M1); near(dimGeom(back).M2, g0.M2)
		expect(dimSetMode(al, 'aligned')).toBe(al)
	})
})
