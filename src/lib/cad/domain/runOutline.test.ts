// Run outlines (backlog "Trunk drawing style"): bands walked into one outline with mitred joins, corners rounded.
import { describe, it, expect } from 'vitest'
import { outlineLoops, roundCorners, endCorners, type OutlineEdge } from './runOutline'
import type { Pt } from './types'

const has = (poly: Pt[], x: number, y: number) => poly.some((p) => Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01)
const area = (poly: Pt[]) => Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p.x * q.y - q.x * p.y }, 0) / 2)

describe('run outlines', () => {
	it('an L: one loop, square ends, a mitred outer and inner corner', () => {
		const L: OutlineEdge[] = [{ a: { x: 0, y: 0 }, b: { x: 1000, y: 0 }, w: 100 }, { a: { x: 1000, y: 0 }, b: { x: 1000, y: 1000 }, w: 100 }]
		const loops = outlineLoops(L)
		expect(loops).toHaveLength(1)
		const p = loops[0]
		expect([has(p, 0, 50), has(p, 0, -50), has(p, 1050, -50), has(p, 950, 50), has(p, 1050, 1000), has(p, 950, 1000)]).toEqual([true, true, true, true, true, true])
		expect(area(p)).toBeCloseTo(1000 * 100 + 1000 * 100)   // two 1 m × 100 mm bands, the corner square counted once
	})
	it('two runs that meet at a point join into one outline; a T is one outline too', () => {
		const a: OutlineEdge = { a: { x: 0, y: 0 }, b: { x: 1000, y: 0 }, w: 100 }, b: OutlineEdge = { a: { x: 1000, y: 0 }, b: { x: 2000, y: 0 }, w: 100 }
		expect(outlineLoops([a, b])).toHaveLength(1)
		const t = outlineLoops([a, b, { a: { x: 1000, y: 0 }, b: { x: 1000, y: 800 }, w: 100 }])
		expect(t).toHaveLength(1)
		expect(area(t[0])).toBeCloseTo(2000 * 100 + 750 * 100)
		expect(outlineLoops([a, { a: { x: 0, y: 500 }, b: { x: 1000, y: 500 }, w: 100 }])).toHaveLength(2)   // apart: two
	})
	it('corners rounded, a run\'s square ends kept sharp', () => {
		const L: OutlineEdge[] = [{ a: { x: 0, y: 0 }, b: { x: 1000, y: 0 }, w: 100 }, { a: { x: 1000, y: 0 }, b: { x: 1000, y: 1000 }, w: 100 }]
		const [p] = outlineLoops(L), sharp = endCorners(L)
		const r = roundCorners(p, 20, sharp)
		expect(has(r, 0, 50) && has(r, 0, -50)).toBe(true)        // the ends: still square
		expect(has(r, 1050, -50)).toBe(false)                     // the outer corner: rounded off
		expect(r.length).toBeGreaterThan(p.length)
	})
})
