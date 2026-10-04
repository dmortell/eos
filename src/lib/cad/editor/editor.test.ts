import { describe, it, expect } from 'vitest'
import { toModel, toScreen, zoomAt, fit } from './camera'
import { pickAt, pickInside } from './pick'
import { moveBy, canMove } from './behaviours'
import { planDisplayList } from '../views/plan'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import type { Outlet } from '../domain/types'
import type { ToolCtx } from './tools'
import { spaceOf, PLAN } from '../views/space'

const ix = () => new ProjectIndex(demoProject())

describe('camera', () => {
	it('zooming keeps the point under the cursor still', () => {
		const c = { x: 10, y: 20, k: 0.1 }
		const s = { x: 300, y: 200 }
		const before = toModel(c, s), after = toModel(zoomAt(c, s, 2), s)
		expect(after.x).toBeCloseTo(before.x); expect(after.y).toBeCloseTo(before.y)
	})
	it('fit puts the whole box on screen', () => {
		const c = fit({ x0: 0, y0: 0, x1: 10000, y1: 5000 }, 1000, 600, 20)
		const a = toScreen(c, { x: 0, y: 0 }), b = toScreen(c, { x: 10000, y: 5000 })
		expect(a.x).toBeGreaterThanOrEqual(19); expect(b.x).toBeLessThanOrEqual(981)
		expect(a.y).toBeGreaterThanOrEqual(19); expect(b.y).toBeLessThanOrEqual(581)
	})
})

describe('plan view', () => {
	it('draws every placed outlet with its label, and the rack only once placed', () => {
		const prims = planDisplayList(ix(), 'L33', { scale: 100 })
		expect(prims.filter((p) => p.k === 'text').map((p) => (p as { text: string }).text)).toEqual(expect.arrayContaining(['33-001', '33-002']))
		expect(prims.some((p) => p.src === 'R1')).toBe(false)    // the demo rack has no position yet
	})
	it('a trunk drop shows as a riser symbol with its height range, not as a line', () => {
		const prims = planDisplayList(ix(), 'L33', { scale: 100 }).filter((p) => p.src === 'T1')
		expect(prims.filter((p) => p.k === 'line' && p.cls.startsWith('run'))).toHaveLength(1)
		expect(prims.some((p) => p.k === 'text' && p.text.includes('+300') && p.text.includes('+2900'))).toBe(true)
	})
	it('symbols keep a constant paper size: twice the scale, twice the model size', () => {
		const r = (scale: number) => (planDisplayList(ix(), 'L33', { scale }).find((p) => p.src === 'O1' && p.k === 'circle') as { r: number }).r
		expect(r(200)).toBeCloseTo(2 * r(100))
	})
})

describe('picking uses what is drawn', () => {
	const prims = planDisplayList(ix(), 'L33', { scale: 100 })
	it('a click on an outlet symbol picks the outlet', () => {
		expect(pickAt(prims, { x: 1000, y: 4000 }, 10)).toBe('O1')
	})
	it('a click on a trunk band picks the trunk; empty space picks nothing', () => {
		expect(pickAt(prims, { x: 3000, y: 3020 }, 10)).toBe('T1')
		expect(pickAt(prims, { x: 3000, y: 9000 }, 10)).toBeUndefined()
	})
	it('a window around both outlets selects exactly them', () => {
		expect(pickInside(prims, { x0: 500, y0: 3500, x1: 3000, y1: 4500 }).sort()).toEqual(['O1', 'O2'])
	})
	it('a window around a trunk selects it even though its riser label sticks out past it', () => {
		const riserLabel = prims.find((p) => p.src === 'T1' && p.k === 'text' && p.cls === 'riser-label')
		expect(riserLabel).toBeDefined()   // the label reaches past x 6100 …
		expect(pickInside(prims, { x0: -100, y0: 2900, x1: 6100, y1: 3100 })).toContain('T1')   // … the window doesn't
	})
})

describe('moving', () => {
	it('moves a placed outlet, never an unplaced one, and never edits the original record', () => {
		const o = demoProject().find((e) => e.id === 'O1') as Outlet
		const m = moveBy(o, { x: 100, y: -50 })
		expect(m.at).toEqual({ x: 1100, y: 3950 })
		expect(o.at).toEqual({ x: 1000, y: 4000 })
		const { at: _a, ...unplaced } = o
		expect(canMove(unplaced as Outlet)).toBe(false)
	})
})

describe('the outlet tool', () => {
	it('places the next label, skipping labels already used on the level', async () => {
		const { EntityStore } = await import('../store/store')
		const { OutletTool } = await import('./tools')
		const store = new EntityStore()
		store.load(demoProject())
		const index = new ProjectIndex(store.all())
		let sel: string[] = []
		const tool = new OutletTool()
		const c: ToolCtx = {
			store, index, levelId: 'L33', opts: { z: 0, w: 100, h: 50 }, prims: () => [], tol: () => 1,
			space: spaceOf(PLAN), work: { z: 0, depth: 0 },
			snap: (p) => ({ p, kind: 'grid' }), selection: sel, select: (ids: string[]) => { sel = ids }, setMarquee: () => {}, ask: () => {},
		}
		tool.last = { ...(store.get('O1') as Outlet) }   // the last placed was 33-001; 33-002 exists → 33-003
		tool.down({ p: { x: 5000, y: 5000 }, shift: false, ctrl: false, alt: false }, c)
		const placed = store.get(sel[0]) as Outlet
		expect(placed.label).toBe('33-003')
		expect(placed.ports.map((p) => p.label)).toEqual(['33-003.A', '33-003.B'])
	})
})
