// Editing inside a run (User, 2026-10-05): two runs joined by dropping a node on the other's node, nodes of other runs
// that sit on a dragged node move along, Disconnect / Delete on picked nodes and segments.
import { describe, it, expect } from 'vitest'
import { EntityStore } from '../store/store'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { snapAt } from './snap'
import { type ToolCtx } from './tools'
import { SelectTool } from './selectTool'
import { followersOf, joinAcross, deletePicked, disconnectPicked, segAt } from './pathSel'
import { canJoin } from '../domain/pathEdit'
import { spaceOf, PLAN } from '../views/space'
import { planDisplayList } from '../views/plan'
import type { Shape } from '../domain/shapes'
import type { Link } from '../domain/types'

const trunk = (id: string, pts: [number, number][], extra: Partial<Shape> = {}) => ({
	type: 'shape', id, levelId: 'L33', role: { kind: 'containment', form: 'trunk', tier: 'high' }, section: { w: 100, h: 50 },
	geom: { kind: 'path', nodes: pts.map(([x, y], i) => ({ id: `${id}${i}`, x, y, z: 2900 })), segs: pts.slice(1).map((_, i) => ({ id: `${id}s${i}`, a: `${id}${i}`, b: `${id}${i + 1}` })) },
	...extra,
}) as Shape
const ids = (s: Shape) => (s.geom.kind === 'path' ? { nodes: s.geom.nodes.map((n) => n.id).sort(), segs: s.geom.segs.map((g) => `${g.a}-${g.b}`).sort() } : null)

describe('joining two runs', () => {
	const A = trunk('A', [[0, 0], [1000, 0]]), B = trunk('B', [[1000, 500], [1000, 1500], [2000, 1500]])
	it('a node dropped on another run of the same kind joins them into one run (A keeps its id)', () => {
		const atB = { ...A, geom: { kind: 'path', nodes: [{ id: 'A0', x: 0, y: 0, z: 2900 }, { id: 'A1', x: 1000, y: 1500, z: 2900 }], segs: [{ id: 'As0', a: 'A0', b: 'A1' }] } } as Shape
		const j = joinAcross(atB, ['A1'], [B], spaceOf(PLAN)) as { shape: Shape; absorbed: string }
		expect(j.absorbed).toBe('B')
		expect(ids(j.shape)).toEqual({ nodes: ['A0', 'B0', 'B1', 'B2'], segs: ['A0-B1', 'B0-B1', 'B1-B2'] })   // three segments meet at B1
	})
	it('only like with like: a trunk does not join a wall or a conduit', () => {
		expect(canJoin(A, B)).toBe(true)
		expect(canJoin(A, { ...B, role: { kind: 'wall', openings: [] } } as Shape)).toBe(false)
		expect(canJoin(A, { ...B, role: { kind: 'containment', form: 'conduit', tier: 'high' } } as Shape)).toBe(false)
	})
	it('with the Select tool: drag A\'s end onto B\'s node — one run, B gone, a cable that chose B now uses A; one undo step', () => {
		const store = new EntityStore()
		const link = { type: 'link', id: 'L1', kind: 'backbone', a: { on: 'x', port: 1 }, b: { on: 'y', port: 1 }, via: 'B', status: 'design' } as Link
		const tag = { type: 'shape', id: 'TAG', levelId: 'L33', geom: { kind: 'leader', pts: [{ x: 1500, y: 1500 }, { x: 1500, y: 1800 }], text: 'T', attach: 'B' } } as Shape
		store.load([...demoProject(), A, B, link, tag])
		let sel = ['A']
		const ctx = () => ({
			store, index: new ProjectIndex(store.all()), levelId: 'L33', opts: { z: 2900, w: 100, h: 50 }, prims: () => [], tol: () => 10,
			space: spaceOf(PLAN), work: { z: 2900, depth: 0 }, snap: (p: { x: number; y: number }, alt: boolean, skip?: string | string[]) => snapAt(new ProjectIndex(store.all()), 'L33', p, 15, { skip, noGrid: alt }),
			selection: sel, select: (x: string[]) => { sel = x }, setMarquee: () => {}, ask: () => {}, say: () => {},
		}) as unknown as ToolCtx
		const t = new SelectTool(), at = (x: number, y: number) => ({ p: { x, y }, shift: false, ctrl: false, alt: false })
		t.down(at(1000, 0), ctx()); t.move(at(1000, 800), ctx()); t.move(at(1004, 1497), ctx()); t.up(at(1004, 1497), ctx())
		expect(store.get('B')).toBeUndefined()
		expect(ids(store.get('A') as Shape)!.segs).toContain('B0-B1')
		expect((store.get('L1') as Link).via).toBe('A')
		expect((store.get('TAG') as Shape).geom).toMatchObject({ attach: 'A' })   // a leader on B follows it into A
		expect(store.undoLabels).toEqual(['Move node'])
		store.undo()
		expect(store.get('B')).toBeDefined()
	})
})

