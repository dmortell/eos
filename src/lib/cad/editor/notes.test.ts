// Paper notes on a sheet (Phase 4.5): text, leader and revision cloud through their tools; picked and moved with
// Select; drawn on the sheet (and so in its PDF).
import { describe, it, expect } from 'vitest'
import { EntityStore } from '../store/store'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { type ToolCtx } from './tools'
import { SelectTool } from './selectTool'
import { NoteTool, untie, snapThroughViewport, pasteTextNote } from './noteTool'
import { deleteEntities, deleteViewport, sectionViewports, retargetSectionViewports, levelContents, levelViewportsOff, roomViewports, roomViewportsOff, unlinkFrom } from './commands'
import { spaceOf } from '../views/space'
import { sheetDisplayList } from '../views/sheet'
import type { Sheet } from '../domain/drawing'
import type { Shape } from '../domain/shapes'
import type { Entity } from '../domain/drawing'
import type { Level } from '../domain/types'

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

describe('text pasted from another app', () => {
	it('lands on the sheet at the point, as one undoable, selected text (markdown for a table)', () => {
		const h = harness()
		const id = pasteTextNote(h.ctx(), { x: 40, y: 30 }, { text: '| a | b |', markdown: true })!
		expect(h.store.get(id)).toMatchObject({ sheetId: 'SH', geom: { kind: 'text', text: '| a | b |', at: { x: 40, y: 30 }, sizeMm: 2.5, markdown: true } })
		expect(h.sel()).toEqual([id])
		h.store.undo()
		expect(h.store.get(id)).toBeUndefined()
		expect((h.store.get(pasteTextNote(h.ctx(), { x: 1, y: 1 }, { text: 'plain' })!) as Shape).geom).not.toHaveProperty('markdown')
	})
})

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
	it('Cloud: the rubber band while drawing is scalloped too — one edge open, then closed', () => {
		const h = harness(), tool = new NoteTool('cloud')
		tool.down(h.at(50, 50), h.ctx()); tool.hover(h.at(110, 50), h.ctx())
		const [one] = tool.preview(h.ctx())
		expect(one.k === 'line' && !one.closed && one.pts.length).toBe(10 * 8 + 1)   // 60 mm / 6 mm bumps × 8 points, then its end
		expect(one.k === 'line' && one.pts.some((p) => Math.abs(p.y - 50) > 1)).toBe(true)   // bumps off the straight line
		tool.down(h.at(110, 50), h.ctx()); tool.hover(h.at(110, 100), h.ctx())
		const [two] = tool.preview(h.ctx())
		expect(two.k === 'line' && two.closed && two.pts.length).toBeGreaterThan(40)
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

describe('deleting a section that sheets show (backlog: asks about its viewports)', () => {
	const cut = { type: 'section', id: 'X', levelId: 'L33', name: 'B', a: { x: 0, y: 0 }, b: { x: 5000, y: 0 }, depth: 3000 } as const
	const sheet: Sheet = { ...SHEET, viewports: [{ id: 'V', view: { levelId: 'L33', spec: { kind: 'section', sectionId: 'X' } }, rect: { x: 20, y: 20, w: 200, h: 150 }, scale: 50, centre: { x: 0, y: 0 } }] }
	const load = () => { const s = new EntityStore(); s.load([...demoProject(), cut, sheet]); return s }
	it('kept: the viewport becomes a plain elevation looking the same way (a → b along x looks up the sheet = Front), one undo step', () => {
		const store = load()
		expect(sectionViewports(store, ['X'])).toHaveLength(1)
		deleteEntities(store, ['X'], retargetSectionViewports(store, new ProjectIndex(store.all()), ['X'], true))
		expect(store.get('X')).toBeUndefined()
		const vp = (store.get('SH') as Sheet).viewports[0]
		expect(vp.view.spec).toEqual({ kind: 'elevation', dir: 'front' })
		expect(vp).toMatchObject({ scale: 50, rect: { x: 20, y: 20, w: 200, h: 150 } })
		expect(store.undoLabels).toEqual(['Delete'])
		store.undo()
		expect((store.get('SH') as Sheet).viewports[0].view.spec).toEqual({ kind: 'section', sectionId: 'X' })
	})
	it('not kept: the viewport comes off the sheet with the section', () => {
		const store = load()
		deleteEntities(store, ['X'], retargetSectionViewports(store, new ProjectIndex(store.all()), ['X'], false))
		expect((store.get('SH') as Sheet).viewports).toEqual([])
	})
})

describe('deleting a level (review R18)', () => {
	const cut = { type: 'section', id: 'X', levelId: 'L33', name: 'B', a: { x: 0, y: 0 }, b: { x: 5000, y: 0 }, depth: 3000 } as const
	const plan = { id: 'V', view: { levelId: 'L33', spec: { kind: 'plan' } }, rect: { x: 20, y: 20, w: 200, h: 150 }, scale: 100, centre: { x: 0, y: 0 } } as Sheet['viewports'][number]
	const other = { ...plan, id: 'W', view: { levelId: 'OTHER', spec: { kind: 'plan' } } } as Sheet['viewports'][number]
	const note = { type: 'shape', id: 'N', sheetId: 'SH', vpId: 'V', geom: { kind: 'text', at: { x: 100, y: 100 }, text: 'n', sizeMm: 2.5 } } as Shape
	it('takes its sections, and its viewports come off their sheets (tied notes back on the paper), in one undo step', () => {
		const store = new EntityStore()
		store.load([...demoProject(), cut, { ...SHEET, viewports: [plan, other] }, note])
		const on = levelContents(store.all(), 'L33')
		expect(on).toContain('X')
		deleteEntities(store, ['L33', ...on], levelViewportsOff(store, 'L33'))
		expect(store.get('X')).toBeUndefined()
		expect((store.get('SH') as Sheet).viewports.map((v) => v.id)).toEqual(['W'])
		expect((store.get('N') as Shape).vpId).toBeUndefined()
		expect(store.undoLabels.at(-1)).toMatch(/^Delete/)
		store.undo()
		expect((store.get('SH') as Sheet).viewports).toHaveLength(2)
	})
})

describe('deleting a server room (Review 2 Q17)', () => {
	const vp = (id: string, spec: Sheet['viewports'][number]['view']['spec']) => ({ id, view: { levelId: 'L33', spec }, rect: { x: 20, y: 20, w: 200, h: 150 }, scale: 50, centre: { x: 0, y: 0 } }) as Sheet['viewports'][number]
	const run = (id: string, serves: string[]) => ({ type: 'shape', id, levelId: 'L33', geom: { kind: 'path', nodes: [] }, role: { kind: 'containment', form: 'tray', tier: 'high', serves } }) as unknown as Shape
	it('its rack view, patch schedule and port sheets come off their sheets; runs stop serving it; one undo step', () => {
		const store = new EntityStore()
		const vps = [vp('ROW', { kind: 'row', spaceId: 'SR-A', face: 'front' }), vp('SCH', { kind: 'schedule', table: 'patch', spaceId: 'SR-A' }), vp('PRT', { kind: 'ports', rackId: 'R1' }),
			vp('ALL', { kind: 'schedule', table: 'patch' }), vp('PLAN', { kind: 'plan' })]
		store.load([...demoProject(), { ...SHEET, viewports: vps }, run('T1', ['SR-A']), run('T2', ['SR-A', 'SR-B'])])
		expect(roomViewports(store, 'SR-A').map((h) => h.vp.id)).toEqual(['ROW', 'SCH', 'PRT'])
		deleteEntities(store, ['SR-A', 'R1'], roomViewportsOff(store, 'SR-A'))
		expect((store.get('SH') as Sheet).viewports.map((v) => v.id)).toEqual(['ALL', 'PLAN'])
		const serves = (id: string) => ((store.get(id) as Shape).role as { serves?: string[] }).serves
		expect(serves('T1')).toBeUndefined()   // it served only that room: every room now
		expect(serves('T2')).toEqual(['SR-B'])
		store.undo()
		expect((store.get('SH') as Sheet).viewports).toHaveLength(5)
		expect(serves('T1')).toEqual(['SR-A'])
	})
})

describe('deleting lets go of what points at it (review R26)', () => {
	it('a link’s chosen run, a leader’s attachment and a port’s server room go; the rest stays', () => {
		const ents = [
			{ type: 'link', id: 'K', kind: 'horizontal', a: { on: 'P', port: 1 }, b: { on: 'O', port: 1 }, status: 'design', via: ['R1', 'R2'] },
			{ type: 'shape', id: 'LD', levelId: 'L', geom: { kind: 'leader', pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }], attach: 'O2' } },
			{ type: 'outlet', id: 'O', levelId: 'L', label: 'A', tier: 'low', usage: 'desk', mount: 'floor', ports: [{ port: 1, label: 'A.a', serverRoomId: 'SR' }] },
		] as unknown as Parameters<typeof unlinkFrom>[0]
		const out = unlinkFrom(ents, new Set(['R1', 'O2', 'SR']))
		const byId = new Map(out.map((e) => [e.id, e as unknown as Record<string, any>]))
		expect(byId.get('K')!.via).toEqual(['R2'])
		expect(byId.get('LD')!.geom.attach).toBeUndefined()
		expect(byId.get('O')!.ports[0].serverRoomId).toBeUndefined()
	})
})

