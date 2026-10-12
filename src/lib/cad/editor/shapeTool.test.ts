// The Shape tool (rectangle / ellipse / regular polygon) and Shift constraints (Dave, 2026-10-05).
import { describe, it, expect } from 'vitest'
import { EntityStore } from '../store/store'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { ShapeTool, shapeGeom, type ShapeOpts } from './shapeTool'
import { angleStep, axisLock, squareCorner } from './constrain'
import { spaceOf, PLAN, type ViewSpec } from '../views/space'
import { elevationDisplayList } from '../views/elevation'
import { planDisplayList } from '../views/plan'
import type { ToolCtx } from './tools'
import type { Shape } from '../domain/shapes'
import { arcThrough, arcPoints } from '../domain/shapes'
import { dragRegionGrip } from './shapeGrips'

const opts = (o: Partial<ShapeOpts> = {}): ShapeOpts => ({ kind: 'rect', sides: 6, inscribed: true, ...o })

describe('Shift constraints', () => {
	it('15° steps keep the distance along the snapped ray; moves lock to H / V; boxes go square', () => {
		expect(angleStep({ x: 0, y: 0 }, { x: 1000, y: 30 })).toEqual({ x: 1000, y: 0 })
		const p = angleStep({ x: 0, y: 0 }, { x: 700, y: 720 })   // ≈ 45°
		expect(Math.abs(p.x - p.y)).toBeLessThan(0.2)
		expect(axisLock({ x: 300, y: -40 })).toEqual({ x: 300, y: 0 })
		expect(axisLock({ x: 30, y: -400 })).toEqual({ x: 0, y: -400 })
		expect(squareCorner({ x: 0, y: 0 }, { x: -300, y: 100 })).toEqual({ x: -300, y: 300 })
	})
})

