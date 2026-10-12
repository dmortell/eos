// Dimensions and notes on plans / elevations (Dave, 2026-10-05).
import { describe, it, expect } from 'vitest'
import { EntityStore } from '../store/store'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { DimTool, type DimMode } from './dimTool'
import { NoteTool } from './noteTool'
import { dimensionPrims, shapePrims, planDisplayList, wrapLine } from '../views/plan'
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
	it('the length in mm below 10 m, else m; horizontal / vertical measure one direction only', () => {
		const d = (b: { x: number; y: number }, mode: DimMode = 'aligned') => texts(dimensionPrims({ kind: 'dimension', a: { x: 0, y: 0 }, b, mode, offset: 500 }, 100, 'D'))
		expect(d({ x: 450, y: 0 })).toEqual(['450'])
		expect(d({ x: 3000, y: 4000 })).toEqual(['5000'])
		expect(d({ x: 12500, y: 0 })).toEqual(['12.5 m'])
		expect(d({ x: 3000, y: 4000 }, 'horizontal')).toEqual(['3000'])
		expect(d({ x: 3000, y: 4000 }, 'vertical')).toEqual(['4000'])
	})
	it('the tool on a plan: two points, then the line\'s place → a dimension in the level\'s model, one undo step', () => {
		const h = harness(PLAN), t = new DimTool(() => 'horizontal')
		t.down(at(0, 0), h.ctx()); t.down(at(2400, 300), h.ctx()); t.down(at(1000, -600), h.ctx())
		const s = h.store.get(h.sel()[0]) as Shape
		expect(s.geom).toEqual({ kind: 'dimension', a: { x: 0, y: 0 }, b: { x: 2400, y: 300 }, mode: 'horizontal', offset: -600 })
		expect(h.store.undoLabels).toEqual(['Dimension'])
		expect(texts(planDisplayList(new ProjectIndex(h.store.all()), 'L33', { scale: 100 }).filter((p) => p.src === s.id) as never)).toEqual(['2400'])
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
	it('on a drawing a new text goes down as "Text" with its box open; the Text tool on an existing text edits it', () => {
		const h = harness(PLAN), t = new NoteTool('text')
		let editing: string | null = null
		const ctx = () => ({ ...h.ctx(), editText: (id: string) => { editing = id }, prims: () => planDisplayList(new ProjectIndex(h.store.all()), 'L33', { scale: 100 }) }) as ToolCtx
		t.down(at(500, 500), ctx()); t.up(at(500, 500), ctx())
		const s = h.store.get(h.sel()[0]) as Shape
		expect(s.geom).toMatchObject({ kind: 'text', text: 'Text' })
		expect(editing).toBe(s.id)
		editing = null
		t.down(at(560, 470), ctx()); t.up(at(560, 470), ctx())   // on its words
		expect(editing).toBe(s.id)
		expect(h.store.ofType('shape').filter((x) => x.geom.kind === 'text')).toHaveLength(1)
	})
	it('a text with a box width wraps inside it (at spaces; Japanese between any characters)', () => {
		expect(wrapLine('ONE TWO THREE', 10, 40)).toEqual(['ONE', 'TWO', 'THREE'])
		expect(wrapLine('ONE TWO', 10, 100)).toEqual(['ONE TWO'])
		expect(wrapLine('サーバー室', 10, 25)).toEqual(['サー', 'バー', '室'])
		const s = { type: 'shape', id: 'T', sheetId: 'S', geom: { kind: 'text', at: { x: 0, y: 0 }, text: 'ONE TWO THREE', sizeMm: 10, width: 40 } } as Shape
		expect(shapePrims(s, 1).map((p) => p.k === 'text' && p.text)).toEqual(['ONE', 'TWO', 'THREE'])
	})
	it('a callout: dragged from its tip it\'s made on release with its words box open; a box border frames the words', () => {
		const h = harness(PLAN), t = new NoteTool('leader')
		let editing: string | null = null
		const ctx = () => ({ ...h.ctx(), editText: (id: string) => { editing = id } }) as ToolCtx
		t.down(at(0, 0), ctx()); t.move(at(800, -400), ctx()); t.up(at(800, -400), ctx())
		const s = h.store.get(h.sel()[0]) as Shape
		expect(s.geom).toMatchObject({ kind: 'leader', pts: [{ x: 0, y: 0 }, { x: 800, y: -400 }] })
		expect(editing).toBe(s.id)
		const boxed = shapePrims({ ...s, geom: { ...s.geom, text: 'A\nB', border: 'box' } as unknown as Shape['geom'] }, 100)
		expect(boxed.filter((p) => p.k === 'text').length).toBe(2)
		expect(boxed.some((p) => p.k === 'line' && p.closed && p.cls === 'leader')).toBe(true)
	})
	it('a text of several lines draws one line under another, on its alignment; the background box covers them all', () => {
		const s = { type: 'shape', id: 'T', levelId: 'L33', geom: { kind: 'text', at: { x: 0, y: 0 }, text: 'ONE\nTWO', sizeMm: 2, align: 'right' }, style: { fill: '#ffffff' } } as Shape
		const ps = shapePrims(s, 100)
		expect(ps.map((p) => p.k === 'text' && [p.text, p.at.y, p.anchor])).toEqual([false, ['ONE', 0, 'end'], ['TWO', 260, 'end']])
		const box = ps[0].k === 'line' ? ps[0].pts : []
		expect(Math.max(...box.map((p) => p.x))).toBeCloseTo(50)   // right-aligned: the box ends at the point (+ padding)
		expect(Math.max(...box.map((p) => p.y))).toBeCloseTo(310)
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