describe('dimensions on a sheet snap to what a viewport shows (Q44)', () => {
	it('a paper point near an outlet in a plan viewport lands on the outlet (through the viewport); far from it, nothing', () => {
		const ix = new ProjectIndex(demoProject()), o = ix.outlets[0], vp = { id: 'V', view: { levelId: 'L33', spec: { kind: 'plan' as const } }, rect: { x: 20, y: 20, w: 300, h: 200 }, scale: 100, centre: { x: o.at!.x, y: o.at!.y } }
		const sheet: Sheet = { ...SHEET, viewports: [vp] }
		const onPaper = { x: 20 + 150, y: 20 + 100 }    // the outlet sits at the window's middle
		const near = snapThroughViewport(ix, sheet, { x: onPaper.x + 0.4, y: onPaper.y - 0.3 }, 1)
		expect(near?.x).toBeCloseTo(onPaper.x, 6)
		expect(near?.y).toBeCloseTo(onPaper.y, 6)
		expect(snapThroughViewport(ix, sheet, { x: onPaper.x + 30, y: onPaper.y + 30 }, 1)).toBeNull()
		expect(snapThroughViewport(ix, sheet, { x: 400, y: 280 }, 1)).toBeNull()   // outside every viewport
	})
})

describe('deleting a level: runs reaching it, what it holds (W35, W36)', () => {
	const run = { type: 'shape', id: 'RUN', levelId: 'L1', role: { kind: 'containment', form: 'trunk', tier: 'high' }, section: { w: 100, h: 50 },
		geom: { kind: 'path', nodes: [{ id: 'a', x: 0, y: 0, z: 2900 }, { id: 'b', x: 1000, y: 0, z: 2900 }, { id: 'c', x: 1000, y: 0, z: 2950, levelId: 'L2' }], segs: [{ id: 's1', a: 'a', b: 'b' }, { id: 's2', a: 'b', b: 'c' }] } } as unknown as Shape
	it('a run of another floor rising to it is not its content: it is cut back to its own floor', async () => {
		const { levelRisers, withoutLevelNodes } = await import('./commands')
		expect(levelContents([run], 'L2')).toEqual([])
		expect(levelRisers([run], 'L2').map((s) => s.id)).toEqual(['RUN'])
		const cut = withoutLevelNodes(run, 'L2')!
		expect(cut.geom.kind === 'path' && cut.geom.nodes.map((n) => n.id)).toEqual(['a', 'b'])
		expect(cut.geom.kind === 'path' && cut.geom.segs.map((g) => g.id)).toEqual(['s1'])
		// only a riser left: the run goes
		const short = { ...run, geom: { ...run.geom, nodes: [{ id: 'b', x: 0, y: 0, z: 2900 }, { id: 'c', x: 0, y: 0, z: 0, levelId: 'L2' }], segs: [{ id: 's2', a: 'b', b: 'c' }] } } as unknown as Shape
		expect(withoutLevelNodes(short, 'L2')).toBeNull()
	})
	it('says what goes, counted by kind', async () => {
		const { contentsText } = await import('./commands')
		const ents = [{ type: 'outlet', id: 'O1' }, { type: 'outlet', id: 'O2' }, run, { type: 'underlay', id: 'U' }] as unknown as Entity[]
		expect(contentsText(ents, ['O1', 'O2', 'RUN', 'U'])).toBe('2 outlets, 1 run, 1 floorplan')
	})
})

