// Move / Copy with a base point (Dave, 2026-10-05).
import { describe, it, expect } from 'vitest'
import { EntityStore } from '../store/store'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { MoveTool } from './moveTool'
import { spaceOf, PLAN } from '../views/space'
import type { ToolCtx } from './tools'
import type { Shape } from '../domain/shapes'

const box = { type: 'shape', id: 'B', levelId: 'L33', geom: { kind: 'rect', centre: { x: 100, y: 100 }, size: { x: 50, y: 50 } } } as Shape

function harness() {
	const store = new EntityStore()
	store.load([...demoProject(), box])
	let sel = ['B']
	const ctx = () => ({
		store, index: new ProjectIndex(store.all()), levelId: 'L33', opts: { z: 0, w: 100, h: 50 }, prims: () => [], tol: () => 10,
		space: spaceOf(PLAN), work: { z: 0, depth: 0 }, snap: (p: { x: number; y: number }) => ({ p, kind: 'grid' as const }),
		selection: sel, select: (x: string[]) => { sel = x }, setMarquee: () => {}, ask: () => {}, say: () => {},
	}) as unknown as ToolCtx
	return { store, ctx }
}
const at = (x: number, y: number, shift = false) => ({ p: { x, y }, shift, ctrl: false, alt: false })
const rects = (s: EntityStore) => s.ofType('shape').filter((x) => x.geom.kind === 'rect').map((x) => (x.geom.kind === 'rect' ? x.geom.centre : null))

describe('move / copy with a base point', () => {
	it('move: base point, then the second point moves the selection by the difference, one undo step', () => {
		const h = harness(), t = new MoveTool('move')
		t.down(at(0, 0), h.ctx()); t.down(at(1000, 500), h.ctx())
		expect(rects(h.store)).toEqual([{ x: 1100, y: 600 }])
		expect(h.store.undoLabels).toEqual(['Move'])
		expect(t.lastPoint()).toBeNull()   // done: the next click is a new base point
	})
	it('a typed second point is taken as it is (the tool bar turns @dx,dy into it from the base)', () => {
		const h = harness(), t = new MoveTool('move')
		t.down(at(100, 100), h.ctx()); t.typed({ x: 100, y: 2100 }, h.ctx())
		expect(rects(h.store)).toEqual([{ x: 100, y: 2100 }])
	})
	it('copy: each click a copy from the base point; the original stays; Enter ends', () => {
		const h = harness(), t = new MoveTool('copy')
		t.down(at(0, 0), h.ctx()); t.down(at(1000, 0), h.ctx()); t.down(at(2000, 0), h.ctx())
		expect(rects(h.store).map((p) => p!.x).sort((a, b) => a - b)).toEqual([100, 1100, 2100])
		expect(h.store.undoLabels).toEqual(['Copy', 'Copy'])
		expect(t.key({ key: 'Enter' } as KeyboardEvent)).toBe(true)
		expect(t.lastPoint()).toBeNull()
	})
	it('nothing selected: it says so and waits', () => {
		const h = harness(), t = new MoveTool('move'), c = { ...h.ctx(), selection: [] } as ToolCtx
		t.down(at(0, 0), c)
		expect(t.lastPoint()).toBeNull()
	})
})
