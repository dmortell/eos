// Ctrl-drag copy, nudge and devices (backlog "Ctrl-drag copy, select all, nudge"), through the real Select tool.
import { describe, it, expect } from 'vitest'
import { EntityStore } from '../store/store'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { type ToolCtx } from './tools'
import { SelectTool } from './selectTool'
import { Nudge } from './nudge'
import { makeClip, pasteClip } from '../domain/clipboard'
import { spaceOf, PLAN, type ViewSpec } from '../views/space'
import { planDisplayList } from '../views/plan'
import { rackRowDisplayList, rackLayout, rowHit } from '../views/rackRow'
import { rackHeight, RU_MM } from '../domain/units'
import type { Entity } from '../domain/drawing'
import type { Device, Outlet, Rack } from '../domain/types'

const ROW: ViewSpec = { kind: 'row', spaceId: 'SR-A', face: 'front' }
const R2: Rack = { type: 'rack', id: 'R2', levelId: 'L33', spaceId: 'SR-A', order: 1, name: 'A02', kind: 'cabinet', heightU: 42, widthMm: 600, depthMm: 1000 }

function harness(spec: ViewSpec, extra: Entity[] = []) {
	const store = new EntityStore()
	store.load([...demoProject(), ...extra])
	let sel: string[] = []
	const said: string[] = []
	const ctx = (): ToolCtx => {
		const index = new ProjectIndex(store.all())
		const row = spec.kind === 'row' ? spec : null
		return {
			store, index, levelId: 'L33', opts: { z: 0, w: 100, h: 50 }, space: spaceOf(spec), work: { z: 0, depth: 0 },
			prims: () => (row ? rackRowDisplayList(index, row) : planDisplayList(index, 'L33', { scale: 100 })), tol: () => 5,
			snap: (p) => ({ p, kind: 'none' }) as never,
			selection: sel, select: (ids) => { sel = ids }, setMarquee: () => {}, ask: () => {}, say: (m) => said.push(m),
			...(row ? { rowHit: (p: { x: number; y: number }) => rowHit(index, row, p), portSel: () => null, selectPorts: () => {} } : {}),
		}
	}
	return { store, ctx, sel: () => sel, setSel: (ids: string[]) => { sel = ids }, said }
}
const at = (x: number, y: number, o: Partial<{ ctrl: boolean; shift: boolean }> = {}) => ({ p: { x, y }, shift: false, ctrl: false, alt: false, ...o })
/** A point on a device's body in the front row (its middle; the test devices have no ports). */
function uPoint(store: EntityStore, rackId: string, u: number) {
	const ix = new ProjectIndex(store.all())
	const l = rackLayout(ix, { spaceId: 'SR-A', face: 'front' }).find((x) => x.rack.id === rackId)!
	const base = (rackHeight(l.rack) - l.rack.heightU * RU_MM) / 2
	return { x: l.x0 + l.rack.widthMm / 2, y: -(base + (u - 0.5) * RU_MM) }
}

describe('Ctrl-drag copy (plan)', () => {
	it('copies what is pressed, moved by the drag; the original stays; the copy is selected; one undo removes it', () => {
		const h = harness(PLAN), t = new SelectTool()
		t.down(at(1000, 4000, { ctrl: true }), h.ctx())
		t.move(at(1500, 4000, { ctrl: true }), h.ctx())
		t.up(at(1500, 4000, { ctrl: true }), h.ctx())
		const outlets = h.store.ofType('outlet')
		expect(outlets).toHaveLength(3)
		expect(h.store.get('O1')).toMatchObject({ at: { x: 1000, y: 4000 } })
		const copy = outlets.find((o) => !['O1', 'O2'].includes(o.id))!
		expect(copy).toMatchObject({ label: '33-001', at: { x: 1500, y: 4000 } })
		expect(h.sel()).toEqual([copy.id])
		const undone = h.store.undo()
		expect(h.store.ofType('outlet')).toHaveLength(2)
		expect(undone?.sel).toEqual([])   // the selection before the press (nothing), for the app to give back
	})
	it('undoing a copy gives back the selection from before it', () => {
		const h = harness(PLAN), t = new SelectTool()
		h.setSel(['O1', 'O2'])
		t.down(at(1000, 4000, { ctrl: true }), h.ctx())
		t.move(at(1500, 4000, { ctrl: true }), h.ctx())
		t.up(at(1500, 4000, { ctrl: true }), h.ctx())
		expect(h.store.undo()?.sel).toEqual(['O1', 'O2'])
	})
	it('letting go of Ctrl mid-drag moves instead (no copy)', () => {
		const h = harness(PLAN), t = new SelectTool()
		t.down(at(1000, 4000, { ctrl: true }), h.ctx())
		t.move(at(1500, 4000, { ctrl: true }), h.ctx())
		t.move(at(1600, 4000), h.ctx())
		t.up(at(1600, 4000), h.ctx())
		expect(h.store.ofType('outlet')).toHaveLength(2)
		expect(h.store.get('O1')).toMatchObject({ at: { x: 1600, y: 4000 } })
	})
	it('a Ctrl CLICK still toggles it in the selection', () => {
		const h = harness(PLAN), t = new SelectTool()
		h.setSel(['O2'])
		t.down(at(1000, 4000, { ctrl: true }), h.ctx())
		t.up(at(1000, 4000, { ctrl: true }), h.ctx())
		expect(h.sel()).toEqual(['O2', 'O1'])
	})
	it('a Shift CLICK adds too, as Ctrl does (W32 / B49: it replaced the selection); a plain click replaces', () => {
		const h = harness(PLAN), t = new SelectTool()
		h.setSel(['O2'])
		t.down(at(1000, 4000, { shift: true }), h.ctx())
		t.up(at(1000, 4000, { shift: true }), h.ctx())
		expect(h.sel()).toEqual(['O2', 'O1'])
		h.setSel(['O2'])
		t.down(at(1000, 4000), h.ctx()); t.up(at(1000, 4000), h.ctx())
		expect(h.sel()).toEqual(['O1'])
	})
})

