// Phase 5 of elevation-section-plan.md: EDITING 3D objects in an OBLIQUE view (a section line / elevation marker at a
// non-90° angle). A drag's horizontal du moves along the view frame's t in plan (depth kept), its vertical changes z;
// grid snap runs along the frame; a node drag / insert keeps its depth; a box's corner grip resizes the box along its own
// axis nearest t, the other side staying put. The four axis-aligned views keep their numbers (other tests pin them).
import { describe, it, expect } from 'vitest'
import { PLAN_CX, PLAN_CY, GROUND, frameAt, frameU, frameDepth, uToAlong, dotT, type Pt } from './geometry'
import type { ViewCtx } from './view'
import { translateInView, objSnapDeltaIn } from './vpModelEdit'
import { slideRnd, graphNodeApply, rndTo } from './snap'
import { modelGrips } from './grips'
import { prismRect, prismOutline } from './hit'
import type { Obj, Model } from '../3dview/types'
type Prism = Extract<Obj, { type: 'prism' }>
type Wall = Extract<Obj, { type: 'wall' }>

const f = frameAt([PLAN_CX, PLAN_CY], 30)   // t = (½, −√3/2), looking along n = (√3/2, ½)
const mdl: Model = { id: 'm', name: 'M', objects: [] }
const front: ViewCtx = { dir: 'front', isPlan: false, isElev: true, isIso: false, elevDir: 'front', cx: PLAN_CX, cy: PLAN_CY, ground: GROUND, paperMm: 1, mdl, yaw: 0, pitch: 0 }
const ob: ViewCtx = { ...front, frame: f }
const box = (over: Partial<Prism> = {}): Prism => ({ type: 'prism', id: 'b', x: 1000, y: 2000, z: 300, w: 600, d: 400, h: 1200, edges: 4, ...over })
const wall: Wall = { type: 'wall', id: 'w', h: 2700, thickness: 100, nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 4000, y: 1000, z: 0 }], segments: [{ id: 'ab', a: 'a', b: 'b' }] }
const ctr = (o: Prism): Pt => [o.x + o.w / 2, o.y + o.d / 2]

describe('moving in a 30° view', () => {
	it('a box: du along t (depth kept), dv → z', () => {
		const b = box(), m = translateInView(ob, b, 100, -50) as Prism
		expect(m.x).toBeCloseTo(1000 + 100 * f.t[0], 9); expect(m.y).toBeCloseTo(2000 + 100 * f.t[1], 9); expect(m.z).toBe(350)
		expect(frameU(f, [m.x, m.y]) - frameU(f, [b.x, b.y])).toBeCloseTo(100, 9)   // it moved 100 across the drawing…
		expect(frameDepth(f, [m.x, m.y])).toBeCloseTo(frameDepth(f, [b.x, b.y]), 9)   // …and not toward / away from the viewer
		expect(b.x).toBe(1000)   // (a copy)
		expect((translateInView(ob, b, 0, 500) as Prism).z).toBe(0)   // z stays ≥ 0
	})
	it('a wall: every node the same way', () => {
		const m = translateInView(ob, wall, -200, 0) as Wall
		m.nodes.forEach((n, i) => { const o = wall.nodes[i]; expect(n.x - o.x).toBeCloseTo(-200 * f.t[0], 9); expect(n.y - o.y).toBeCloseTo(-200 * f.t[1], 9); expect(n.z).toBe(o.z) })
	})
	it('the front view keeps its numbers (x += du, z −= dv)', () => {
		const m = translateInView(front, box(), 100, -50) as Prism
		expect([m.x, m.y, m.z]).toEqual([1100, 2000, 350])
	})
	it('grid snap runs along the frame: the reference point’s x·t lands on the grid', () => {
		const b = box(), rnd = (v: number) => rndTo(v, 100), [dx, dy] = objSnapDeltaIn(ob, b, 130, -40, rnd)
		const h = dotT(f, b.x, b.y) + dx, m = translateInView(ob, b, dx, dy) as Prism
		expect(Math.abs(h / 100 - Math.round(h / 100))).toBeLessThan(1e-9)
		expect(dotT(f, m.x, m.y)).toBeCloseTo(h, 6); expect(m.z).toBe(300)   // −40 rounds −z = −300 → −300: no change
	})
})

