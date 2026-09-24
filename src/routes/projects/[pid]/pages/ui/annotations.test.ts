import { describe, it, expect } from 'vitest'
import { centerCorners, orthoPt, constrainPt, arrowPts, cloudPath, groundPts, sectionArrowFor, headGeom, dashArray, lineLabelAt } from './annotations'

describe('lineLabelAt', () => {
	it('sits above the line at the start / middle (by length) / end, reading upright', () => {
		const pts: [number, number][] = [[0, 0], [100, 0], [100, 100]]
		expect(lineLabelAt(pts, 'start', 5)).toEqual({ p: [0, -5], anchor: 'start', rot: 0 })
		expect(lineLabelAt(pts, 'mid', 5)).toEqual({ p: [100, -5], anchor: 'middle', rot: 0 })   // 100 of 200 → the corner
		expect(lineLabelAt(pts, 'end', 5)).toEqual({ p: [105, 100], anchor: 'end', rot: 90 })
		// a right-to-left line is flipped to read left-to-right; its start label anchors at its end side
		const r = lineLabelAt([[100, 0], [0, 0]], 'start', 5)!
		expect(r.anchor).toBe('end'); expect(Math.abs(r.rot)).toBe(0); expect(r.p[0]).toBe(100); expect(r.p[1]).toBeCloseTo(-5)
		expect(lineLabelAt([[0, 0]], 'mid', 5)).toBeNull()
	})
})
import type { Ent } from './geometry'
import type { Clip } from '../3dview/types'

describe('centerCorners', () => {
	it('mirrors the dragged corner about the centre', () => {
		expect(centerCorners([10, 10], [15, 12])).toEqual([[5, 8], [15, 12]])
	})
})

describe('orthoPt', () => {
	it('locks to the nearer axis through a', () => {
		expect(orthoPt([0, 0], [10, 3])).toEqual([10, 0])   // more horizontal → keep x, drop to a.y
		expect(orthoPt([0, 0], [3, 10])).toEqual([0, 10])   // more vertical → keep y, drop to a.x
	})
})

describe('arrowPts', () => {
	it('tip is the first point; base is `size` back along the line', () => {
		const s = arrowPts([0, 0], [10, 0], 3)
		const pts = s.split(' ').map((p) => p.split(',').map(Number))
		expect(pts[0]).toEqual([10, 0])            // tip AT `to`
		// two base points straddle the axis at x = 10 - size = 7, ±0.4·size
		expect(pts[1][0]).toBeCloseTo(7, 6)
		expect(pts[2][0]).toBeCloseTo(7, 6)
		expect(pts[1][1]).toBeCloseTo(1.2, 6)
		expect(pts[2][1]).toBeCloseTo(-1.2, 6)
	})
})

describe('cloudPath', () => {
	it('closes and uses sweep-flag 1 (bumps on the outside)', () => {
		const d = cloudPath([0, 0], [40, 20], 10)
		expect(d.startsWith('M ')).toBe(true)
		expect(d.trim().endsWith('Z')).toBe(true)
		expect(d.includes('A ')).toBe(true)
		// every arc uses "large-arc 0, sweep 1"
		for (const seg of d.split(' A ').slice(1)) expect(seg).toMatch(/^\S+ \S+ 0 0 1 /)
	})
})

describe('groundPts', () => {
	it('rect → 4 closed corners', () => {
		const e: Ent = { id: 'r', type: 'rect', a: [0, 0], b: [10, 5] }
		expect(groundPts(e)).toEqual({ pts: [[0, 0], [10, 0], [10, 5], [0, 5]], closed: true })
	})
	it('dim/polyline → 2(+) open points; ellipse → 32 closed points', () => {
		expect(groundPts({ id: 'd', type: 'dim', a: [0, 0], b: [1, 1] })).toEqual({ pts: [[0, 0], [1, 1]], closed: false })
		expect(groundPts({ id: 'p', type: 'polyline', pts: [[0, 0], [1, 1]] })).toEqual({ pts: [[0, 0], [1, 1]], closed: false })
		const ell = groundPts({ id: 'e', type: 'ellipse', a: [0, 0], b: [10, 6] })
		expect(ell.closed).toBe(true)
		expect(ell.pts.length).toBe(32)
	})
})

