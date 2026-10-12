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
// imported up front: an import inside a test counts against its 5 s timeout and failed once under load (review follow-up)
import { PathTool } from './pathTool'
import { InsertTool } from './insertTool'
import { BUILTIN_BLOCKS } from '../domain/blocks'
import { makeViewportClip, pasteClip } from '../domain/clipboard'
import { deleteViewports } from './commands'
import type { Shape } from '../domain/shapes'

const VP: Viewport = { id: 'V', view: { levelId: 'L33', spec: { kind: 'plan' } }, rect: { x: 20, y: 20, w: 200, h: 150 }, scale: 100, centre: { x: 3000, y: 4000 } }
const SHEET: Sheet = { type: 'sheet', id: 'SH', number: 'S001', title: 'T', order: 1, paper: { size: 'A3', orientation: 'landscape', marginMm: 5 }, viewports: [VP], status: 'active' }

function harness() {
	const store = new EntityStore()
	store.load([...demoProject(), SHEET])
	let sel: string[] = [], vps: string[] = []
	const vp = (): string | null => vps[0] ?? null
	const ctx = (): ToolCtx => {
		const index = new ProjectIndex(store.all())
		return {
			store, index, levelId: 'L33', opts: { z: 0, w: 100, h: 50 }, space: spaceOf({ kind: 'sheet', sheetId: 'SH' }), work: { z: 0, depth: 0 },
			prims: () => sheetDisplayList(index, store.get('SH') as Sheet), tol: () => 2, snap: (p) => ({ p, kind: 'none' }) as never,
			selection: sel, select: (ids) => { sel = ids }, setMarquee: () => {}, ask: () => {},
			selectViewport: (id, toggle) => { vps = !id ? [] : toggle ? (vps.includes(id) ? vps.filter((x) => x !== id) : [...vps, id]) : [id] }, selectViewports: (ids) => { vps = ids }, viewportId: vp, viewportIds: () => vps,
		}
	}
	const drag = (t: SelectTool, a: { x: number; y: number }, b: { x: number; y: number }, alt = false, ctrl = false) => {   // ctrl-click picks more
		const ev = (p: { x: number; y: number }) => ({ p, shift: false, ctrl, alt })
		t.down(ev(a), ctx()); t.move(ev(b), ctx()); t.up(ev(b), ctx())
	}
	const vpNow = () => (store.get('SH') as Sheet).viewports[0]
	return { ctx, drag, vpNow, vp, vps: () => vps, sel: () => sel }
}

describe('viewports on a sheet', () => {
	it('a click on its FRAME picks the viewport and a drag there moves it; a click in its middle does not (Dave: dragged by mistake)', () => {
		const h = harness(), t = new SelectTool()
		h.drag(t, { x: 100, y: 100 }, { x: 130, y: 110 })   // the middle: the paper, nothing moves
		expect(h.vp()).toBeNull()
		expect(h.vpNow().rect).toMatchObject({ x: 20, y: 20 })
		h.drag(t, { x: 100, y: 20 }, { x: 130, y: 30 })     // the top edge
		expect(h.vp()).toBe('V')
		expect(h.vpNow().rect).toMatchObject({ x: 50, y: 30, w: 200, h: 150 })
	})
	it('a corner grip resizes it, the view staying where it is on the paper', () => {
		const h = harness(), t = new SelectTool()
		h.drag(t, { x: 100, y: 20 }, { x: 100, y: 20 })                   // select it (its frame)
		h.drag(t, { x: 220, y: 170 }, { x: 260, y: 190 })                 // bottom-right corner +40, +20
		expect(h.vpNow().rect).toEqual({ x: 20, y: 20, w: 240, h: 170 })
		expect(h.vpNow().centre).toEqual({ x: 3000 + 20 * 100, y: 4000 + 10 * 100 })
	})
	it('Alt-drag inside pans the view (the centre), not the window (T126); Ctrl-drag no longer pans', () => {
		const h = harness(), t = new SelectTool()
		h.drag(t, { x: 100, y: 20 }, { x: 100, y: 20 })   // select it (its frame)
		h.drag(t, { x: 100, y: 100 }, { x: 110, y: 100 }, true)
		expect(h.vpNow().rect.x).toBe(20)
		expect(h.vpNow().centre.x).toBe(3000 - 10 * 100)
		h.drag(t, { x: 100, y: 100 }, { x: 120, y: 100 }, false, true)
		expect(h.vpNow().centre.x).toBe(3000 - 10 * 100)
	})
	it('Shift keeps a viewport square while a corner is dragged', () => {
		const h = harness(), t = new SelectTool()
		h.drag(t, { x: 100, y: 20 }, { x: 100, y: 20 })   // select it (its frame)
		const ev = (p: { x: number; y: number }) => ({ p, shift: true, ctrl: false, alt: false })
		t.down(ev({ x: 220, y: 170 }), h.ctx()); t.move(ev({ x: 260, y: 180 }), h.ctx()); t.up(ev({ x: 260, y: 180 }), h.ctx())
		expect(h.vpNow().rect).toEqual({ x: 20, y: 20, w: 240, h: 240 })
	})
	it('a locked viewport says so when picked', () => {
		const h = harness(), t = new SelectTool(), said: string[] = []
		h.ctx().store.transact('lock', (tx) => tx.put({ ...SHEET, viewports: [{ ...VP, locked: true }] }))
		t.down({ p: { x: 100, y: 20 }, shift: false, ctrl: false, alt: false }, { ...h.ctx(), say: (m) => said.push(m) })
		expect(said.at(-1)).toMatch(/locked/)
	})
})

