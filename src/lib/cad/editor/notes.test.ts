// Paper notes on a sheet (Phase 4.5): text, leader and revision cloud through their tools; picked and moved with
// Select; drawn on the sheet (and so in its PDF).
import { describe, it, expect } from 'vitest'
import { EntityStore } from '../store/store'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { SelectTool, type ToolCtx } from './tools'
import { NoteTool, untie } from './noteTool'
import { deleteEntities, deleteViewport } from './commands'
import { spaceOf } from '../views/space'
import { sheetDisplayList } from '../views/sheet'
import type { Sheet } from '../domain/drawing'
import type { Shape } from '../domain/shapes'

const SHEET: Sheet = { type: 'sheet', id: 'SH', number: 'S001', title: 'T', order: 1, paper: { size: 'A3', orientation: 'landscape', marginMm: 5 }, viewports: [], status: 'active' }

function harness() {
	const store = new EntityStore()
	store.load([...demoProject(), SHEET])
	let sel: string[] = [], answer = ''
	const ctx = (): ToolCtx => {
		const index = new ProjectIndex(store.all())
		return {
			store, index, levelId: 'L33', opts: { z: 0, w: 100, h: 50 }, space: spaceOf({ kind: 'sheet', sheetId: 'SH' }), work: { z: 0, depth: 0 },
			prims: () => sheetDisplayList(index, store.get('SH') as Sheet), tol: () => 1.5, snap: (p) => ({ p, kind: 'none' }) as never,
			selection: sel, select: (ids) => { sel = ids }, setMarquee: () => {}, ask: () => {}, askText: (_l, _v, apply) => apply(answer),
			selectViewport: () => {}, viewportId: () => null,
		}
	}
	const at = (x: number, y: number) => ({ p: { x, y }, shift: false, ctrl: false, alt: false })
	const notes = () => store.ofType('shape').filter((s) => s.sheetId === 'SH')
	return { store, ctx, at, notes, sel: () => sel, setAnswer: (t: string) => { answer = t } }
}