describe('runs that already touch at a node (User: two trunks near R311)', () => {
	it('dragging the shared node makes them one run, so all three segments move with it', () => {
		const A = trunk('A', [[-60, -8320], [-1650, -8740]]), B = trunk('B', [[-3420, -8560], [-1650, -8740], [-1670, -7980]])
		const store = new EntityStore()
		store.load([...demoProject(), A, B])
		let sel = ['A']
		const ctx = () => ({
			store, index: new ProjectIndex(store.all()), levelId: 'L33', opts: { z: 2900, w: 100, h: 50 }, prims: () => [], tol: () => 10,
			space: spaceOf(PLAN), work: { z: 2900, depth: 0 }, snap: (p: { x: number; y: number }) => ({ p, kind: 'grid' as const }),
			selection: sel, select: (x: string[]) => { sel = x }, setMarquee: () => {}, ask: () => {}, say: () => {},
		}) as unknown as ToolCtx
		const t = new SelectTool(), at = (x: number, y: number) => ({ p: { x, y }, shift: false, ctrl: false, alt: false })
		t.down(at(-1650, -8740), ctx()); t.move(at(-1600, -8700), ctx()); t.up(at(-1600, -8700), ctx())
		expect(store.get('B')).toBeUndefined()
		const s = store.get('A') as Shape
		expect(s.geom.kind === 'path' && s.geom.segs.length).toBe(3)
		// the shared node moved, and all three segments end at it
		const shared = s.geom.kind === 'path' ? s.geom.nodes.find((n) => n.x === -1600 && n.y === -8700) : undefined
		expect(shared && s.geom.kind === 'path' && s.geom.segs.filter((g) => g.a === shared.id || g.b === shared.id).length).toBe(3)
	})
})

describe('nodes of other runs move along', () => {
	it('a node of another run at the same point (and height) follows; one elsewhere does not', () => {
		const A = trunk('A', [[0, 0], [1000, 0]]), B = trunk('B', [[1000, 0], [1000, 1000]]), C = trunk('C', [[1000, 0], [2000, 0]], { geom: { kind: 'path', nodes: [{ id: 'C0', x: 1000, y: 0, z: 300 }, { id: 'C1', x: 2000, y: 0, z: 300 }], segs: [{ id: 'Cs', a: 'C0', b: 'C1' }] } } as Partial<Shape>)
		expect([...followersOf([A, B, C], A, ['A1'])]).toEqual([['B', ['B0']]])   // C's node is under it, at another height
	})
})