describe('nodes in a 30° view', () => {
	it('slideRnd: the ALONG coord rounds, the depth stays', () => {
		const p: Pt = [1234, 567], q = slideRnd(f, p, frameU(f, p) + 333, (v) => rndTo(v, 100))
		expect(frameDepth(f, q)).toBeCloseTo(frameDepth(f, p), 9)
		const a = uToAlong(f, frameU(f, q)); expect(Math.abs(a / 100 - Math.round(a / 100))).toBeLessThan(1e-9)
		expect(slideRnd({ ...f, t: [1, 0], n: [0, 1] }, p, 5049, (v) => rndTo(v, 100))[1]).toBe(567)   // axis-aligned: only x moves
	})
	it('graphNodeApply drags a node to the pointer without moving it in depth', () => {
		const n = { id: 'n', x: 2000, y: 500, z: 0 }, d0 = frameDepth(f, [n.x, n.y]), u = frameU(f, [n.x, n.y]) + 750
		graphNodeApply(ob, n, [u, GROUND - 1200], { snapNode: () => null, rnd: (v) => v })
		expect(frameU(f, [n.x, n.y])).toBeCloseTo(u, 9); expect(frameDepth(f, [n.x, n.y])).toBeCloseTo(d0, 9); expect(n.z).toBe(1200)
	})
})

describe('box grips in a 30° view', () => {
	const opts = { rnd: (v: number) => v, applyNode: () => {} }
	const right = (o: Prism) => { const gs = modelGrips(ob, o, opts); return gs.reduce((a, g) => (g.x > a.x || (g.x === a.x && g.y > a.y) ? g : a)) }
	it('sit on the drawn outline (a turned box too); no tilt handle (it would tilt about x / y, not the look axis)', () => {
		const o = box({ rot: 20 }), r = prismRect(ob, o)!, ol = prismOutline(ob, o).map((p) => p[0])
		expect(r.x0).toBeCloseTo(Math.min(...ol), 6); expect(r.x1).toBeCloseTo(Math.max(...ol), 6)
		expect(modelGrips(ob, box(), opts)).toHaveLength(4)
		expect(modelGrips(front, box(), opts)).toHaveLength(5)   // the front view keeps its tilt handle
	})
	it('a box squared to the view (rot −60°: its x axis along t) grows its width exactly; the left side stays', () => {
		const o = box({ rot: -60 }), r0 = prismRect(ob, o)!, c0 = ctr(o), g = right(o)
		g.apply([g.x + 200, g.y])
		expect(o.w).toBeCloseTo(800, 6); expect(o.d).toBe(400)
		const r1 = prismRect(ob, o)!
		expect(r1.x0).toBeCloseTo(r0.x0, 6); expect(r1.x1).toBeCloseTo(r0.x1 + 200, 6)
		expect(frameDepth(f, ctr(o))).toBeCloseTo(frameDepth(f, c0), 6)   // it didn't slide toward / away from the viewer
	})
	it('an unturned box at 30°: the size along the axis nearest t (y here) changes, foreshortened', () => {
		const o = box(), r0 = prismRect(ob, o)!, g = right(o)
		g.apply([g.x + 200, g.y])
		expect(o.w).toBe(600); expect(o.d).toBeCloseTo(400 + 200 / Math.cos(Math.PI / 6), 6)
		const r1 = prismRect(ob, o)!
		expect(r1.x0).toBeCloseTo(r0.x0, 6); expect(r1.x1).toBeCloseTo(r0.x1 + 200, 6)
	})
	it('the vertical drag still sets z / h', () => {
		const o = box(), g = modelGrips(ob, o, opts).reduce((a, q) => (q.y < a.y ? q : a))   // a top corner
		g.apply([g.x, g.y - 300])
		expect(o.z).toBe(300); expect(o.h).toBeCloseTo(1500, 6)
	})
})
