import { describe, it, expect } from 'vitest'
import { rotatePt, isFilled, inBox, onPlanPlane } from './hit'
import type { Ent, Pt } from './geometry'

const ent = (over: Partial<Ent> = {}): Ent => ({ id: 'e', type: 'rect', a: [0, 0], b: [10, 10], ...over } as Ent)

describe('rotatePt', () => {
	it('rotates 90° CW about a centre', () => {
		const r = rotatePt([1, 0], [0, 0], 90)
		expect(r[0]).toBeCloseTo(0, 9)
		expect(r[1]).toBeCloseTo(1, 9)   // y-down: +x maps to +y at 90°
	})
	it('is the identity at 0° and round-trips ±deg', () => {
		const p: Pt = [3, -4], c: Pt = [1, 1]
		expect(rotatePt(p, c, 0)).toEqual(p)
		const back = rotatePt(rotatePt(p, c, 37), c, -37)
		expect(back[0]).toBeCloseTo(p[0], 9)
		expect(back[1]).toBeCloseTo(p[1], 9)
	})
})

describe('isFilled', () => {
	it('true only for a real fill', () => {
		expect(isFilled(ent({ fill: '#f00' }))).toBe(true)
		expect(isFilled(ent({ fill: 'none' }))).toBe(false)
		expect(isFilled(ent({}))).toBe(false)
	})
})

describe('inBox', () => {
	it('a filled rect picks anywhere inside', () => {
		expect(inBox([5, 5], 0, 0, 10, 10, 1, true)).toBe(true)
	})
	it('an unfilled rect picks only within thr of the border, not the empty interior', () => {
		expect(inBox([5, 5], 0, 0, 10, 10, 1, false)).toBe(false)   // deep interior misses
		expect(inBox([0.5, 5], 0, 0, 10, 10, 1, false)).toBe(true)  // on the left edge band hits
		expect(inBox([12, 5], 0, 0, 10, 10, 1, false)).toBe(false)  // outside the outer band misses
	})
})

describe('onPlanPlane', () => {
	it('true for undefined/plan, false for an elevation-native plane', () => {
		expect(onPlanPlane(ent({}))).toBe(true)
		expect(onPlanPlane(ent({ plane: 'plan' }))).toBe(true)
		expect(onPlanPlane(ent({ plane: 'front' }))).toBe(false)
	})
})
