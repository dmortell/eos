// Viewports on a sheet through the Select tool: pick, move, resize by a corner, Alt-drag to pan the view.
import { describe, it, expect } from 'vitest'
import { EntityStore } from '../store/store'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { type ToolCtx } from './tools'
import { SelectTool } from './selectTool'
import { spaceOf } from '../views/space'
import { sheetDisplayList } from '../views/sheet'
import type { Sheet, Viewport } from '../domain/drawing'

const VP: Viewport = { id: 'V', view: { levelId: 'L33', spec: { kind: 'plan' } }, rect: { x: 20, y: 20, w: 200, h: 150 }, scale: 100, centre: { x: 3000, y: 4000 } }
const SHEET: Sheet = { type: 'sheet', id: 'SH', number: 'S001', title: 'T', order: 1, paper: { size: 'A3', orientation: 'landscape', marginMm: 5 }, viewports: [VP], status: 'active' }

function harness() {
	const store = new EntityStore()
	store.load([...demoProject(), SHEET])
	let sel: string[] = [], vp: string | null = null
	const ctx = (): ToolCtx => {
		const index = new ProjectIndex(store.all())
		return {
			store, index, levelId: 'L33', opts: { z: 0, w: 100, h: 50 }, space: spaceOf({ kind: 'sheet', sheetId: 'SH' }), work: { z: 0, depth: 0 },
			prims: () => sheetDisplayList(index, store.get('SH') as Sheet), tol: () => 2, snap: (p) => ({ p, kind: 'none' }) as never,
			selection: sel, select: (ids) => { sel = ids }, setMarquee: () => {}, ask: () => {},
			selectViewport: (id) => { vp = id }, viewportId: () => vp,
		}
	}
	const drag = (t: SelectTool, a: { x: number; y: number }, b: { x: number; y: number }, alt = false, ctrl = false) => {
		const ev = (p: { x: number; y: number }) => ({ p, shift: false, ctrl, alt })
		t.down(ev(a), ctx()); t.move(ev(b), ctx()); t.up(ev(b), ctx())
	}
	const vpNow = () => (store.get('SH') as Sheet).viewports[0]
	return { ctx, drag, vpNow, vp: () => vp, sel: () => sel }
}

describe('viewports on a sheet', () => {
	it('clicking inside picks the viewport; dragging moves its window', () => {
		const h = harness(), t = new SelectTool()
		h.drag(t, { x: 100, y: 100 }, { x: 130, y: 110 })
		expect(h.vp()).toBe('V')
		expect(h.vpNow().rect).toMatchObject({ x: 50, y: 30, w: 200, h: 150 })
	})
	it('a corner grip resizes it, the view staying where it is on the paper', () => {
		const h = harness(), t = new SelectTool()
		h.drag(t, { x: 100, y: 100 }, { x: 100, y: 100 })                 // select it
		h.drag(t, { x: 220, y: 170 }, { x: 260, y: 190 })                 // bottom-right corner +40, +20
		expect(h.vpNow().rect).toEqual({ x: 20, y: 20, w: 240, h: 170 })
		expect(h.vpNow().centre).toEqual({ x: 3000 + 20 * 100, y: 4000 + 10 * 100 })
	})
	it('Alt-drag inside pans the view (the centre), not the window (T126); Ctrl-drag no longer pans', () => {
		const h = harness(), t = new SelectTool()
		h.drag(t, { x: 100, y: 100 }, { x: 100, y: 100 })
		h.drag(t, { x: 100, y: 100 }, { x: 110, y: 100 }, true)
		expect(h.vpNow().rect.x).toBe(20)
		expect(h.vpNow().centre.x).toBe(3000 - 10 * 100)
		h.drag(t, { x: 100, y: 100 }, { x: 120, y: 100 }, false, true)
		expect(h.vpNow().centre.x).toBe(3000 - 10 * 100)
	})
	it('Shift keeps a viewport square while a corner is dragged', () => {
		const h = harness(), t = new SelectTool()
		h.drag(t, { x: 100, y: 100 }, { x: 100, y: 100 })   // select it
		const ev = (p: { x: number; y: number }) => ({ p, shift: true, ctrl: false, alt: false })
		t.down(ev({ x: 220, y: 170 }), h.ctx()); t.move(ev({ x: 260, y: 180 }), h.ctx()); t.up(ev({ x: 260, y: 180 }), h.ctx())
		expect(h.vpNow().rect).toEqual({ x: 20, y: 20, w: 240, h: 240 })
	})
	it('a locked viewport says so when picked', () => {
		const h = harness(), t = new SelectTool(), said: string[] = []
		h.ctx().store.transact('lock', (tx) => tx.put({ ...SHEET, viewports: [{ ...VP, locked: true }] }))
		t.down({ p: { x: 100, y: 100 }, shift: false, ctrl: false, alt: false }, { ...h.ctx(), say: (m) => said.push(m) })
		expect(said.at(-1)).toMatch(/locked/)
	})
})