describe('picked nodes and segments', () => {
	const run = trunk('R', [[0, 0], [1000, 0], [2000, 0], [3000, 0]])
	it('Disconnect at a middle node splits the run in two there (the first part keeps the id)', () => {
		const out = disconnectPicked(run, ['R1'])
		expect(out).toHaveLength(2)
		expect(out[0].id).toBe('R')
		expect(out.map((s) => ids(s)!.segs.length).sort()).toEqual([1, 2])
	})
	it('Delete on a node heals the run; on a middle segment it splits the run', () => {
		expect(ids(deletePicked(run, { shape: 'R', nodes: ['R1'], segs: [] })[0])!.segs).toEqual(['R0-R2', 'R2-R3'])
		const split = deletePicked(run, { shape: 'R', nodes: [], segs: ['Rs1'] })
		expect(split.map((s) => ids(s)!.segs)).toEqual([['R0-R1'], ['R2-R3']])
		expect(deletePicked(trunk('S', [[0, 0], [10, 0]]), { shape: 'S', nodes: [], segs: ['Ss0'] })).toEqual([])
	})
	it('several nodes: Ctrl-click on grips adds / drops them; Delete removes them all and heals the run', () => {
		const store = new EntityStore()
		store.load([...demoProject(), run])
		let ps: { shape: string; nodes: string[]; segs: string[] } | null = null
		const ctx = () => ({
			store, index: new ProjectIndex(store.all()), levelId: 'L33', opts: { z: 2900, w: 100, h: 50 }, prims: () => [], tol: () => 10,
			space: spaceOf(PLAN), work: { z: 2900, depth: 0 }, snap: (p: { x: number; y: number }) => ({ p, kind: 'grid' as const }),
			selection: ['R'], select: () => {}, setMarquee: () => {}, ask: () => {}, say: () => {}, pathSel: () => ps, selectPath: (x: typeof ps) => { ps = x },
		}) as unknown as ToolCtx
		const t = new SelectTool(), click = (x: number, ctrl: boolean) => { const e = { p: { x, y: 0 }, shift: false, ctrl, alt: false }; t.down(e, ctx()); t.up(e, ctx()) }
		click(1000, false); click(2000, true)
		expect(ps!.nodes).toEqual(['R1', 'R2'])
		click(3000, true); click(3000, true)   // added, then dropped again
		expect(ps!.nodes).toEqual(['R1', 'R2'])
		expect(ids(deletePicked(run, ps!)[0])).toMatchObject({ nodes: ['R0', 'R3'], segs: [expect.stringMatching(/^(R0-R3|R3-R0)$/)] })
		expect(store.undoLabels).toEqual([])   // picking is not an edit
	})
	it('Ctrl-drag a picked segment: a COPY of just that segment, moved by the drag, selected; the run stays; one undo step', () => {
		const store = new EntityStore()
		const attached = { ...run, geom: { ...run.geom, nodes: (run.geom as { nodes: object[] }).nodes.map((n, i) => (i === 1 ? { ...n, attach: 'O1' } : n)) } } as Shape
		store.load([...demoProject(), attached])
		let ps: { shape: string; nodes: string[]; segs: string[] } | null = { shape: 'R', nodes: [], segs: ['Rs1'] }, sel = ['R']
		const ctx = () => ({
			store, index: new ProjectIndex(store.all()), levelId: 'L33', opts: { z: 2900, w: 100, h: 50 }, prims: () => planDisplayList(new ProjectIndex(store.all()), 'L33', { scale: 100 }), tol: () => 10, grid: 10,
			space: spaceOf(PLAN), work: { z: 2900, depth: 0 }, snap: (p: { x: number; y: number }) => ({ p, kind: 'grid' as const }),
			selection: sel, select: (x: string[]) => { sel = x }, setMarquee: () => {}, ask: () => {}, say: () => {}, pathSel: () => ps, selectPath: (x: typeof ps) => { ps = x },
		}) as unknown as ToolCtx
		const t = new SelectTool(), at = (x: number, y: number) => ({ p: { x, y }, shift: false, ctrl: true, alt: false })
		t.down(at(1500, 0), ctx()); t.move(at(1500, 600), ctx()); t.up(at(1500, 600), ctx())
		expect(store.get('R')).toEqual(attached)   // the run itself is untouched
		const copy = store.get(sel[0]) as Shape
		expect(sel).toHaveLength(1)
		expect(copy.id).not.toBe('R')
		expect(copy.role).toEqual(run.role)
		const g = copy.geom as { nodes: { x: number; y: number; attach?: string }[]; segs: object[] }
		expect(g.segs).toHaveLength(1)
		expect(g.nodes.map((n) => [n.x, n.y])).toEqual([[1000, 600], [2000, 600]])
		expect(g.nodes.some((n) => n.attach)).toBe(false)   // not attached to what the original was
		expect(store.undoLabels).toEqual(['Copy segment'])
		// a Ctrl-CLICK (no drag) on a picked segment still drops it from the pick
		sel = ['R']; ps = { shape: 'R', nodes: [], segs: ['Rs0', 'Rs1'] }
		t.down(at(1500, 0), ctx()); t.up(at(1500, 0), ctx())
		expect(ps!.segs).toEqual(['Rs0'])
	})
	it('the segment under the cursor', () => {
		expect(segAt(run, spaceOf(PLAN), { x: 1500, y: 4 }, 10)).toBe('Rs1')
		expect(segAt(run, spaceOf(PLAN), { x: 1500, y: 40 }, 10)).toBeNull()
	})
})

