import { describe, it, expect } from 'vitest'
import type { Ent, Pt } from './geometry'
import { crossings, trim, extend, breakAt, setLength, polyLength, offsetPolyline, offsetEnt, outline, project, setArcLength, arcLength, joinChains, corner, stretchEnt, cornerInPolyline } from './modify'

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

describe('JOIN / FILLET / CHAMFER', () => {
	it('joins end-to-end lines in either direction; a closing chain closes', () => {
		const r = joinChains([[[0, 0], [10, 0]], [[20, 0], [10, 0]], [[50, 50], [60, 50]]])
		expect(r).toEqual([{ idx: [0, 1], pts: [[0, 0], [10, 0], [20, 0]] }])
		const sq = joinChains([[[0, 0], [10, 0]], [[10, 0], [10, 10]], [[10, 10], [0, 0]]])
		expect(sq[0].pts).toHaveLength(4); expect(sq[0].pts[3]).toEqual(sq[0].pts[0])
	})
	it('fillet 0 meets at the corner; a radius makes a tangent arc; chamfer bevels', () => {
		const h: [Pt, Pt] = [[0, 0], [8, 0]], v: [Pt, Pt] = [[10, 2], [10, 20]]   // they don't quite reach
		expect(corner(h, [2, 0], v, [10, 15], {})).toEqual({ a: [[0, 0], [10, 0]], b: [[10, 20], [10, 0]] })
		const f = corner([[0, 0], [20, 0]], [2, 0], [[10, -5], [10, 20]], [10, 15], { r: 4 })!
		expect(f.a[1][0]).toBeCloseTo(6); expect(f.b[1][1]).toBeCloseTo(4)
		expect(Math.hypot(f.arc![1][0] - 6, f.arc![1][1] - 4)).toBeCloseTo(4)   // on the r = 4 circle round (6, 4)
		const c = corner([[0, 0], [20, 0]], [2, 0], [[10, -5], [10, 20]], [10, 15], { chamfer: [3, 3] })!
		expect(c.bevel).toEqual([[7, 0], [10, 3]])
	})
})

describe('STRETCH', () => {
	const box: [number, number, number, number] = [50, -10, 150, 10]
	it('moves only the points / edges inside the crossing window', () => {
		expect(stretchEnt({ id: 'l', type: 'polyline', pts: [[0, 0], [100, 0]] }, box, 20, 0)!.pts).toEqual([[0, 0], [120, 0]])
		expect(stretchEnt({ id: 'r', type: 'rect', a: [0, -5], b: [100, 5] }, box, 20, 0)).toMatchObject({ a: [0, -5], b: [120, 5] })
		expect(stretchEnt({ id: 'r', type: 'rect', a: [60, -5], b: [100, 5] }, box, 20, 0)).toMatchObject({ a: [80, -5], b: [120, 5] })   // wholly inside: moves
		expect(stretchEnt({ id: 'x', type: 'polyline', pts: [[0, 50], [10, 50]] }, box, 20, 0)).toBeNull()
		expect(stretchEnt({ id: 't', type: 'text', a: [100, 0], text: 'A' }, box, 0, 5)!.a).toEqual([100, 5])
	})
})

describe('FILLET / CHAMFER a polyline corner', () => {
	it('replaces the vertex with the trim points (+ the arc, sampled)', () => {
		const P: Pt[] = [[0, 0], [100, 0], [100, 100]]
		expect(cornerInPolyline(P, 1, { chamfer: [10, 10] })).toEqual([[0, 0], [90, 0], [100, 10], [100, 100]])
		const f = cornerInPolyline(P, 1, { r: 20 })!
		expect(f[1][0]).toBeCloseTo(80); expect(f[f.length - 2][1]).toBeCloseTo(20); expect(f.length).toBe(2 + 9)
		expect(cornerInPolyline(P, 0, { r: 5 })).toBeNull()
	})
})
