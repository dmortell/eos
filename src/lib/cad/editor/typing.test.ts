// Typed input, node editing and risers, through the real tools (plan view).
import { describe, it, expect } from 'vitest'
import { EntityStore } from '../store/store'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { snapAt } from './snap'
import { PathTool } from './pathTool'
import { type ToolCtx, type DrawOpts } from './tools'
import { SelectTool } from './selectTool'
import { OutletTool } from './outletTool'
import { parseTyped } from './input'
import { spaceOf, PLAN } from '../views/space'
import { planDisplayList } from '../views/plan'
import type { Entity } from '../domain/drawing'
import type { Shape } from '../domain/shapes'
import type { Outlet } from '../domain/types'

function harness(extra: Entity[] = []) {
	const store = new EntityStore()
	store.load([...demoProject(), ...extra])
	let sel: string[] = []
	const opts: DrawOpts = { z: 2900, w: 100, h: 50 }
	let asked: ((v: number) => void) | null = null
	const ctx = (): ToolCtx => {
		const index = new ProjectIndex(store.all())
		return {
			store, index, levelId: 'L33', opts, space: spaceOf(PLAN), work: { get z() { return opts.z }, depth: 0 },
			prims: () => planDisplayList(index, 'L33', { scale: 100 }), tol: () => 10,
			snap: (p, alt, skip) => snapAt(index, 'L33', p, 15, { skip, noGrid: alt }),
			selection: sel, select: (ids) => { sel = ids }, setMarquee: () => {}, ask: (_l, _v, apply) => { asked = apply },
		}
	}
	return { store, ctx, sel: () => sel, answer: (v: number) => asked?.(v) }
}
const at = (x: number, y: number, extra: Partial<{ ctrl: boolean; count: number }> = {}) => ({ p: { x, y }, shift: false, ctrl: false, alt: false, ...extra })
const typeIn = (tool: PathTool | OutletTool, text: string, c: ToolCtx) => {
	const r = parseTyped(text, tool.lastPoint(c), null)
	if (r.kind === 'point') tool.typed(r.p, c)
}

describe('typed points while drawing', () => {
	it('a trunk typed as 0,6000 then @3000,0 then @0,-2000 (the stored coordinates)', () => {
		const h = harness()
		const t = new PathTool('trunk')
		for (const s of ['0,6000', '@3000,0', '@0,-2000']) typeIn(t, s, h.ctx())
		t.finish(h.ctx())
		const s = h.store.get(h.sel()[0]) as Shape
		expect(s.geom.kind === 'path' && s.geom.nodes.map((n) => [n.x, n.y])).toEqual([[0, 6000], [3000, 6000], [3000, 4000]])
	})
	it('outlets typed @1200,0 from the last one are spaced exactly 1.2 m', () => {
		const h = harness()
		const t = new OutletTool()
		t.down(at(1000, 8000), h.ctx())
		typeIn(t, '@1200,0', h.ctx())
		const placed = h.store.all().filter((e): e is Outlet => e.type === 'outlet' && e.at?.y === 8000).map((o) => o.at!.x)
		expect(placed.sort((a, b) => a - b)).toEqual([1000, 2200])
	})
})

describe('editing nodes', () => {
	it('double-click on a selected run inserts a node there', () => {
		const h = harness()
		const sel = new SelectTool()
		h.ctx().select(['T1'])
		sel.down(at(3000, 3000, { count: 2 }), h.ctx())
		const s = h.store.get('T1') as Shape
		expect(s.geom.kind === 'path' && s.geom.nodes.some((n) => n.x === 3000 && n.y === 3000 && n.z === 2900)).toBe(true)
		expect(h.store.undoLabels.at(-1)).toBe('Insert node')
	})
	it('Ctrl-drag on a grip branches a new segment from that node', () => {
		const h = harness()
		const sel = new SelectTool()
		h.ctx().select(['T1'])
		sel.down(at(0, 3000, { ctrl: true }), h.ctx())
		sel.move(at(0, 5000), h.ctx()); sel.up(at(0, 5000), h.ctx())
		const s = h.store.get('T1') as Shape
		expect(s.geom.kind === 'path' && s.geom.segs.length).toBe(3)
		expect(s.geom.kind === 'path' && s.geom.nodes.some((n) => n.x === 0 && n.y === 5000 && n.z === 2900)).toBe(true)
		expect(h.store.undoLabels.at(-1)).toBe('Branch')
	})
})

describe('a riser to another level', () => {
	const L34: Entity = { type: 'level', id: 'L34', buildingId: 'B', number: 34, name: '34F', order: 34, elevationMm: 136000, heights: { slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2700, plenumMm: 800 } }
	it('V → 34 adds a vertical segment to 34F’s tray height (W27: 2700 + 800 / 2) and ends the run; both plans show it', () => {
		const h = harness([L34])
		const t = new PathTool('trunk')
		t.down(at(9000, 9000), h.ctx())
		t.key({ key: 'v' } as KeyboardEvent, h.ctx()); h.answer(34)
		const s = h.store.get(h.sel()[0]) as Shape
		expect(s.geom.kind === 'path' && s.geom.nodes.map((n) => [n.z, n.levelId ?? 'L33'])).toEqual([[2900, 'L33'], [3100, 'L34']])
		const ix = new ProjectIndex(h.store.all())
		const label = (lv: string) => planDisplayList(ix, lv, { scale: 100 }).find((p) => p.src === s.id && p.k === 'text')
		expect(label('L33')).toMatchObject({ text: 'Riser 33F ↕ 34F' })
		expect(label('L34')).toMatchObject({ text: 'Riser 33F ↕ 34F' })
	})
})
