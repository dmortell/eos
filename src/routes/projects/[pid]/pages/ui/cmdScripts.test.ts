import { describe, it, expect } from 'vitest'
import { arc3, arcPts, arcPath, type Ent } from './geometry'
import { polygonPts } from './cmdScripts'

describe('3-point arcs', () => {
	it('finds the circle and the sweep through the middle point', () => {
		const g = arc3([10, 0], [0, 10], [-10, 0])!
		expect(g.c[0]).toBeCloseTo(0); expect(g.c[1]).toBeCloseTo(0); expect(g.r).toBeCloseTo(10)
		expect(g.sweep).toBeCloseTo(Math.PI)   // +y side: positive (CCW in y-up maths)
		const h = arc3([10, 0], [0, -10], [-10, 0])!
		expect(h.sweep).toBeCloseTo(-Math.PI)   // the other way round
	})
	it('collinear points are no arc; samples end on the end points', () => {
		expect(arc3([0, 0], [1, 1], [2, 2])).toBeNull()
		const e: Ent = { id: 'a', type: 'arc', pts: [[10, 0], [7.0710678, 7.0710678], [0, 10]] }
		const s = arcPts(e, 4)
		expect(s.length).toBe(5); expect(s[0][0]).toBeCloseTo(10); expect(s[4][1]).toBeCloseTo(10)
		expect(Math.hypot(s[2][0], s[2][1])).toBeCloseTo(10)
		expect(arcPath(e)).toMatch(/^M10,0 A10(\.\d+)?,10(\.\d+)? 0 0 1 0,10$/)
	})
})

describe('POLYGON', () => {
	it('inscribed puts vertices on the circle; circumscribed puts edge midpoints on it', () => {
		const ins = polygonPts([0, 0], 4, 10, 0, true)
		expect(ins).toHaveLength(4); ins.forEach((p) => expect(Math.hypot(p[0], p[1])).toBeCloseTo(10))
		const cir = polygonPts([0, 0], 4, 10, 0, false)
		const m = [(cir[0][0] + cir[1][0]) / 2, (cir[0][1] + cir[1][1]) / 2]
		expect(Math.hypot(m[0], m[1])).toBeCloseTo(10)
	})
})
