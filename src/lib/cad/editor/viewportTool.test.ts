// The Viewport tool: a viewport drawn as a box on a sheet (backlog "Viewport tool (draw a box)", User 2026-10-06).
import { describe, it, expect } from 'vitest'
import { EntityStore } from '../store/store'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import type { Sheet, Viewport } from '../domain/drawing'
import { spaceOf } from '../views/space'
import { ViewportTool } from './viewportTool'
import type { ToolCtx } from './tools'

const SHEET: Sheet = { type: 'sheet', id: 'SH', number: 'S001', title: 'T', order: 1, paper: { size: 'A3', orientation: 'landscape', marginMm: 5 }, viewports: [], status: 'active' }

function harness() {
	const store = new EntityStore()
	store.load([...demoProject(), SHEET])
	let sel: string[] = [], vpSel: string | null = null, said = ''
	const ctx = () => ({
		store, index: new ProjectIndex(store.all()), levelId: 'L33', opts: { z: 0, w: 100, h: 50 }, prims: () => [], tol: () => 1,
		space: spaceOf({ kind: 'sheet', sheetId: 'SH' }), work: { z: 0, depth: 2000 }, snap: (p: { x: number; y: number }) => ({ p, kind: 'grid' as const }),
		selection: sel, select: (x: string[]) => { sel = x }, selectViewport: (id: string | null) => { vpSel = id }, setMarquee: () => {}, ask: () => {}, say: (m: string) => { said = m },
	}) as unknown as ToolCtx
	return { store, ctx, sel: () => sel, vpSel: () => vpSel, said: () => said }
}
const at = (x: number, y: number, alt = false) => ({ p: { x, y }, shift: false, ctrl: false, alt })

describe('viewport tool', () => {
	it('a drag draws the window (whole mm); it shows the given view, fitted, and is selected; then back to Select', () => {
		const h = harness()
		let done = false
		const t = new ViewportTool(() => null, () => { done = true })
		t.down(at(20.4, 30), h.ctx()); t.move(at(150, 120.6)); t.up(at(150, 120.6), h.ctx())
		const vps = (h.store.get('SH') as Sheet).viewports
		expect(vps).toHaveLength(1)
		expect(vps[0].rect).toEqual({ x: 20, y: 30, w: 130, h: 91 })
		expect(vps[0].view).toEqual({ levelId: 'L33', spec: { kind: 'plan' } })
		expect([1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]).toContain(vps[0].scale)
		expect(h.sel()).toEqual(['SH'])
		expect(h.vpSel()).toBe(vps[0].id)
		expect(done).toBe(true)
	})
	it('two clicks work too, and the view comes from the app (the other pane)', () => {
		const h = harness()
		const view: Viewport['view'] = { levelId: 'L33', spec: { kind: 'elevation', dir: 'front' } }
		const t = new ViewportTool(() => view, () => {})
		t.down(at(200, 100), h.ctx()); t.up(at(200, 100), h.ctx()); t.down(at(100, 40), h.ctx())
		const vp = (h.store.get('SH') as Sheet).viewports[0]
		expect(vp.rect).toEqual({ x: 100, y: 40, w: 100, h: 60 })
		expect(vp.view).toEqual(view)
	})
	it('a box under 20 mm is refused, with a message', () => {
		const h = harness()
		const t = new ViewportTool(() => null, () => {})
		t.down(at(10, 10), h.ctx()); t.move(at(40, 25)); t.up(at(40, 25), h.ctx())
		expect((h.store.get('SH') as Sheet).viewports).toHaveLength(0)
		expect(h.said()).toMatch(/at least 20/)
	})
})
