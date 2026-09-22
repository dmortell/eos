import { describe, it, expect } from 'vitest'
import { centerCorners, orthoPt, arrowPts, cloudPath, groundPts } from './annotations'
import type { Ent } from './geometry'

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
	it('line → 2 open points; ellipse → 32 closed points', () => {
		expect(groundPts({ id: 'l', type: 'line', a: [0, 0], b: [1, 1] })).toEqual({ pts: [[0, 0], [1, 1]], closed: false })
		const ell = groundPts({ id: 'e', type: 'ellipse', a: [0, 0], b: [10, 6] })
		expect(ell.closed).toBe(true)
		expect(ell.pts.length).toBe(32)
	})
})
