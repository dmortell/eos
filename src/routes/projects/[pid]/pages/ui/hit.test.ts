import { describe, it, expect } from 'vitest'
import { rotatePt, isFilled, inBox, onPlanPlane, bbox, hitEnt, inThisView, pickable, hitModel, hitSection, hitGuide, marqueeSelect } from './hit'
import { textBox } from './geometry'
import type { Ent, Pt } from './geometry'
import type { ViewCtx } from './view'
import type { Model, Obj, Guide } from '../3dview/types'

const ent = (over: Partial<Ent> = {}): Ent => ({ id: 'e', type: 'rect', a: [0, 0], b: [10, 10], ...over } as Ent)
const planCtx: ViewCtx = { dir: 'plan', isPlan: true, isElev: false, isIso: false, elevDir: 'front', cx: 14000, cy: 8750, ground: 0, frameId: 'f1', paperMm: 1, mdl: undefined, yaw: 0, pitch: 0 }

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
	it('text uses the shared PT_MM (0.352778) unchanged after switching from the private copy', () => {
		const t = ent({ type: 'text', a: [100, 200], b: undefined, text: 'AB', fontPt: 10 })
		// PT_MM = 0.352778 exactly (matches geometry.ts / constants.ts); pin the numeric box so a future
		// accidental swap to a different mm-per-point constant is caught even if textBox() itself is mocked.
		expect(bbox({ ...planCtx, paperMm: 2 }, t)).toEqual(textBox(t, 0.352778 * 2))
		expect(bbox({ ...planCtx, paperMm: 2 }, t)).toEqual([100, 193.649996, 108.466672, 203])
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

describe('hitModel (plan prism)', () => {
	const prism: Obj = { type: 'prism', id: 'p1', x: 100, y: 100, w: 200, d: 100, h: 500, z: 0, edges: 4, layer: 'furniture' } as Obj
	const modelCtx = (objects: Obj[]): ViewCtx => ({ ...planCtx, mdl: { id: 'm1', name: 'm', layers: [], levels: {}, objects } as Model })
	const shown = { visible: () => true, locked: () => false }
	it('picks a prism whose footprint contains p, misses outside', () => {
		expect(hitModel(modelCtx([prism]), [150, 130], 5, shown)).toBe('p1')   // inside 100..300 × 100..200
		expect(hitModel(modelCtx([prism]), [400, 400], 5, shown)).toBe(null)   // well outside
	})
	it('a hidden or locked model layer is not pickable', () => {
		expect(hitModel(modelCtx([prism]), [150, 130], 5, { visible: () => false, locked: () => false })).toBe(null)
		expect(hitModel(modelCtx([prism]), [150, 130], 5, { visible: () => true, locked: () => true })).toBe(null)
	})
})

describe('hitSection', () => {
	const sections = [{ id: 's1', clip: { x0: 0, y0: 0, z0: 0, x1: 100, y1: 100, z1: 10 } }]
	it('hits the border, misses the interior, only in plan', () => {
		expect(hitSection(planCtx, sections, [50, 1], 5)).toBe('s1')     // on the top edge
		expect(hitSection(planCtx, sections, [50, 50], 5)).toBe(null)    // interior stays free
		expect(hitSection({ ...planCtx, isPlan: false }, sections, [50, 1], 5)).toBe(null)
	})
})

describe('hitGuide', () => {
	const guides: Guide[] = [{ id: 'g1', plane: 'plan', orient: 'h', pos: 100 }, { id: 'g2', plane: 'plan', orient: 'v', pos: 200 }]
	it('picks the h guide by y and the v guide by x within tolerance', () => {
		expect(hitGuide(guides, [40, 102], 5)).toBe('g1')   // near y=100
		expect(hitGuide(guides, [198, 40], 5)).toBe('g2')   // near x=200
		expect(hitGuide(guides, [40, 130], 5)).toBe(null)   // far from both
	})
})

describe('marqueeSelect', () => {
	const ents: Ent[] = [
		{ id: 'a', type: 'rect', a: [10, 10], b: [30, 30] },   // fully inside 0..100
		{ id: 'b', type: 'rect', a: [90, 90], b: [140, 140] }, // straddles the box edge
	]
	const all = () => true
	it('window (L→R) encloses fully; crossing (R→L) also grabs intersecting', () => {
		expect(marqueeSelect(planCtx, ents, [0, 0], [100, 100], all)).toEqual(['a'])          // window: only fully-inside
		expect(marqueeSelect(planCtx, ents, [100, 100], [0, 0], all)).toEqual(['a', 'b'])      // crossing: intersect too
	})
	it('respects the pickable gate', () => {
		expect(marqueeSelect(planCtx, ents, [100, 100], [0, 0], (e) => e.id !== 'b')).toEqual(['a'])
	})
})

describe('hitModel — wall face in an elevation (B23)', () => {
	const frontCtx: ViewCtx = { ...planCtx, dir: 'front', isPlan: false, isElev: true, elevDir: 'front', ground: 10250 }
	const wall = { type: 'wall', id: 'w1', h: 2800, thickness: 100, layer: 'walls', nodes: [{ id: 'a', x: 1000, y: 5000, z: 0 }, { id: 'b', x: 3000, y: 5000, z: 0 }], segments: [{ a: 'a', b: 'b' }] } as Obj
	const ctx: ViewCtx = { ...frontCtx, mdl: { id: 'm1', name: 'm', layers: [], levels: {}, objects: [wall] } as Model }
	const shown = { visible: () => true, locked: () => false }
	it('picks anywhere on the drawn face (x-span × ground−h..ground), not just near the base line', () => {
		expect(hitModel(ctx, [2000, 10250 - 1500], 5, shown)).toBe('w1')   // mid-face, 1.5 m up
		expect(hitModel(ctx, [2000, 10250 - 2790], 5, shown)).toBe('w1')   // just under the top
		expect(hitModel(ctx, [2000, 10250 - 10], 5, shown)).toBe('w1')     // near the base (old behaviour kept)
		expect(hitModel(ctx, [3500, 10250 - 1500], 5, shown)).toBe(null)   // beyond the end
		expect(hitModel(ctx, [2000, 10250 - 3000], 5, shown)).toBe(null)   // above the top
	})
	it('plan picking is unchanged: the ribbon within thickness/2 + tol', () => {
		const pctx: ViewCtx = { ...planCtx, mdl: ctx.mdl }
		expect(hitModel(pctx, [2000, 5040], 5, shown)).toBe('w1')
		expect(hitModel(pctx, [2000, 5100], 5, shown)).toBe(null)
	})
})