describe('click-cycle', () => {
	it('clicking the same spot again selects the next thing stacked under it, then round again', () => {
		const shape = (id: string) => ({ type: 'shape', id, levelId: 'L33', geom: { kind: 'circle', centre: { x: 1000, y: 4000 }, r: 300 } }) as Entity
		const h = harness(PLAN, [shape('S1')]), t = new SelectTool()
		const click = () => { t.down(at(1000, 4000), h.ctx()); t.up(at(1000, 4000), h.ctx()) }
		click()
		const first = h.sel()[0]
		click()
		expect(h.sel()).toHaveLength(1)
		expect(h.sel()[0]).not.toBe(first)
		click()
		expect(h.sel()[0]).toBe(first)
	})
})

describe('devices', () => {
	const dev = (id: string, u: number, rackId = 'R1'): Device => ({ type: 'device', id, rackId, name: id, kind: 'other', u, heightU: 1, face: 'front', portCount: 0 })
	it('several devices dragged onto another rack all go into it, keeping their spacing', () => {
		const h = harness(ROW, [R2, dev('X', 10), dev('Y', 12)]), t = new SelectTool()
		h.setSel(['X', 'Y'])
		const from = uPoint(h.store, 'R1', 10), to = uPoint(h.store, 'R2', 20)
		t.down({ ...at(from.x, from.y) }, h.ctx())
		t.move({ ...at(to.x, to.y) }, h.ctx())
		t.up({ ...at(to.x, to.y) }, h.ctx())
		expect(h.store.get('X')).toMatchObject({ rackId: 'R2', u: 20 })
		expect(h.store.get('Y')).toMatchObject({ rackId: 'R2', u: 22 })
	})
	it('Ctrl-drag copies devices (the originals stay); an overlap is refused', () => {
		const h = harness(ROW, [R2, dev('X', 10)]), t = new SelectTool()
		const from = uPoint(h.store, 'R1', 10), to = uPoint(h.store, 'R2', 5)
		t.down(at(from.x, from.y, { ctrl: true }), h.ctx())
		t.move(at(to.x, to.y, { ctrl: true }), h.ctx())
		t.up(at(to.x, to.y, { ctrl: true }), h.ctx())
		expect(h.store.get('X')).toMatchObject({ rackId: 'R1', u: 10 })
		const copy = h.store.ofType('device').find((d) => d.rackId === 'R2')!
		expect(copy).toMatchObject({ name: 'X', u: 5 })
		expect(h.sel()).toEqual([copy.id])
	})
	it('copied devices paste into a rack at their own U; refused when they would overlap', () => {
		const ix = new ProjectIndex([...demoProject(), R2, dev('X', 10)])
		const clip = makeClip(ix, ['X'], 'P')!
		expect(clip.from.kind).toBe('rack')
		const r = pasteClip(clip, { pid: 'P', ix, to: { kind: 'rack', id: 'R2' } })
		expect(r.put).toHaveLength(1)
		expect(r.put[0]).toMatchObject({ rackId: 'R2', u: 10, name: 'X' })
		expect(pasteClip(clip, { pid: 'P', ix, to: { kind: 'rack', id: 'R1' } }).problem).toMatch(/overlap/)
		expect(pasteClip(clip, { pid: 'P', ix, to: { kind: 'level', id: 'L33' } }).put).toHaveLength(0)   // no rack on a plan
	})
})

describe('nudge', () => {
	it('a burst of presses is one undo step; Shift-sized steps come in from the caller', () => {
		const h = harness(PLAN), n = new Nudge()
		n.press(h.store, ['O1'], { x: 1, y: 0 }, spaceOf(PLAN))
		n.press(h.store, ['O1'], { x: 10, y: 0 }, spaceOf(PLAN))
		n.press(h.store, ['O1'], { x: 0, y: -1 }, spaceOf(PLAN))
		n.end()
		expect((h.store.get('O1') as Outlet).at).toEqual({ x: 1011, y: 3999 })
		h.store.undo()
		expect((h.store.get('O1') as Outlet).at).toEqual({ x: 1000, y: 4000 })
	})
	it('in a rack row, up moves a device 1 U; off the top is refused', () => {
		const h = harness(ROW), n = new Nudge()
		n.press(h.store, ['P1'], { x: 0, y: -1 }, spaceOf(ROW))
		n.end()
		expect((h.store.get('P1') as Device).u).toBe(41)
		expect(n.press(h.store, ['P1'], { x: 0, y: -5 }, spaceOf(ROW))).toMatch(/does not fit/)
		n.end()
	})
})
