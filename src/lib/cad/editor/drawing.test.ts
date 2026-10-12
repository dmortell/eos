// Drawing runs and editing nodes, as behaviour (ADR 0006 / 0007).
import { describe, it, expect } from 'vitest'
import { EntityStore } from '../store/store'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { snapAt, gridSnap, gridStepOf, GRID_STEPS } from './snap'
import { pathGrips, moveNodes, joinDropped } from './grips'
import { followAttached } from './behaviours'
import { PathTool } from './pathTool'
import { snapPt, type ToolCtx, type DrawOpts } from './tools'
import { SelectTool } from './selectTool'
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
	it('any typed grid step: 600 (floor tiles), 44.45 (1U) — on the line exactly; a bad entry is refused (Review 2 Q49)', () => {
		expect(gridSnap({ x: 1000, y: -350 }, 600)).toEqual({ x: 1200, y: -600 })
		expect(gridSnap({ x: 130, y: 20 }, 44.45)).toEqual({ x: 133.35, y: 0 })
		expect(snapPt({ x: 130, y: 100 }, false, 44.45)).toEqual({ x: 133.35, y: 88.9 })
		expect(snapAt(new ProjectIndex(demoProject()), 'L33', { x: 50_350, y: 70_000 }, 15, { grid: 600 })).toEqual({ p: { x: 50_400, y: 70_200 }, kind: 'grid' })
		expect([gridStepOf('600'), gridStepOf(' 44.45 '), gridStepOf('44,45'), gridStepOf(0.004)]).toEqual([600, 44.45, 44.45, 0.01])
		expect([gridStepOf(''), gridStepOf('0'), gridStepOf('-5'), gridStepOf('abc')]).toEqual([null, null, null, null])
		expect(GRID_STEPS).toEqual(expect.arrayContaining([44.45, 600]))
	})
	it('snaps to the centre of a circle, a box and a polygon, and a block\'s insertion point', () => {
		const sh = (id: string, geom: Shape['geom']) => ({ type: 'shape', id, levelId: 'L33', geom }) as Shape
		const ix = new ProjectIndex([...demoProject(),
			sh('C', { kind: 'circle', centre: { x: 20000, y: 20000 }, r: 500 }),
			sh('R', { kind: 'rect', centre: { x: 22000, y: 20000 }, size: { x: 800, y: 400 } }),
			sh('P', { kind: 'polygon', pts: [{ x: 24000, y: 20000 }, { x: 25000, y: 20000 }, { x: 24500, y: 21000 }] }),
			sh('I', { kind: 'insert', blockId: 'b', at: { x: 26000, y: 20000 } })])
		expect(snapAt(ix, 'L33', { x: 20005, y: 19996 }, 15)).toMatchObject({ kind: 'centre', p: { x: 20000, y: 20000 } })
		expect(snapAt(ix, 'L33', { x: 22004, y: 20004 }, 15)).toMatchObject({ kind: 'centre', p: { x: 22000, y: 20000 } })
		expect(snapAt(ix, 'L33', { x: 24500, y: 20330 }, 15)).toMatchObject({ kind: 'centre' })
		expect(snapAt(ix, 'L33', { x: 26003, y: 20002 }, 15)).toMatchObject({ kind: 'centre', p: { x: 26000, y: 20000 } })
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
	it('a click back on the first point (3+ points) closes the run; Shift draws in 15° steps', () => {
		const h = harness()
		const tool = new PathTool('wall')
		tool.down(at(0, 6000), h.ctx())
		tool.down({ ...at(4000, 6300), shift: true }, h.ctx())   // Shift: level (0°), 4000 along
		tool.down(at(4000, 9000), h.ctx())
		tool.down(at(3, 6004), h.ctx())                           // on the first point: closes
		const s = h.store.get(h.sel()[0]) as Shape
		expect(s.geom.kind === 'path' && s.geom.nodes.map((n) => [n.x, n.y])).toEqual([[0, 6000], [4000, 6000], [4000, 9000]])
		expect(s.geom.kind === 'path' && s.geom.segs.length).toBe(3)
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
	it('a node dropped on another node of its path joins it; a segment between the two collapses (Dave)', () => {
		const n = (id: string, x: number, y: number) => ({ id, x, y, z: 0 })
		const seg = (id: string, a: string, b: string) => ({ id, a, b })
		const path = (segs: ReturnType<typeof seg>[]) => ({ type: 'shape', id: 'P', levelId: 'L33', geom: { kind: 'path', nodes: [n('A', 0, 0), n('B', 1000, 0), n('C', 1000, 1000), n('D', 0, 1000)], segs } }) as Shape
		const run = path([seg('s1', 'A', 'B'), seg('s2', 'B', 'C'), seg('s3', 'C', 'D')])
		const shape = (s: Shape) => (s.geom.kind === 'path' ? { nodes: s.geom.nodes.map((x) => x.id), segs: s.geom.segs.map((x) => `${x.a}${x.b}`) } : null)
		// D dropped on A: the run closes
		const closed = joinDropped(moveNodes(run, ['D'], { x: 0, y: 0 }), ['D'])
		expect(closed.joined).toBe(1)
		expect(shape(closed.shape)).toEqual({ nodes: ['A', 'B', 'C'], segs: ['AB', 'BC', 'CA'] })
		// A dropped on B, its neighbour: segment A–B goes, the run starts at B
		const shorter = joinDropped(moveNodes(run, ['A'], { x: 1000, y: 0 }), ['A'])
		expect(shape(shorter.shape)).toEqual({ nodes: ['B', 'C', 'D'], segs: ['BC', 'CD'] })
		// a lone segment: joining would leave nothing, so the node just moves
		const lone = path([seg('s1', 'A', 'B')])
		const kept = joinDropped(moveNodes(lone, ['A'], { x: 1000, y: 0 }), ['A'])
		expect(kept.joined).toBe(0)
		expect(kept.shape.geom.kind === 'path' && kept.shape.geom.nodes.length).toBe(4)
		// not on a node: nothing joins
		expect(joinDropped(moveNodes(run, ['D'], { x: 10, y: 10 }), ['D']).joined).toBe(0)
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
