// The Insert tool (Blocks panel): a block placed on the plan, and on a wall in an elevation (a wall faceplate).
import { describe, it, expect } from 'vitest'
import { EntityStore } from '../store/store'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { BUILTIN_BLOCKS, faceFor, blockFace } from '../domain/blocks'
import { InsertTool } from './insertTool'
import { spaceOf, PLAN, type ViewSpec } from '../views/space'
import { elevationDisplayList } from '../views/elevation'
import { planDisplayList } from '../views/plan'
import type { ToolCtx } from './tools'
import type { Shape } from '../domain/shapes'

const plate = BUILTIN_BLOCKS.find((b) => b.id === 'builtin:faceplate-power-1')!
const wall = { type: 'shape', id: 'W', levelId: 'L33', role: { kind: 'wall', openings: [] }, section: { w: 100, h: 2700 },
	geom: { kind: 'path', nodes: [{ id: 'a', x: 0, y: 5000, z: 0 }, { id: 'b', x: 4000, y: 5000, z: 0 }], segs: [{ id: 's', a: 'a', b: 'b' }] } } as Shape

function harness(spec: ViewSpec) {
	const store = new EntityStore()
	store.load([...demoProject(), wall])
	let sel: string[] = []
	const ctx = () => ({
		store, index: new ProjectIndex(store.all()), levelId: 'L33', opts: { z: 0, w: 100, h: 50 }, prims: () => [], tol: () => 10,
		space: spaceOf(spec), work: { z: 0, depth: 0 }, snap: (p: { x: number; y: number }) => ({ p, kind: 'grid' as const }),
		selection: sel, select: (ids: string[]) => { sel = ids }, setMarquee: () => {}, ask: () => {}, say: () => {},
	}) as unknown as ToolCtx
	return { store, ctx, sel: () => sel }
}
const click = (p: { x: number; y: number }) => ({ p, shift: false, ctrl: false, alt: false })

describe('the Insert tool', () => {
	it('places the chosen block on the plan where you click, as one undo step', () => {
		const h = harness(PLAN)
		new InsertTool(() => plate).down(click({ x: 1000, y: 2000 }), h.ctx())
		const s = h.store.get(h.sel()[0]) as Shape
		expect(s.geom).toMatchObject({ kind: 'insert', blockId: plate.id, at: { x: 1000, y: 2000 } })
		expect(h.store.undoLabels).toEqual([`Insert ${plate.name}`])
	})
	it('a block WITHOUT a front drawing placed on the plan is a plan symbol (not shown in elevations); one WITH a front shows it there', () => {
		const h = harness(PLAN), outlet = BUILTIN_BLOCKS.find((b) => b.id === 'builtin:outlet-floor')!
		new InsertTool(() => outlet).down(click({ x: 1000, y: 2000 }), h.ctx())
		expect('inElevations' in (h.store.get(h.sel()[0]) as Shape).geom).toBe(false)
		expect(plate.front).toBeTruthy()
		new InsertTool(() => plate).down(click({ x: 3000, y: 2000 }), h.ctx())
		expect(((h.store.get(h.sel()[0]) as Shape).geom as { inElevations?: boolean }).inElevations).toBe(true)
	})
	it('in an elevation: on the face of the wall behind the click, at the clicked height, facing you — and drawn there', () => {
		const spec: ViewSpec = { kind: 'elevation', dir: 'front' }, sp = spaceOf(spec)
		const h = harness(spec)
		new InsertTool(() => plate).down(click(sp.fromWorld({ x: 2000, y: 5000, z: 300 })), h.ctx())
		const s = h.store.get(h.sel()[0]) as Shape
		const g = s.geom as Extract<Shape['geom'], { kind: 'insert' }>
		expect(g.z).toBe(300)
		expect(Math.round(g.at.x)).toBe(2000)
		// the wall's face on the viewer's side (the front looks along −n), half its 100 mm thickness off the centre line
		expect(Math.abs(sp.depthOf({ ...g.at, z: 0 }) - sp.depthOf({ x: 2000, y: 5000, z: 0 }))).toBe(50)
		expect(sp.depthOf({ ...g.at, z: 0 })).toBeGreaterThan(sp.depthOf({ x: 2000, y: 5000, z: 0 }))
		// and the elevation draws it there (its symbol, picked as the insert)
		const prims = elevationDisplayList(new ProjectIndex(h.store.all()), 'L33', sp, { scale: 100, blocks: (id) => BUILTIN_BLOCKS.find((b) => b.id === id) })
		expect(prims.some((p) => p.src === s.id)).toBe(true)
		// an outlet symbol placed as a plain block shows no "{LABEL}" / "{PORTS}" / "{USAGE}" placeholders (Dave, A009)
		expect(prims.some((p) => p.k === 'text' && p.src === s.id && p.text.includes('{'))).toBe(false)
	})
	it('placed in an elevation it shows ONLY there (Dave 2026-10-12): its front; not on the plan or in another elevation', () => {
		const spec: ViewSpec = { kind: 'elevation', dir: 'front' }, sp = spaceOf(spec), h = harness(spec)
		new InsertTool(() => plate).down(click(sp.fromWorld({ x: 2000, y: 5000, z: 300 })), h.ctx())
		const s = h.store.get(h.sel()[0]) as Shape, ix = new ProjectIndex(h.store.all())
		expect((s.geom as { frame?: unknown }).frame).toBeTruthy()
		const blocks = (id: string) => BUILTIN_BLOCKS.find((b) => b.id === id)
		const here = elevationDisplayList(ix, 'L33', sp, { scale: 100, blocks }).filter((p) => p.src === s.id)
		const plateW = Math.max(...here.flatMap((p) => (p.k === 'line' ? p.pts.map((q) => q.x) : []))) - Math.min(...here.flatMap((p) => (p.k === 'line' ? p.pts.map((q) => q.x) : [])))
		expect(Math.round(plateW)).toBe(70)   // its front, real size
		expect(elevationDisplayList(ix, 'L33', spaceOf({ kind: 'elevation', dir: 'rear' }), { scale: 100, blocks }).some((p) => p.src === s.id)).toBe(false)
		expect(planDisplayList(ix, 'L33', { scale: 100, blocks }).some((p) => p.src === s.id)).toBe(false)
		// unticked "show in elevations" in Properties: back on the plan
		const g = s.geom as Extract<Shape['geom'], { kind: 'insert' }>, { inElevations: _i, ...planOnly } = g
		expect(planDisplayList(new ProjectIndex([...h.store.all().filter((e) => e.id !== s.id), { ...s, geom: planOnly } as Shape]), 'L33', { scale: 100, blocks }).some((p) => p.src === s.id)).toBe(true)
	})
	it('one decision for every view: faceFor → the plan symbol on plans and sheets, the front in elevations / sections', () => {
		expect([faceFor('plan'), faceFor('sheet'), faceFor('elevation'), faceFor('section')]).toEqual(['plan', 'plan', 'front', 'front'])
		expect(blockFace(plate, 'plan')).toBe(plate)
		expect(blockFace(plate, 'front').annotative).toBe(false)
	})
})
