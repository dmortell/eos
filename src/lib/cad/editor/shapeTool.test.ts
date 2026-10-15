// The Shape tool (rectangle / ellipse / regular polygon) and Shift constraints (User, 2026-10-05).
import { describe, it, expect } from 'vitest'
import { EntityStore } from '../store/store'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { ShapeTool, shapeGeom, type ShapeOpts } from './shapeTool'
import { typeInto } from './input'
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
	it('typed (User 2026-10-14): a typed first corner, then width,depth towards the cursor — a box at its height', () => {
		const h = harness(PLAN), t = new ShapeTool(() => opts({ height: 50, z: 750 }), 'box')
		expect(t.typedLabel()).toBeNull()                       // the first corner: a point
		expect(t.typedText('1000,2000', h.ctx())).toBe(false)   // …read as x,y
		t.typed({ x: 1000, y: 2000 }, h.ctx())
		expect(t.lastPoint()).toEqual({ x: 1000, y: 2000 })
		expect(t.typedLabel()).toMatch(/width,depth/)
		t.hover(at(500, 2500), h.ctx())                          // the cursor left of and below the corner
		expect(t.typedText('1200, 600', h.ctx())).toBeNull()
		const s = h.store.get(h.sel()[0]) as Shape
		expect(s).toMatchObject({ geom: { kind: 'rect', centre: { x: 400, y: 2300 }, size: { x: 1200, y: 600 } }, extent: 50, plane: { kind: 'plan', z: 750 } })
		// one number: a square; @dx,dy and the rest still read as a point; nothing to size a polygon by
		const t2 = new ShapeTool(() => opts()); t2.typed({ x: 0, y: 0 }, h.ctx()); t2.hover(at(10, 10), h.ctx())
		expect(t2.typedText('@300,100', h.ctx())).toBe(false)
		expect(t2.typedText('500', h.ctx())).toBeNull()
		expect(h.store.get(h.sel()[0])).toMatchObject({ geom: { size: { x: 500, y: 500 } } })
		const poly = new ShapeTool(() => opts({ kind: 'polygon' })); poly.typed({ x: 0, y: 0 }, h.ctx())
		expect(poly.typedText('500', h.ctx())).toBe(false)
		expect(poly.typedLabel()).toMatch(/Radius/)
	})
	it('a Box drawn in an elevation (User 2026-10-14): width and height by its corners, depth from the options, its front on the work plane', () => {
		const spec: ViewSpec = { kind: 'elevation', dir: 'front' }, sp = spaceOf(spec), h = harness(spec)
		const t = new ShapeTool(() => opts({ kind: 'polygon', depth: 600 }), 'box')   // a polygon footprint is a rectangle here
		t.down(at(1000, -720), h.ctx()); t.up(at(1000, -720), h.ctx()); t.down(at(2200, -770), h.ctx())   // u 1000..2200, z 720..770
		const s = h.store.get(h.sel()[0]) as Shape
		expect(s).toMatchObject({ levelId: 'L33', geom: { kind: 'rect', size: { x: 1200, y: 600 } }, extent: 50, plane: { kind: 'plan', z: 720 } })
		expect(s.plane?.kind).toBe('plan')
		const g = s.geom as { centre: { x: number; y: number } }
		const front = sp.depthOf({ ...g.centre, z: 0 }) + 300
		expect(Math.round(front)).toBe(2000)   // the harness's work depth
		expect(Math.round(sp.fromWorld({ ...g.centre, z: 0 }).x)).toBe(1600)
		// and every view draws it: the front elevation shows it 1200 wide, 720..770 high
		const prims = elevationDisplayList(new ProjectIndex(h.store.all()), 'L33', sp, { scale: 100 }).filter((p) => p.src === s.id && p.k === 'line')
		const ys = prims.flatMap((p) => (p.k === 'line' ? p.pts.map((q) => -q.y) : []))
		expect([Math.min(...ys), Math.max(...ys)]).toEqual([720, 770])
	})
	it('a typed size draws ONE box and starts no other (User 2026-10-14: a second box began at "1200,600")', () => {
		const h = harness(PLAN), t = new ShapeTool(() => opts())
		t.down(at(5000, 5000), h.ctx()); t.up(at(5000, 5000), h.ctx()); t.hover(at(6000, 6000), h.ctx())
		expect(typeInto(t, '1200..600', h.ctx(), { x: 6000, y: 6000 }, false)).toBeNull()
		expect(h.store.ofType('shape').filter((s) => s.geom.kind === 'rect' && s.geom.size.x === 1200)).toHaveLength(1)
		expect(t.lastPoint()).toBeNull()        // nothing started
		expect(t.preview(h.ctx())).toEqual([])
	})
	it('the size beside the cursor while drawing: width × depth, a polygon its radius', () => {
		const h = harness(PLAN), t = new ShapeTool(() => opts())
		t.down(at(0, 0), h.ctx()); t.up(at(0, 0), h.ctx()); t.hover(at(1200, -600), h.ctx())
		expect(t.preview(h.ctx()).find((p) => p.k === 'text')).toMatchObject({ text: '1200 × 600' })
		const p = new ShapeTool(() => opts({ kind: 'polygon' }))
		p.down(at(0, 0), h.ctx()); p.up(at(0, 0), h.ctx()); p.hover(at(300, 400), h.ctx())
		expect(p.preview(h.ctx()).find((q) => q.k === 'text')).toMatchObject({ text: 'R 500' })
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

describe('an image box of a known picture', () => {
	it('is the largest box of its proportions inside the dragged one, from the first corner, and keeps the ratio', () => {
		const o: ShapeOpts = { kind: 'image', sides: 4, inscribed: true, image: { fileId: 'F', ratio: 2 } }
		expect(shapeGeom(o, { x: 0, y: 0 }, { x: 1000, y: 200 }, false)).toMatchObject({ size: { x: 400, y: 200 }, centre: { x: 200, y: 100 }, ratio: 2 })
		expect(shapeGeom(o, { x: 0, y: 0 }, { x: -300, y: -900 }, false)).toMatchObject({ size: { x: 300, y: 150 }, centre: { x: -150, y: -75 } })
		expect(shapeGeom({ ...o, image: { fileId: 'F' } }, { x: 0, y: 0 }, { x: 1000, y: 200 }, false)).toMatchObject({ size: { x: 1000, y: 200 } })   // ratio not measured: as dragged
	})
})
