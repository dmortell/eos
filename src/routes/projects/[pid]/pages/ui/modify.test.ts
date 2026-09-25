import { describe, it, expect } from 'vitest'
import type { Ent, Pt } from './geometry'
import { crossings, trim, extend, breakAt, setLength, polyLength, offsetPolyline, offsetEnt, outline, project, setArcLength, arcLength } from './modify'

const L: Pt[] = [[0, 0], [100, 0]]
const X = (x: number): Pt[] => [[x, -50], [x, 50]]   // a vertical cutting line at x

describe('TRIM / EXTEND / BREAK / LENGTHEN', () => {
	it('trims the piece between the nearest crossings', () => {
		const cuts = crossings(L, [X(30), X(60)])
		expect(cuts).toEqual([30, 60])
		expect(trim(L, 45, cuts)).toEqual([[[0, 0], [30, 0]], [[60, 0], [100, 0]]])
		expect(trim(L, 10, cuts)).toEqual([[[30, 0], [100, 0]]])   // the start stub goes
		expect(trim(L, 10, [])).toBeNull()
	})
	it('extends an end to the nearest boundary beyond it', () => {
		expect(extend(L, false, [X(150), X(130)])).toEqual([[0, 0], [130, 0]])
		expect(extend(L, true, [X(-20)])).toEqual([[-20, 0], [100, 0]])
		expect(extend(L, false, [X(50)])).toBeNull()   // behind the end: not a boundary
	})
	it('breaks between two points, or splits at one', () => {
		expect(breakAt(L, 20, 70)).toEqual([[[0, 0], [20, 0]], [[70, 0], [100, 0]]])
		expect(breakAt(L, 40, 40)).toEqual([[[0, 0], [40, 0]], [[40, 0], [100, 0]]])
	})
	it('lengthens / shortens from the chosen end, across vertices', () => {
		const P: Pt[] = [[0, 0], [100, 0], [100, 100]]
		expect(setLength(P, false, 250)).toEqual([[0, 0], [100, 0], [100, 150]])
		expect(setLength(P, false, 50)).toEqual([[0, 0], [50, 0]])
		expect(polyLength(setLength(P, true, 120)!)).toBeCloseTo(120)
		expect(project(P, [100, 40]).s).toBeCloseTo(140)
	})
})

describe('OFFSET', () => {
	it('offsets a polyline to the picked side, mitred at corners', () => {
		const P: Pt[] = [[0, 0], [100, 0], [100, 100]]
		const up = offsetEnt({ id: 'p', type: 'polyline', pts: P }, 10, [50, -20])!.pts!
		expect(up[0]).toEqual([0, -10]); expect(up[1][0]).toBeCloseTo(110); expect(up[1][1]).toBeCloseTo(-10); expect(up[2]).toEqual([110, 100])
		const closed: Pt[] = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]
		const o = offsetPolyline(closed, -10)   // outward for this winding
		expect(o[0]).toEqual(o[o.length - 1])
	})
	it('grows / shrinks a rect or ellipse, changes an arc radius', () => {
		const r: Ent = { id: 'r', type: 'rect', a: [0, 0], b: [100, 50] }
		expect(offsetEnt(r, 10, [200, 25])).toMatchObject({ a: [-10, -10], b: [110, 60] })
		expect(offsetEnt(r, 10, [50, 25])).toMatchObject({ a: [10, 10], b: [90, 40] })
		expect(offsetEnt(r, 30, [50, 25])).toBeNull()   // it would collapse
		const arc: Ent = { id: 'a', type: 'arc', pts: [[10, 0], [0, 10], [-10, 0]] }
		expect(offsetEnt(arc, 5, [0, 30])!.pts![0]).toEqual([15, 0])
	})
	it('outlines closed shapes; arcs lengthen along their circle', () => {
		expect(outline({ id: 'r', type: 'rect', a: [0, 0], b: [10, 10] })[0]).toHaveLength(5)
		const arc: Ent = { id: 'a', type: 'arc', pts: [[10, 0], [7.0710678, 7.0710678], [0, 10]] }
		expect(arcLength(arc)).toBeCloseTo((Math.PI / 2) * 10)
		expect(arcLength(setArcLength(arc, false, Math.PI * 10)!)).toBeCloseTo(Math.PI * 10)
	})
})