describe('lines and blocks on a sheet belong to the viewport they start in (backlog)', () => {
	it('a line started inside a viewport is tied to it in its view mm; on the paper it stays paper', () => {
		const h = harness(), t = new PathTool('line'), ev = (x: number, y: number) => ({ p: { x, y }, shift: false, ctrl: false, alt: true })
		t.down(ev(100, 100), h.ctx()); t.down(ev(110, 100), h.ctx()); t.finish(h.ctx())
		const line = h.ctx().store.ofType('shape').find((s) => s.geom.kind === 'path' && s.sheetId === 'SH')!
		expect(line.vpId).toBe('V')
		// paper (100, 100) in a 1:100 window at (20, 20) 200 × 150 (middle (120, 95)) centred on (3000, 4000): view = centre + (paper − middle) × 100
		const nodes = line.geom.kind === 'path' ? line.geom.nodes : []
		expect(nodes.map((n) => [n.x, n.y])).toEqual([[1000, 4500], [2000, 4500]])
		// …and is drawn on the paper where it was drawn
		const drawn = h.ctx().prims().find((p) => p.k === 'line' && p.src === line.id)
		expect(drawn?.k === 'line' && drawn.pts.map((q) => [Math.round(q.x), Math.round(q.y)])).toEqual([[100, 100], [110, 100]])
		const t2 = new PathTool('line')
		t2.down(ev(300, 250), h.ctx()); t2.down(ev(320, 250), h.ctx()); t2.finish(h.ctx())
		const paper = h.ctx().store.ofType('shape').find((s) => s.geom.kind === 'path' && s.sheetId === 'SH' && !s.vpId)!
		expect(paper.geom.kind === 'path' && paper.geom.nodes.map((n) => n.x)).toEqual([300, 320])
	})
	it('a block dropped inside a viewport is tied to it', () => {
		const h = harness(), t = new InsertTool(() => BUILTIN_BLOCKS[0])
		t.down({ p: { x: 100, y: 100 }, shift: false, ctrl: false, alt: false }, h.ctx())
		const ins = h.ctx().store.ofType('shape').find((s) => s.geom.kind === 'insert')!
		expect(ins).toMatchObject({ sheetId: 'SH', vpId: 'V', geom: { at: { x: 1000, y: 4500 } } })
	})
})