describe('paper notes', () => {
	it('Text: click, type → a sheet-owned text shape, drawn on the sheet', () => {
		const h = harness()
		h.setAnswer('Existing cabinet to be removed')
		{ const t = new NoteTool('text'); t.down(h.at(50.2, 60.3), h.ctx()); t.up(h.at(50.2, 60.3), h.ctx()) }
		const [t] = h.notes()
		expect(t.geom).toMatchObject({ kind: 'text', text: 'Existing cabinet to be removed', at: { x: 50, y: 60.5 }, sizeMm: 2.5 })
		expect(sheetDisplayList(new ProjectIndex(h.store.all()), h.store.get('SH') as Sheet).some((p) => p.k === 'text' && p.text === 'Existing cabinet to be removed')).toBe(true)
	})
	it('Leader: tip + points, Enter → asks its text; Backspace drops a point; a one-point leader is refused', () => {
		const h = harness(), tool = new NoteTool('leader')
		h.setAnswer('New patch frame')
		tool.down(h.at(100, 100), h.ctx()); tool.down(h.at(120, 80), h.ctx()); tool.down(h.at(150, 80), h.ctx())
		tool.key({ key: 'Backspace' } as KeyboardEvent, h.ctx())   // node: no KeyboardEvent
		tool.finish(h.ctx())
		expect(h.notes()[0].geom).toMatchObject({ kind: 'leader', pts: [{ x: 100, y: 100 }, { x: 120, y: 80 }], text: 'New patch frame' })
		tool.down(h.at(10, 10), h.ctx()); tool.finish(h.ctx())
		expect(h.notes()).toHaveLength(1)
	})
	it('Cloud: three or more points close into a cloud of bumps', () => {
		const h = harness(), tool = new NoteTool('cloud')
		for (const [x, y] of [[50, 50], [150, 50], [150, 120], [50, 120]]) tool.down(h.at(x, y), h.ctx())
		tool.finish(h.ctx())
		const [c] = h.notes()
		expect(c.geom.kind).toBe('cloud')
		const drawn = sheetDisplayList(new ProjectIndex(h.store.all()), h.store.get('SH') as Sheet).find((p) => p.src === c.id)
		expect(drawn && drawn.k === 'line' && drawn.pts.length).toBeGreaterThan(40)   // scallops, not 4 corners
	})
	it('a note drawn inside a viewport is tied to it: follows a rescale / pan, drags in view mm, untied in place on delete', () => {
		const h = harness()
		const vp = { id: 'V', view: { levelId: 'L33', spec: { kind: 'plan' as const } }, rect: { x: 50, y: 50, w: 200, h: 150 }, scale: 100, centre: { x: 1000, y: 2000 } }
		h.store.transact('vp', (tx) => tx.put({ ...SHEET, viewports: [vp] }))
		const tool = new NoteTool('cloud')
		for (const [x, y] of [[150, 125], [160, 125], [160, 135]]) tool.down(h.at(x, y), h.ctx())   // (150,125) = the window's middle
		tool.finish(h.ctx())
		const [c] = h.notes()
		expect(c.vpId).toBe('V')
		expect(c.geom).toMatchObject({ pts: [{ x: 1000, y: 2000 }, { x: 2000, y: 2000 }, { x: 2000, y: 3000 }] })   // view mm
		const paperOf = () => {
			const p = sheetDisplayList(new ProjectIndex(h.store.all()), h.store.get('SH') as Sheet).find((q) => q.src === c.id)
			return p?.k === 'line' ? p.pts[0] : null
		}
		expect(paperOf()).toEqual({ x: 150, y: 125 })
		// 1:50 and the view panned: the note stays on the same drawing point
		h.store.transact('rescale', (tx) => tx.put({ ...SHEET, viewports: [{ ...vp, scale: 50, centre: { x: 500, y: 2000 } }] }))
		expect(paperOf()).toEqual({ x: 160, y: 125 })
		// a 5 mm paper drag = 250 view mm at 1:50
		const sel = new SelectTool()
		sel.down(h.at(160, 125), h.ctx()); sel.move(h.at(165, 125), h.ctx()); sel.up(h.at(165, 125), h.ctx())
		expect(((h.store.get(c.id) as Shape).geom as { pts: { x: number }[] }).pts[0].x).toBe(1250)
		expect(paperOf()).toEqual({ x: 165, y: 125 })
		// untie: back on the paper where it showed
		const shown = untie(h.store.get(c.id) as Shape, (h.store.get('SH') as Sheet).viewports[0])
		expect(shown.vpId).toBeUndefined()
		expect((shown.geom as { pts: unknown[] }).pts[0]).toEqual({ x: 165, y: 125 })
	})
	it('deleting a viewport keeps the sheet and unties its notes; deleting the sheet takes its notes', () => {
		const h = harness()
		const vp = { id: 'V', view: { levelId: 'L33', spec: { kind: 'plan' as const } }, rect: { x: 50, y: 50, w: 200, h: 150 }, scale: 100, centre: { x: 1000, y: 2000 } }
		h.store.transact('vp', (tx) => tx.put({ ...SHEET, viewports: [vp] }))
		const tool = new NoteTool('cloud')
		for (const [x, y] of [[150, 125], [160, 125], [160, 135]]) tool.down(h.at(x, y), h.ctx())
		tool.finish(h.ctx())
		deleteViewport(h.store, h.store.get('SH') as Sheet, vp)
		expect((h.store.get('SH') as Sheet).viewports).toEqual([])
		const [c] = h.notes()
		expect(c.vpId).toBeUndefined()
		expect((c.geom as { pts: unknown[] }).pts[0]).toEqual({ x: 150, y: 125 })
		deleteEntities(h.store, ['SH'])
		expect(h.notes()).toEqual([])
		expect(h.store.ofType('outlet').length).toBeGreaterThan(0)   // nothing else went
	})
	it('a drag on the bare paper windows the notes inside it; a click there selects the sheet', () => {
		const h = harness()
		h.setAnswer('Note')
		{ const n = new NoteTool('text'); n.down(h.at(50, 60), h.ctx()); n.up(h.at(50, 60), h.ctx()) }
		const id = h.notes()[0].id, t = new SelectTool()
		t.down(h.at(30, 40), h.ctx()); t.move(h.at(120, 70), h.ctx()); t.up(h.at(120, 70), h.ctx())
		expect(h.sel()).toEqual([id])
		t.down(h.at(200, 150), h.ctx()); t.up(h.at(200, 150), h.ctx())
		expect(h.sel()).toEqual(['SH'])
	})
	it('a selected leader shows a grip per point; dragging one moves just that point (in view mm when tied)', () => {
		const h = harness()
		const vp = { id: 'V', view: { levelId: 'L33', spec: { kind: 'plan' as const } }, rect: { x: 50, y: 50, w: 200, h: 150 }, scale: 100, centre: { x: 1000, y: 2000 } }
		h.store.transact('vp', (tx) => tx.put({ ...SHEET, viewports: [vp] }))
		h.setAnswer('Tip')
		const tool = new NoteTool('leader')
		for (const [x, y] of [[150, 125], [170, 110]]) tool.down(h.at(x, y), h.ctx())
		tool.finish(h.ctx())
		const [l] = h.notes(), t = new SelectTool()
		expect(t.preview(h.ctx()).filter((p) => p.k !== 'image' && p.cls === 'grip')).toHaveLength(2)
		t.down(h.at(150, 125), h.ctx()); t.move(h.at(160, 130), h.ctx()); t.up(h.at(160, 130), h.ctx())
		const g = (h.store.get(l.id) as Shape).geom as { pts: { x: number; y: number }[] }
		expect(g.pts[0]).toEqual({ x: 2000, y: 2500 })   // paper (160, 130) in the 1:100 view
		expect(g.pts[1]).toEqual({ x: 3000, y: 500 })     // the other point stays: paper (170, 110)
	})
	it('Select picks a note on the paper and drags it', () => {
		const h = harness()
		h.setAnswer('Note')
		{ const n = new NoteTool('text'); n.down(h.at(50, 60), h.ctx()); n.up(h.at(50, 60), h.ctx()) }
		const id = h.notes()[0].id, t = new SelectTool()
		t.down(h.at(51, 59.5), h.ctx()); t.move(h.at(61, 69.5), h.ctx()); t.up(h.at(61, 69.5), h.ctx())
		expect(h.sel()).toEqual([id])
		expect((h.store.get(id) as Shape).geom).toMatchObject({ at: { x: 60, y: 70 } })
	})
})
