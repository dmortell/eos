// Dimensions and notes on plans / elevations (Dave, 2026-10-05).
import { describe, it, expect } from 'vitest'
import { EntityStore } from '../store/store'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { DimTool, type DimMode } from './dimTool'
import { NoteTool } from './noteTool'
import { dimensionPrims, shapePrims, planDisplayList } from '../views/plan'
import { elevationDisplayList } from '../views/elevation'
import { spaceOf, PLAN, type ViewSpec } from '../views/space'
import type { ToolCtx } from './tools'
import type { Shape } from '../domain/shapes'

function harness(spec: ViewSpec, answer = '') {
	const store = new EntityStore()
	store.load(demoProject())
	let sel: string[] = []
	const ctx = () => ({
		store, index: new ProjectIndex(store.all()), levelId: 'L33', opts: { z: 0, w: 100, h: 50 }, prims: () => [], tol: () => 10,
		space: spaceOf(spec), work: { z: 0, depth: 1000 }, snap: (p: { x: number; y: number }) => ({ p, kind: 'grid' as const }),
		selection: sel, select: (x: string[]) => { sel = x }, setMarquee: () => {}, ask: () => {}, say: () => {}, askText: (_l: string, _v: string, apply: (t: string) => void) => apply(answer),
	}) as unknown as ToolCtx
	return { store, ctx, sel: () => sel }
}
const at = (x: number, y: number) => ({ p: { x, y }, shift: false, ctrl: false, alt: false })
const texts = (ps: ReturnType<typeof dimensionPrims>) => ps.filter((p) => p.k === 'text').map((p) => (p as { text: string }).text)

describe('dimensions', () => {
	it('the length in mm below a metre, else m; horizontal / vertical measure one direction only', () => {
		const d = (b: { x: number; y: number }, mode: DimMode = 'aligned') => texts(dimensionPrims({ kind: 'dimension', a: { x: 0, y: 0 }, b, mode, offset: 500 }, 100, 'D'))
		expect(d({ x: 450, y: 0 })).toEqual(['450'])
		expect(d({ x: 3000, y: 4000 })).toEqual(['5.00 m'])
		expect(d({ x: 12500, y: 0 })).toEqual(['12.5 m'])
		expect(d({ x: 3000, y: 4000 }, 'horizontal')).toEqual(['3.00 m'])
		expect(d({ x: 3000, y: 4000 }, 'vertical')).toEqual(['4.00 m'])
	})
	it('the tool on a plan: two points, then the line\'s place → a dimension in the level\'s model, one undo step', () => {
		const h = harness(PLAN), t = new DimTool(() => 'horizontal')
		t.down(at(0, 0), h.ctx()); t.down(at(2400, 300), h.ctx()); t.down(at(1000, -600), h.ctx())
		const s = h.store.get(h.sel()[0]) as Shape
		expect(s.geom).toEqual({ kind: 'dimension', a: { x: 0, y: 0 }, b: { x: 2400, y: 300 }, mode: 'horizontal', offset: -600 })
		expect(h.store.undoLabels).toEqual(['Dimension'])
		expect(texts(planDisplayList(new ProjectIndex(h.store.all()), 'L33', { scale: 100 }).filter((p) => p.src === s.id) as never)).toEqual(['2.40 m'])
	})
})

describe('notes on plans and elevations', () => {
	it('a text on a plan belongs to the level; its colour and background box show', () => {
		const h = harness(PLAN, 'RISER HERE'), t = new NoteTool('text')
		t.down(at(500, 500), h.ctx()); t.up(at(500, 500), h.ctx())
		const s = h.store.get(h.sel()[0]) as Shape
		expect(s).toMatchObject({ levelId: 'L33', geom: { kind: 'text', text: 'RISER HERE' } })
		const ps = shapePrims({ ...s, style: { stroke: '#2563eb', fill: '#fef3c7' } }, 100)
		expect(ps.map((p) => (p.k === 'image' ? '' : p.cls))).toEqual(['note-bg', 'note'])
		expect(ps[0]).toMatchObject({ color: '#fef3c7', fill: true })
		expect(ps[1]).toMatchObject({ color: '#2563eb' })
	})
	it('a text on an elevation lies on its plane: drawn there at the clicked height, not on the plan', () => {
		const spec: ViewSpec = { kind: 'elevation', dir: 'front' }, h = harness(spec, 'DATA OUTLETS @ 300'), t = new NoteTool('text')
		t.down(at(2000, -1200), h.ctx()); t.up(at(2000, -1200), h.ctx())
		const s = h.store.get(h.sel()[0]) as Shape, ix = new ProjectIndex(h.store.all())
		expect(s.plane).toMatchObject({ kind: 'vertical', depth: 1000 })
		const drawn = elevationDisplayList(ix, 'L33', spaceOf(spec), { scale: 100 }).find((p) => p.src === s.id)
		expect(drawn).toMatchObject({ k: 'text', text: 'DATA OUTLETS @ 300', at: { x: 2000, y: -1200 } })
		expect(planDisplayList(ix, 'L33', { scale: 100 }).some((p) => p.src === s.id)).toBe(false)
	})
})