describe('the grip under the pointer', () => {
	it('goes with its shape: deleted, the larger hover grip is not drawn though the pointer has not moved', () => {
		const store = new EntityStore()
		store.load([...demoProject(), trunk('A', [[0, 0], [1000, 0]])])
		let sel = ['A']
		const ctx = () => ({
			store, index: new ProjectIndex(store.all()), levelId: 'L33', opts: { z: 2900, w: 100, h: 50 }, prims: () => [], tol: () => 10,
			space: spaceOf(PLAN), work: { z: 2900, depth: 0 }, snap: (p: { x: number; y: number }) => ({ p, kind: 'grid' }),
			selection: sel, select: (x: string[]) => { sel = x }, setMarquee: () => {}, ask: () => {}, say: () => {},
		}) as unknown as ToolCtx
		const t = new SelectTool(), hovered = () => t.preview(ctx()).filter((p) => p.k === 'line' && p.cls === 'grip grip-hover')
		t.hover({ p: { x: 1000, y: 0 }, shift: false, ctrl: false, alt: false }, ctx())
		expect(hovered()).toHaveLength(1)
		store.transact('Delete', (tx) => tx.del('A'))
		expect(hovered()).toHaveLength(0)   // still selected for a moment: the shape is gone
		sel = []
		expect(hovered()).toHaveLength(0)
	})
})

describe('the grip under the pointer after an undo (User 2026-10-15)', () => {
	it('an undo that moves its shape back hides the larger hover grip until the pointer moves', () => {
		const store = new EntityStore()
		store.load([...demoProject(), trunk('A', [[0, 0], [1000, 0]])])
		store.transact('Move', (tx) => tx.put(trunk('A', [[0, 0], [1500, 0]])))
		const sel = ['A']
		const ctx = () => ({
			store, index: new ProjectIndex(store.all()), levelId: 'L33', opts: { z: 2900, w: 100, h: 50 }, prims: () => [], tol: () => 10,
			space: spaceOf(PLAN), work: { z: 2900, depth: 0 }, snap: (p: { x: number; y: number }) => ({ p, kind: 'grid' }),
			selection: sel, select: () => {}, setMarquee: () => {}, ask: () => {}, say: () => {},
		}) as unknown as ToolCtx
		const t = new SelectTool(), hovered = () => t.preview(ctx()).filter((p) => p.k === 'line' && p.cls === 'grip grip-hover')
		t.hover({ p: { x: 1500, y: 0 }, shift: false, ctrl: false, alt: false }, ctx())
		expect(hovered()).toHaveLength(1)
		store.undo()
		expect(hovered()).toHaveLength(0)
	})
})