describe('sectionArrowFor', () => {
	// x0..x1 = 0..100 (cx=50), y0..y1 = 0..200 (cy=100); size 10 ⇒ pad 9, tip offset 18, half-width 8.
	const c: Clip = { x0: 0, y0: 0, z0: 0, x1: 100, y1: 200, z1: 0 }
	const parse = (s: string) => s.split(' ').map((p) => p.split(',').map(Number) as [number, number])
	it('front: tail inside the BOTTOM edge, tip points UP (toward smaller y)', () => {
		const [tip, b1, b2] = parse(sectionArrowFor(c, 'front', 10))
		expect(tip).toEqual([50, 173])
		expect(b1).toEqual([58, 191]); expect(b2).toEqual([42, 191])   // base straddles the tail, on the bottom edge
		expect(tip[1]).toBeLessThan(b1[1])   // tip is above (smaller y than) the base — points up
	})
	it('rear: tail inside the TOP edge, tip points DOWN (toward larger y)', () => {
		const [tip, b1, b2] = parse(sectionArrowFor(c, 'rear', 10))
		expect(tip).toEqual([50, 27])
		expect(b1).toEqual([42, 9]); expect(b2).toEqual([58, 9])
		expect(tip[1]).toBeGreaterThan(b1[1])
	})
	it('right: tail inside the LEFT edge, tip points RIGHT (toward larger x)', () => {
		const [tip, b1, b2] = parse(sectionArrowFor(c, 'right', 10))
		expect(tip).toEqual([27, 100])
		expect(b1).toEqual([9, 108]); expect(b2).toEqual([9, 92])
		expect(tip[0]).toBeGreaterThan(b1[0])
	})
	it('left: tail inside the RIGHT edge, tip points LEFT (toward smaller x)', () => {
		const [tip, b1, b2] = parse(sectionArrowFor(c, 'left', 10))
		expect(tip).toEqual([73, 100])
		expect(b1).toEqual([91, 92]); expect(b2).toEqual([91, 108])
		expect(tip[0]).toBeLessThan(b1[0])
	})
	it('handles a clip with reversed x0/x1 or y0/y1 (Math.min/max normalise it) and scales with size', () => {
		const rev: Clip = { x0: 100, y0: 200, z0: 0, x1: 0, y1: 0, z1: 0 }
		expect(sectionArrowFor(rev, 'front', 10)).toBe(sectionArrowFor(c, 'front', 10))
		const [tip20] = parse(sectionArrowFor(c, 'front', 20))
		expect(tip20).toEqual([50, 200 - 18 - 36])   // pad doubles (18), tip offset doubles (36)
	})
})

describe('constrainPt', () => {
	it('shift off → unchanged; Rectangle/Ellipse → square bbox keeping the drag quadrant', () => {
		expect(constrainPt('Rectangle', [0, 0], [10, 3], false)).toEqual([10, 3])
		expect(constrainPt('Rectangle', [0, 0], [10, 3], true)).toEqual([10, 10])
		expect(constrainPt('Ellipse', [0, 0], [-4, 9], true)).toEqual([-9, 9])
	})
	it('Line/Dimension → nearest 15° increment, length kept; other tools → unchanged', () => {
		const p = constrainPt('Line', [0, 0], [10, 1], true)   // ~5.7° → 0°
		expect(p[0]).toBeCloseTo(Math.hypot(10, 1)); expect(p[1]).toBeCloseTo(0)
		const q = constrainPt('Dimension', [0, 0], [10, 4], true)   // ~21.8° → 15°
		expect(Math.atan2(q[1], q[0]) * 180 / Math.PI).toBeCloseTo(15)
		expect(constrainPt('Polyline', [0, 0], [10, 3], true)).toEqual([10, 3])
	})
})

// ── XP33 line-end heads + XP32 line types ──
describe('headGeom (XP33)', () => {
	it('none / unset draw nothing; arrow reuses arrowPts; dot sits on the end point', () => {
		expect(headGeom(undefined, [0, 0], [10, 0], 3.5)).toBeNull()
		expect(headGeom('none', [0, 0], [10, 0], 3.5)).toBeNull()
		expect(headGeom('arrow', [0, 0], [10, 0], 3.5)).toEqual({ kind: 'arrow', pts: arrowPts([0, 0], [10, 0], 3.5) })
		expect(headGeom('dot', [0, 0], [10, 0], 4)).toEqual({ kind: 'dot', c: [10, 0], r: 1.2 })
	})
	it('a tick is a 45° slash centred on the end point, `size` long', () => {
		const g = headGeom('tick', [0, 0], [10, 0], 4)!
		if (g.kind !== 'tick') throw new Error('tick')
		expect((g.a[0] + g.b[0]) / 2).toBeCloseTo(10); expect((g.a[1] + g.b[1]) / 2).toBeCloseTo(0)
		expect(Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1])).toBeCloseTo(4)
		expect(Math.abs(g.b[0] - g.a[0])).toBeCloseTo(Math.abs(g.b[1] - g.a[1]))   // 45°
	})
})
describe('dashArray (XP32)', () => {
	it('solid / unset → no dasharray; patterns are screen px ÷ canvas zoom', () => {
		expect(dashArray(undefined)).toBeUndefined()
		expect(dashArray('solid')).toBeUndefined()
		expect(dashArray('dashed')).toBe('6 4')
		expect(dashArray('dashdot', 2)).toBe('4 1.5 0.5 1.5')
	})
})