describe('several viewports', () => {
	const VP2: Viewport = { ...VP, id: 'W', rect: { x: 20, y: 200, w: 100, h: 60 }, label: 'Second' }
	const NOTE = { type: 'shape', id: 'N1', sheetId: 'SH', vpId: 'W', geom: { kind: 'text', at: { x: 3000, y: 4000 }, text: 'tied' } } as unknown as Shape
	function two() {
		const h = harness(), t = new SelectTool()
		h.ctx().store.transact('two', (tx) => { tx.put({ ...SHEET, viewports: [VP, VP2] }); tx.put(NOTE) })
		return { h, t, sheet: () => h.ctx().store.get('SH') as Sheet }
	}
	const ev = (p: { x: number; y: number }, ctrl = false) => ({ p, shift: false, ctrl, alt: false })
	it('Ctrl-click adds a viewport to the pick; a drag then moves them all', () => {
		const { h, t, sheet } = two()
		h.drag(t, { x: 100, y: 20 }, { x: 100, y: 20 })
		h.drag(t, { x: 60, y: 200 }, { x: 60, y: 200 }, false, true)
		expect(h.vps()).toEqual(['V', 'W'])
		h.drag(t, { x: 100, y: 20 }, { x: 110, y: 20 })
		expect(sheet().viewports.map((v) => v.rect.x)).toEqual([30, 30])
	})
	it('Ctrl-click on a picked viewport drops it from the pick', () => {
		const { h, t } = two()
		h.drag(t, { x: 100, y: 20 }, { x: 100, y: 20 })
		h.drag(t, { x: 60, y: 200 }, { x: 60, y: 200 }, false, true)
		h.drag(t, { x: 60, y: 200 }, { x: 60, y: 200 }, false, true)
		expect(h.vps()).toEqual(['V'])
	})
	it('a window on the empty paper picks the viewports it encloses', () => {
		const { h, t } = two()
		t.down(ev({ x: 5, y: 190 }), h.ctx()); t.move(ev({ x: 150, y: 280 }), h.ctx()); t.up(ev({ x: 150, y: 280 }), h.ctx())
		expect(h.sel()).toEqual(['SH'])
		expect(h.vps()).toEqual(['W'])
	})
	it('Ctrl-drag leaves the originals and moves copies, with their tied notes; the copies are picked', () => {
		const { h, t, sheet } = two()
		h.drag(t, { x: 60, y: 200 }, { x: 60, y: 200 })
		h.drag(t, { x: 60, y: 200 }, { x: 60, y: 240 }, false, true)
		const vs = sheet().viewports
		expect(vs).toHaveLength(3)
		expect(vs[1].rect.y).toBe(200)
		const copy = vs[2]
		expect(copy.rect.y).toBe(240)
		expect(copy.label).toBe('Second')
		expect(h.vps()).toEqual([copy.id])
		const notes = (h.ctx().store.ofType('shape') as Shape[]).filter((n) => n.vpId === copy.id)
		expect(notes).toHaveLength(1)
	})
	it('a clip of viewports pastes them with their notes onto another sheet, the level kept; Cut takes the notes too', () => {
		const { h, sheet } = two()
		const ix = h.ctx().index
		const clip = makeViewportClip(ix, 'SH', ['W'], 'p')!
		expect(clip.viewports).toHaveLength(1)
		expect(clip.items.map((i) => i.id)).toEqual(['N1'])
		const other: Sheet = { ...SHEET, id: 'S2', number: 'S002', viewports: [] }
		h.ctx().store.transact('s2', (tx) => tx.put(other))
		const r = pasteClip(JSON.parse(JSON.stringify(clip)), { pid: 'q', ix: h.ctx().index, to: { kind: 'sheet', id: 'S2' } })
		expect(r.viewports).toHaveLength(1)
		const sh = r.put.find((e) => e.type === 'sheet') as Sheet
		expect(sh.viewports[0]).toMatchObject({ view: { levelId: 'L33' }, rect: { x: 20, y: 200 }, label: 'Second' })
		expect(sh.viewports[0].id).not.toBe('W')
		const note = r.put.find((e) => e.type === 'shape') as Shape
		expect(note).toMatchObject({ sheetId: 'S2', vpId: sh.viewports[0].id })
		// the same sheet: a little to one side
		const same = pasteClip(clip, { pid: 'p', ix: h.ctx().index, to: { kind: 'sheet', id: 'SH' } })
		expect((same.put.find((e) => e.type === 'sheet') as Sheet).viewports.at(-1)!.rect).toMatchObject({ x: 30, y: 210 })
		deleteViewports(h.ctx().store, sheet(), [sheet().viewports[1]], true)
		expect(sheet().viewports).toHaveLength(1)
		expect(h.ctx().store.get('N1')).toBeUndefined()
	})
})
