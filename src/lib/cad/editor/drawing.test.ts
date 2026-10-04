// Drawing runs and editing nodes, as behaviour (ADR 0006 / 0007).
import { describe, it, expect } from 'vitest'
import { EntityStore } from '../store/store'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { snapAt, gridSnap } from './snap'
import { pathGrips, moveNodes } from './grips'
import { followAttached } from './behaviours'
import { PathTool } from './pathTool'
import { SelectTool, type ToolCtx, type DrawOpts } from './tools'
import { toLine, toContainment } from '../domain/make'
import type { Shape } from '../domain/shapes'
import { spaceOf, PLAN } from '../views/space'

function harness() {
	const store = new EntityStore()
	store.load(demoProject())
	let sel: string[] = []
	const opts: DrawOpts = { z: 2900, w: 100, h: 50 }
	let asked: ((v: number) => void) | null = null
	const ctx = (): ToolCtx => {
		const index = new ProjectIndex(store.all())
		return {
			store, index, levelId: 'L33', opts, prims: () => [], tol: () => 10,
			space: spaceOf(PLAN), work: { get z() { return opts.z }, depth: 0 },
			snap: (p, alt, skip) => snapAt(index, 'L33', p, 15, { skip, noGrid: alt }),
			selection: sel, select: (ids) => { sel = ids }, setMarquee: () => {}, ask: (_l, _v, apply) => { asked = apply },
		}
	}
	return { store, ctx, opts, sel: () => sel, answer: (v: number) => asked?.(v) }
}
const at = (x: number, y: number) => ({ p: { x, y }, shift: false, ctrl: false, alt: false })
const key = (k: string) => ({ key: k }) as KeyboardEvent   // tools read only `key` (no DOM in Node)

describe('snapping', () => {
	it('snaps to an outlet (and says to attach), else to the grid', () => {
		const ix = new ProjectIndex(demoProject())
		expect(snapAt(ix, 'L33', { x: 1004, y: 3996 }, 15)).toMatchObject({ kind: 'outlet', attach: 'O1', p: { x: 1000, y: 4000 } })
		expect(snapAt(ix, 'L33', { x: 5004, y: 7996 }, 15)).toEqual({ p: { x: 5000, y: 8000 }, kind: 'grid' })
		expect(gridSnap({ x: 14, y: 16 })).toEqual({ x: 10, y: 20 })
	})
})

describe('drawing a trunk with the path tool', () => {
	it('click, click, R → 300, Enter: a run with a drop, at work Z, as ONE undo step', () => {
		const h = harness()
		const tool = new PathTool('trunk')
		tool.down(at(0, 6000), h.ctx())
		tool.down(at(4000, 6000), h.ctx())
		tool.key(key('r'), h.ctx()); h.answer(300)
		tool.key(key('Enter'), h.ctx())
		const s = h.store.get(h.sel()[0]) as Shape
		expect(s.role).toMatchObject({ kind: 'containment', form: 'trunk', tier: 'high' })
		expect(s.section).toEqual({ w: 100, h: 50 })
		expect(s.geom.kind === 'path' && s.geom.nodes.map((n) => [n.x, n.z])).toEqual([[0, 2900], [4000, 2900], [4000, 300]])
		expect(h.opts.z).toBe(300)                     // the work Z follows the rise / drop
		h.store.undo()
		expect(h.store.get(s.id)).toBeUndefined()
	})
	it('ending a run on an outlet attaches the node; moving the outlet carries the node with it', () => {
		const h = harness()
		const tool = new PathTool('trunk')
		tool.down(at(0, 4000), h.ctx())
		tool.down(at(998, 4003), h.ctx())             // within snap reach of outlet O1 at (1000, 4000)
		tool.finish(h.ctx())
		const run = h.store.get(h.sel()[0]) as Shape
		expect(run.geom.kind === 'path' && run.geom.nodes[1]).toMatchObject({ x: 1000, y: 4000, attach: 'O1' })
		const moved = followAttached([run], new Set(['O1']), { x: 500, y: 0 })[0]
		expect(moved.geom.kind === 'path' && moved.geom.nodes.map((n) => n.x)).toEqual([0, 1500])
	})
	it('a wall is a path with the wall role, its thickness and height from the options', () => {
		const h = harness()
		h.opts.w = 150; h.opts.h = 2700; h.opts.z = 0
		const tool = new PathTool('wall')
		tool.down(at(0, 0), h.ctx()); tool.down(at(5000, 0), h.ctx()); tool.finish(h.ctx())
		const s = h.store.get(h.sel()[0]) as Shape
		expect([s.role?.kind, s.section?.w, s.section?.h]).toEqual(['wall', 150, 2700])
	})
	it('fewer than two points draws nothing', () => {
		const h = harness()
		const tool = new PathTool('line')
		tool.down(at(0, 0), h.ctx()); tool.finish(h.ctx())
		expect(h.store.canUndo).toBe(false)
	})
})

describe('grips', () => {
	it('a vertical stack is one grip, and dragging it moves the whole stack (the drop stays plumb)', () => {
		const t1 = demoProject().find((e) => e.id === 'T1') as Shape
		const grips = pathGrips(t1)
		expect(grips.map((g) => g.nodeIds.length)).toEqual([1, 2])
		const moved = moveNodes(t1, grips[1].nodeIds, { x: 6500, y: 3200 })
		expect(moved.geom.kind === 'path' && moved.geom.nodes.slice(1).map((n) => [n.x, n.y, n.z])).toEqual([[6500, 3200, 2900], [6500, 3200, 300]])
	})
	it('the select tool drags a grip of the selected run as one undo step', () => {
		const h = harness()
		const sel = new SelectTool()
		const c = h.ctx()
		c.select(['T1'])
		const c2 = h.ctx()
		sel.down(at(0, 3000), c2)                       // T1's first node
		sel.move(at(0, 2500), c2); sel.move(at(0, 2000), c2)
		sel.up(at(0, 2000), c2)
		const s = h.store.get('T1') as Shape
		expect(s.geom.kind === 'path' && s.geom.nodes[0]).toMatchObject({ x: 0, y: 2000 })
		expect(h.store.undoLabels).toEqual(['Move node'])
	})
})

describe('placing a rack', () => {
	it('puts the chosen rack where you click (its centre), selects it, and hands back to Select', async () => {
		const { RackTool } = await import('./rackTool')
		const h = harness()
		let done = false
		const tool = new RackTool(() => { done = true })
		tool.target = 'R1'
		tool.down(at(8004, 1996), h.ctx())
		expect((h.store.get('R1') as { at?: unknown }).at).toEqual({ x: 8000, y: 2000 })
		expect([h.sel(), done, tool.target]).toEqual([['R1'], true, null])
		h.store.undo()
		expect((h.store.get('R1') as { at?: unknown }).at).toBeUndefined()
	})
})

describe('convert keeps geometry (ADR 0007)', () => {
	it('trunk → line → conduit: the same nodes every time', () => {
		const t1 = demoProject().find((e) => e.id === 'T1') as Shape
		const line = toLine(t1)
		const conduit = toContainment(line, { w: 25, h: 25, round: true }, { tier: 'high', form: 'conduit' })
		expect(line.geom).toBe(t1.geom)
		expect(conduit.geom).toBe(t1.geom)
		expect(conduit.role).toMatchObject({ form: 'conduit' })
	})
})
