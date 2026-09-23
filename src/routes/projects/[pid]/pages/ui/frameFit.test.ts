import { describe, it, expect } from 'vitest'
import { niceScale, fitFrame } from './frameFit'
import { PLAN_CX, PLAN_CY, GROUND } from './geometry'
import type { Obj } from '../3dview/types'

describe('niceScale (XP19)', () => {
	it('rounds UP to a tidy denominator', () => {
		expect(niceScale(6.2)).toBe(7)
		expect(niceScale(10)).toBe(10)
		expect(niceScale(31)).toBe(35)
		expect(niceScale(100)).toBe(100)
		expect(niceScale(131)).toBe(140)
		expect(niceScale(612)).toBe(650)
		expect(niceScale(0.2)).toBe(1)
	})
})

describe('fitFrame (XP19)', () => {
	// a 10 m × 5 m box centred 2 m east of the plan centre
	const box = { type: 'prism', id: 'b', x: PLAN_CX - 3000, y: PLAN_CY - 2500, z: 0, w: 10000, d: 5000, h: 3000, edges: 4 } as Obj
	it('plan: the whole footprint fits a 200 × 100 mm frame, with a 10 % margin', () => {
		const f = fitFrame([box], 'plan', { w: 200, h: 100 })!
		expect(f.n).toBe(55)                                   // 10000 / 200 = 50 → ×1.1 = 55
		expect(10000 / f.n).toBeLessThanOrEqual(200); expect(5000 / f.n).toBeLessThanOrEqual(100)
	})
	it('plan: centres the bounds — the box mid-point lands on the plan centre', () => {
		const f = fitFrame([box], 'plan', { w: 200, h: 100 })!
		const midX = PLAN_CX + 2000, midY = PLAN_CY
		// Viewport mapping at zoom 1: view + C + (P − C) / N
		expect(f.view.x + PLAN_CX + (midX - PLAN_CX) / f.n).toBeCloseTo(PLAN_CX, 6)
		expect(f.view.y + PLAN_CY + (midY - PLAN_CY) / f.n).toBeCloseTo(PLAN_CY, 6)
	})
	it('front elevation fits width × height (3 m tall stands on GROUND)', () => {
		const f = fitFrame([box], 'front', { w: 100, h: 100 })!
		expect(f.n).toBe(110)                                  // 10000 / 100 = 100 → ×1.1
		expect(f.view.y + PLAN_CY + ((GROUND - 1500) - PLAN_CY) / f.n).toBeCloseTo(PLAN_CY, 6)
	})
	it('nothing visible → null', () => {
		expect(fitFrame([], 'plan', { w: 100, h: 100 })).toBeNull()
		expect(fitFrame([box], 'plan', { w: 100, h: 100 }, { visible: () => false })).toBeNull()
	})
})