describe('a riser to a deleted floor ends on the nearest floor with a model (User 2026-10-15)', () => {
	const h = { slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2600, plenumMm: 700 }
	const lv = (id: string, e: number) => ({ type: 'level', id, buildingId: 'B', number: e / 3800 + 1, name: id, order: e, elevationMm: e, heights: h }) as Level
	const riser = { type: 'shape', id: 'R', levelId: 'L1', role: { kind: 'containment', form: 'trunk', tier: 'high' }, section: { w: 100, h: 50 },
		geom: { kind: 'path', nodes: [{ id: 'a', x: 0, y: 0, z: 2900 }, { id: 'b', x: 500, y: 0, z: 2900 }, { id: 'c', x: 500, y: 0, z: 2950, levelId: 'L4' }], segs: [{ id: 's1', a: 'a', b: 'b' }, { id: 's2', a: 'b', b: 'c' }] } } as unknown as Shape
	it('1F up to 4F, 4F deleted: it ends on 3F at its tray height (2F / 3F have models)', async () => {
		const { withoutLevelNodes } = await import('./commands')
		const cut = withoutLevelNodes(riser, 'L4', [lv('L1', 0), lv('L2', 3800), lv('L3', 7600), lv('L4', 11400)])!
		expect(cut.geom.kind === 'path' && cut.geom.nodes.find((n) => n.id === 'c')).toMatchObject({ levelId: 'L3', z: 2950 })
		// no floor with a model in between: cut back to its own floor
		const back = withoutLevelNodes(riser, 'L4', [lv('L1', 0), lv('L4', 11400)])!
		expect(back.geom.kind === 'path' && back.geom.nodes.map((n) => n.id)).toEqual(['a', 'b'])
	})
})
