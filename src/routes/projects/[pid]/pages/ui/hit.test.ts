import { describe, it, expect } from 'vitest'
import { rotatePt, isFilled, inBox, onPlanPlane, bbox, hitEnt, inThisView, pickable } from './hit'
import type { Ent, Pt } from './geometry'
import type { ViewCtx } from './view'

const ent = (over: Partial<Ent> = {}): Ent => ({ id: 'e', type: 'rect', a: [0, 0], b: [10, 10], ...over } as Ent)
const planCtx: ViewCtx = { dir: 'floorplan', isPlan: true, isElev: false, isIso: false, elevDir: 'front', cx: 14000, cy: 8750, ground: 0, frameId: 'f1', paperMm: 1 }

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

describe('bbox (plan)', () => {
	it('rect / line default to the a–b extent', () => {
		expect(bbox(planCtx, ent({ a: [2, 8], b: [12, 3] }))).toEqual([2, 3, 12, 8])
	})
	it('polyline is the min/max of its points', () => {
		expect(bbox(planCtx, ent({ type: 'polyline', pts: [[0, 0], [5, 9], [3, -1]] }))).toEqual([0, -1, 5, 9])
	})
})

describe('hitEnt', () => {
	it('an unfilled rect hits on its border band, misses the empty interior', () => {
		const r = ent({ a: [0, 0], b: [20, 20] })
		expect(hitEnt(planCtx, r, [0.5, 10], 1)).toBe(true)   // on the left edge
		expect(hitEnt(planCtx, r, [10, 10], 1)).toBe(false)   // deep interior
	})
	it('a filled rect hits anywhere inside', () => {
		expect(hitEnt(planCtx, ent({ a: [0, 0], b: [20, 20], fill: '#0f0' }), [10, 10], 1)).toBe(true)
	})
	it('a rotated rect is tested in its un-rotated frame', () => {
		// A thin horizontal bar rotated 90° becomes vertical; a point on the rotated (vertical) bar hits.
		const bar = ent({ a: [0, 9], b: [20, 11], fill: '#0f0', rot: 90 })   // centre (10,10)
		expect(hitEnt(planCtx, bar, [10, 0], 1)).toBe(true)    // top of the rotated bar
		expect(hitEnt(planCtx, bar, [0, 10], 1)).toBe(false)   // where the bar WAS before rotating
	})
})

describe('inThisView / pickable', () => {
	it('a plan-space ent shows in plan; an elevation-native one and a foreign-frame one do not', () => {
		expect(inThisView(planCtx, ent({}))).toBe(true)
		expect(inThisView(planCtx, ent({ plane: 'front' }))).toBe(false)
		expect(inThisView(planCtx, ent({ space: 'view:other' }))).toBe(false)
		expect(inThisView(planCtx, ent({ space: 'view:f1' }))).toBe(true)
	})
	it('pickable gates on layer hidden/locked', () => {
		const shown = { hidden: () => false, locked: () => false }
		expect(pickable(planCtx, ent({}), shown)).toBe(true)
		expect(pickable(planCtx, ent({}), { hidden: () => true, locked: () => false })).toBe(false)
		expect(pickable(planCtx, ent({}), { hidden: () => false, locked: () => true })).toBe(false)
	})
})
