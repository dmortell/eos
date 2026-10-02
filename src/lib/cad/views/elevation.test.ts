// Elevations as behaviour: what the front / rear / side views show, and drawing / moving in them.
import { describe, it, expect } from 'vitest'
import { elevationDisplayList, RU_MM } from './elevation'
import { spaceOf } from './space'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { EntityStore } from '../store/store'
import { PathTool } from '../editor/pathTool'
import { SelectTool, type ToolCtx } from '../editor/tools'
import { snapToPrims } from '../editor/snap'
import type { Entity } from '../domain/drawing'
import type { Outlet, Rack } from '../domain/types'
import type { Shape } from '../domain/shapes'

/** The demo with its rack placed (front = +y, unrotated) at plan (5000, 1000). */
const placed = (): Entity[] => demoProject().map((e) => (e.id === 'R1' ? { ...(e as Rack), at: { x: 5000, y: 1000 } } : e))
const view = (dir: 'front' | 'rear' | 'left' | 'right', ents = placed()) => elevationDisplayList(new ProjectIndex(ents), 'L33', spaceOf({ kind: 'elevation', dir }), { scale: 100 })
const srcs = (dir: 'front' | 'rear' | 'left' | 'right') => new Set(view(dir).map((p) => p.src).filter(Boolean))

describe('what an elevation shows', () => {
	it("the FRONT shows the rack's front-mounted devices; the REAR its rear ones; a SIDE none", () => {
		// P1 is mounted 'both', SW1 'front'
		expect(srcs('front').has('SW1')).toBe(true)
		expect(srcs('front').has('P1')).toBe(true)
		expect(srcs('rear').has('SW1')).toBe(false)
		expect(srcs('rear').has('P1')).toBe(true)
		expect(srcs('left').has('P1')).toBe(false)
		expect(srcs('left').has('R1')).toBe(true)
	})
	it('a device sits at its U: panel at U40 is 39 rack units above the rack base', () => {
		const p = view('front').find((x) => x.src === 'P1' && x.k === 'line') as { pts: { y: number }[] }
		const r = view('front').find((x) => x.src === 'R1' && x.k === 'line') as { pts: { y: number }[] }
		const rackBottom = Math.max(...r.pts.map((q) => -q.y)) === 0 ? 0 : 0
		const deviceBottom = Math.min(...p.pts.map((q) => -q.y))
		const base = (42 * RU_MM + 150 - 42 * RU_MM) / 2
		expect(deviceBottom - rackBottom).toBeCloseTo(base + 39 * RU_MM)
	})
	it('the trunk drop is a vertical band from +300 to +2900 at its plan position', () => {
		const drop = view('front').filter((x) => x.src === 'T1' && x.k === 'line').find((x) => (x as { pts: { x: number }[] }).pts.every((q) => q.x === 6000)) as { pts: { y: number }[]; w: number }
		expect(drop.pts.map((q) => -q.y).sort((a, b) => a - b)).toEqual([300 + 25, 2900 + 25])   // bottom-anchored 100×50 → centre line +25
		expect(drop.w).toBe(100)
	})
	it('outlets show as faceplates at their height, in plan order along the view', () => {
		const xs = view('front').filter((x) => (x.src === 'O1' || x.src === 'O2') && x.k === 'line').map((x) => (x as { pts: { x: number }[] }).pts[0].x)
		expect(xs[0]).toBeLessThan(xs[1])
		const ys = view('rear').filter((x) => (x.src === 'O1' || x.src === 'O2') && x.k === 'line').map((x) => (x as { pts: { x: number }[] }).pts[0].x)
		expect(ys[0]).toBeGreaterThan(ys[1])   // seen from behind, the order flips
	})
	it('level datum lines are drawn (FFL, ceiling …)', () => {
		expect(view('front').some((p) => p.k === 'text' && p.text === 'FFL ±0')).toBe(true)
	})
})

function harness(dir: 'front' | 'left', depth: number) {
	const store = new EntityStore()
	store.load(placed())
	let sel: string[] = []
	const space = spaceOf({ kind: 'elevation', dir })
	const ctx = (): ToolCtx => {
		const index = new ProjectIndex(store.all())
		return {
			store, index, levelId: 'L33', opts: { z: 0, w: 100, h: 50 }, space, work: { z: 0, depth },
			prims: () => elevationDisplayList(index, 'L33', space, { scale: 100 }), tol: () => 10,
			snap: (p, alt) => snapToPrims([], p, 10, { noGrid: alt }), selection: sel, select: (ids) => { sel = ids }, setMarquee: () => {}, ask: () => {},
		}
	}
	return { store, ctx, sel: () => sel }
}
const at = (x: number, y: number) => ({ p: { x, y }, shift: false, ctrl: false, alt: false })

describe('drawing and moving in an elevation (ADR 0006)', () => {
	it('a run drawn straight down in the FRONT view is a vertical drop at the work depth', () => {
		const h = harness('front', 3000)              // front: depth = plan y
		const t = new PathTool('trunk')
		t.down(at(2000, -2900), h.ctx()); t.down(at(2000, -300), h.ctx()); t.finish(h.ctx())
		const s = h.store.get(h.sel()[0]) as Shape
		expect(s.geom.kind === 'path' && s.geom.nodes.map((n) => [n.x, n.y, n.z])).toEqual([[2000, 3000, 2900], [2000, 3000, 300]])
	})
	it('in the LEFT view the same strokes run along the plan y axis', () => {
		const h = harness('left', -500)               // left: n = −x, so depth −500 is plan x = 500
		const t = new PathTool('line')
		t.down(at(0, -1000), h.ctx()); t.down(at(4000, -1000), h.ctx()); t.finish(h.ctx())
		const s = h.store.get(h.sel()[0]) as Shape
		expect(s.geom.kind === 'path' && s.geom.nodes.map((n) => [n.x, n.y, n.z])).toEqual([[500, 0, 1000], [500, 4000, 1000]])
	})
	it('dragging an outlet up in an elevation raises it (z) and slides it along the view', () => {
		const h = harness('front', 0)
		const sel = new SelectTool()
		const c = h.ctx()
		const face = c.prims().find((p) => p.src === 'O1' && p.k === 'line') as { pts: { x: number; y: number }[] }
		const grab = { x: face.pts[0].x + 10, y: face.pts[0].y - 10 }
		sel.down(at(grab.x, grab.y), c)
		sel.move(at(grab.x + 100, grab.y - 1200), h.ctx())
		sel.up(at(grab.x + 100, grab.y - 1200), h.ctx())
		const o = h.store.get('O1') as Outlet
		expect([o.at?.x, o.at?.y, o.z]).toEqual([1100, 4000, 1200])
	})
})