describe('shape geometry', () => {
	it('a rectangle corner to corner; Shift = a square', () => {
		expect(shapeGeom(opts(), { x: 0, y: 0 }, { x: 400, y: 200 }, false)).toEqual({ kind: 'rect', centre: { x: 200, y: 100 }, size: { x: 400, y: 200 } })
		expect(shapeGeom(opts(), { x: 0, y: 0 }, { x: 400, y: 200 }, true)).toMatchObject({ size: { x: 400, y: 400 } })
	})
	it('an ellipse in the box; Shift = a circle', () => {
		expect(shapeGeom(opts({ kind: 'ellipse' }), { x: 0, y: 0 }, { x: 400, y: 200 }, false)).toEqual({ kind: 'ellipse', centre: { x: 200, y: 100 }, rx: 200, ry: 100 })
		expect(shapeGeom(opts({ kind: 'ellipse' }), { x: 0, y: 0 }, { x: 400, y: 200 }, true)).toEqual({ kind: 'circle', centre: { x: 200, y: 200 }, r: 200 })
	})
	it('a regular polygon: inscribed puts a corner on the second click, circumscribed an edge\'s middle', () => {
		const ins = shapeGeom(opts({ kind: 'polygon', sides: 4 }), { x: 0, y: 0 }, { x: 100, y: 0 }, false) as { pts: { x: number; y: number }[] }
		expect(ins.pts).toHaveLength(4)
		expect(ins.pts[0]).toEqual({ x: 100, y: 0 })
		const out = shapeGeom(opts({ kind: 'polygon', sides: 4, inscribed: false }), { x: 0, y: 0 }, { x: 100, y: 0 }, false) as { pts: { x: number; y: number }[] }
		// a square round a circle of radius 100: corners at (±100, ±100)
		expect(out.pts.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([[100, 100], [-100, 100], [-100, -100], [100, -100]])
	})
})

describe('the Shape tool', () => {
	function harness(spec: ViewSpec) {
		const store = new EntityStore()
		store.load(demoProject())
		let sel: string[] = []
		const ctx = () => ({
			store, index: new ProjectIndex(store.all()), levelId: 'L33', opts: { z: 0, w: 100, h: 50 }, prims: () => [], tol: () => 10,
			space: spaceOf(spec), work: { z: 0, depth: 2000 }, snap: (p: { x: number; y: number }) => ({ p, kind: 'grid' as const }),
			selection: sel, select: (x: string[]) => { sel = x }, setMarquee: () => {}, ask: () => {}, say: () => {},
		}) as unknown as ToolCtx
		return { store, ctx, sel: () => sel }
	}
	const at = (x: number, y: number, shift = false) => ({ p: { x, y }, shift, ctrl: false, alt: false })
	it('on a plan: click, click → a rectangle in the level\'s model, one undo step', () => {
		const h = harness(PLAN), t = new ShapeTool(() => opts())
		t.down(at(0, 0), h.ctx()); t.up(at(0, 0), h.ctx()); t.down(at(400, 200), h.ctx())
		const s = h.store.get(h.sel()[0]) as Shape
		expect(s).toMatchObject({ levelId: 'L33', geom: { kind: 'rect', size: { x: 400, y: 200 } } })
		expect(h.store.undoLabels).toEqual(['Draw rect'])
		expect(planDisplayList(new ProjectIndex(h.store.all()), 'L33', { scale: 100 }).some((p) => p.src === s.id)).toBe(true)
	})
	it('an arc: start, a point on it, end → through all three; drawn on the plan; its middle grip reshapes it', () => {
		const h = harness(PLAN), t = new ShapeTool(() => opts({ kind: 'arc' }))
		t.down(at(-1000, 0), h.ctx()); t.up(at(-1000, 0), h.ctx()); t.down(at(0, -1000), h.ctx()); t.down(at(1000, 0), h.ctx())
		const s = h.store.get(h.sel()[0]) as Shape
		expect(s.geom).toEqual({ kind: 'arc', centre: { x: 0, y: 0 }, r: 1000, start: 180, end: 0 })   // clockwise on screen, over the top
		expect(h.store.undoLabels).toEqual(['Draw arc'])
		const line = planDisplayList(new ProjectIndex(h.store.all()), 'L33', { scale: 100 }).find((p) => p.src === s.id)
		expect(line?.k === 'line' && Math.min(...line.pts.map((q) => Math.round(q.y)))).toBe(-1000)
		// the other way round (through the bottom) when the middle point is there
		expect(arcThrough({ x: -1000, y: 0 }, { x: 0, y: 1000 }, { x: 1000, y: 0 })).toMatchObject({ start: 0, end: 180 })
		expect(arcThrough({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeNull()
		const [, mid] = arcPoints(s.geom as never)
		expect(Math.abs(Math.round(mid.x))).toBe(0)
		expect(dragRegionGrip(s, 1, { x: 0, y: -500 }, false).geom).toMatchObject({ kind: 'arc', r: 1250 })   // flatter: through (0, −500)
	})
	it('on an elevation: drag → on the view\'s plane at the work depth, drawn in elevations, not on the plan', () => {
		const spec: ViewSpec = { kind: 'elevation', dir: 'front' }, h = harness(spec), t = new ShapeTool(() => opts({ kind: 'ellipse' }))
		t.down(at(1000, -1500), h.ctx()); t.move(at(1600, -1100), h.ctx()); t.up(at(1600, -1100), h.ctx())
		const s = h.store.get(h.sel()[0]) as Shape
		expect(s.plane).toMatchObject({ kind: 'vertical', depth: 2000 })
		expect(s.geom).toEqual({ kind: 'ellipse', centre: { x: 1300, y: 1300 }, rx: 300, ry: 200 })   // (u, z): z = 1100…1500
		const ix = new ProjectIndex(h.store.all())
		const drawn = elevationDisplayList(ix, 'L33', spaceOf(spec), { scale: 100 }).find((p) => p.src === s.id)
		expect(drawn && drawn.k === 'line' && Math.round(Math.min(...drawn.pts.map((q) => q.y)))).toBe(-1500)   // its top at Z 1500
		expect(planDisplayList(ix, 'L33', { scale: 100 }).some((p) => p.src === s.id)).toBe(false)
	})
})
