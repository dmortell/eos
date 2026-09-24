import { describe, it, expect } from 'vitest'
import {
	addModelObj, deleteModelSel, deleteGraphNode, insertGraphNode, branchNode,
	addGuide, addSection, setSectionDir, deleteSection, setSectionClip, type EditScope, type GN,
} from './modelEdit'
import type { ViewCtx, MLayers } from './view'
import type { Model, Obj, Prism, Wall, Guide, Section } from '../3dview/types'

// A recording EditScope: logs 'begin' / 'mark:<label>' / 'end' in call order, so a test can assert both
// the bracket shape (begin→mark→end, or nothing at all for a no-op) and the exact undo label.
function recEdit(): EditScope & { log: string[] } {
	const log: string[] = []
	return { log, begin: () => log.push('begin'), mark: (l) => log.push('mark:' + (l ?? '')), end: () => log.push('end') }
}
const ids = () => { let n = 0; return (prefix = 'x') => `${prefix}${++n}` }
const mdl = (over: Partial<Model> = {}): Model => ({ id: 'm1', name: 'm', objects: [], ...over })
const prism = (over: Partial<Prism> & { id?: string } = {}): Obj => ({ type: 'prism', id: 'p1', x: 0, y: 0, z: 0, w: 100, d: 100, h: 100, edges: 4, ...over } as Obj)
const planCtx: ViewCtx = { dir: 'plan', isPlan: true, isElev: false, isIso: false, elevDir: 'front', cx: 14000, cy: 8750, ground: 10250, frameId: 'f', paperMm: 1, mdl: undefined, yaw: 0, pitch: 0 }
const shown: MLayers = { visible: () => true, locked: () => false }

describe('addModelObj', () => {
	it('pushes the object, brackets begin→mark→end with NO label, returns its id', () => {
		const m = mdl(), edit = recEdit(), o = prism()
		expect(addModelObj(m, edit, o)).toBe('p1')
		expect(m.objects).toEqual([o])
		expect(edit.log).toEqual(['begin', 'mark:', 'end'])
	})
	it('returns undefined for an object with no id', () => {
		const m = mdl(), edit = recEdit()
		expect(addModelObj(m, edit, prism({ id: undefined }))).toBeUndefined()
	})
})

describe('deleteModelSel', () => {
	it('removes matching objects AND guides in one step, labelled Delete; a no-op ids list is a true no-op', () => {
		const m = mdl({ objects: [prism({ id: 'a' }), prism({ id: 'b' })], guides: [{ id: 'g1', plane: 'plan', orient: 'h', pos: 0 }] })
		const edit = recEdit()
		deleteModelSel(m, edit, ['a', 'g1'])
		expect(m.objects.map((o) => o.id)).toEqual(['b'])
		expect(m.guides).toEqual([])
		expect(edit.log).toEqual(['begin', 'mark:Delete', 'end'])
		const edit2 = recEdit()
		deleteModelSel(m, edit2, [])
		expect(edit2.log).toEqual([])
	})
})

describe('deleteGraphNode — degree rules', () => {
	const wall = (nodes: GN[], segs: { id: string; a: string; b: string }[]): Wall =>
		({ type: 'wall', id: 'w1', h: 2800, thickness: 100, nodes, segments: segs } as Wall)

	it('degree 1: deletes the one segment; the far node is pruned if it becomes orphaned', () => {
		const n = { id: 'w1', nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 100, y: 0, z: 0 }] }
		const m = mdl({ objects: [wall(n.nodes, [{ id: 's1', a: 'a', b: 'b' }])] })
		const edit = recEdit()
		const r = deleteGraphNode(m, edit, { obj: 'w1', node: 'a' }, ids())
		expect(r).toEqual({ removedObject: true })   // nothing left at all → object removed
		expect(m.objects).toEqual([])
		expect(edit.log).toEqual(['begin', 'mark:Delete node', 'end'])
	})
	it('degree 2: joins the two far ends into one new segment, drops the middle node', () => {
		const nodes: GN[] = [{ id: 'a', x: 0, y: 0, z: 5 }, { id: 'b', x: 100, y: 0, z: 5 }, { id: 'c', x: 200, y: 0, z: 5 }]
		const w = wall(nodes, [{ id: 's1', a: 'a', b: 'b' }, { id: 's2', a: 'b', b: 'c' }])
		const m = mdl({ objects: [w] })
		const r = deleteGraphNode(m, recEdit(), { obj: 'w1', node: 'b' }, ids())
		expect(r).toEqual({ removedObject: false })
		expect(w.segments).toEqual([{ id: 's1', a: 'a', b: 'c' }])   // uid('s') → 1st call
		expect((w.nodes as GN[]).map((n) => n.id).sort()).toEqual(['a', 'c'])
	})
	it('degree 3+: keeps the first two joined, drops the rest and their now-orphaned far ends', () => {
		const nodes: GN[] = [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 100, y: 0, z: 0 }, { id: 'c', x: 0, y: 100, z: 0 }, { id: 'j', x: 0, y: -100, z: 0 }]
		// j is the junction node; a/b/c each connect to it only
		const w = wall([...nodes], [{ id: 's1', a: 'j', b: 'a' }, { id: 's2', a: 'j', b: 'b' }, { id: 's3', a: 'j', b: 'c' }])
		const m = mdl({ objects: [w] })
		deleteGraphNode(m, recEdit(), { obj: 'w1', node: 'j' }, ids())
		expect(w.segments).toEqual([{ id: 's1', a: 'a', b: 'b' }])   // uid('s') → 1st call; first two (s1,s2) joined a↔b
		expect((w.nodes as GN[]).map((n) => n.id).sort()).toEqual(['a', 'b'])   // c orphaned and pruned, j itself gone
	})
	it('a duplicate far end (e1 === e2) is not self-joined — no spurious segment', () => {
		// Two segments BOTH connecting 'a' to 'mid' (a loop back to the same node): deleting mid would
		// otherwise try to join a↔a with itself.
		const nodes: GN[] = [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'mid', x: 50, y: 0, z: 0 }]
		const w = wall(nodes, [{ id: 's1', a: 'a', b: 'mid' }, { id: 's2', a: 'mid', b: 'a' }])
		const m = mdl({ objects: [w] })
		deleteGraphNode(m, recEdit(), { obj: 'w1', node: 'mid' }, ids())
		expect(w.segments).toEqual([])   // e1 === e2 === 'a' → no join added
		expect(m.objects).toEqual([])    // nothing left → object removed
	})
	it('a no-op (unknown object / non-graph object) leaves the model untouched', () => {
		const m = mdl({ objects: [prism()] })
		const edit = recEdit()
		expect(deleteGraphNode(m, edit, { obj: 'p1', node: 'a' }, ids())).toEqual({ removedObject: false })
		expect(edit.log).toEqual([])
		expect(deleteGraphNode(m, edit, { obj: 'nope', node: 'a' }, ids())).toEqual({ removedObject: false })
	})
})

describe('insertGraphNode', () => {
	const wall = (id: string, nodes: GN[]): Obj => ({ type: 'wall', id, h: 2800, thickness: 100, nodes, segments: [{ id: 's', a: nodes[0].id, b: nodes[1].id }] } as Obj)
	const rnd = (v: number) => Math.round(v)

	it('plan: splits the nearest segment at p, the new node inherits the segment z, both halves rounded', () => {
		const w = wall('w1', [{ id: 'a', x: 0, y: 0, z: 7 }, { id: 'b', x: 1000, y: 0, z: 7 }])
		const m = mdl({ objects: [w] })
		const edit = recEdit()
		const hit = insertGraphNode(planCtx, m, edit, [500.4, 0.4], 10, shown, rnd, ids())
		expect(hit).toBe('w1')
		expect(edit.log).toEqual(['begin', 'mark:', 'end'])
		const ns = (w as Wall).nodes as GN[]
		expect(ns).toHaveLength(3)
		const nn = ns.find((n) => n.id === 'n1')!   // uid('n') → 1st call
		expect(nn).toEqual({ id: 'n1', x: 500, y: 0, z: 7 })   // z inherited from the split segment
		expect((w as Wall).segments).toEqual([{ id: 's', a: 'a', b: 'n1' }, { id: 's2', a: 'n1', b: 'b' }])   // uid('s') → 2nd call
	})
	it('elevation: the new node gets the on-axis coord + z from p, keeping the segment\'s off-axis coord', () => {
		const front: ViewCtx = { ...planCtx, dir: 'front', isPlan: false, isElev: true, elevDir: 'front' }
		const w = wall('w1', [{ id: 'a', x: 100, y: 500, z: 0 }, { id: 'b', x: 100, y: 500, z: 2800 }])
		const m = mdl({ objects: [w] })
		const hit = insertGraphNode(front, m, recEdit(), [100, 8850], 10, shown, rnd, ids())   // drawn y=8850 → z = ground(10250)-8850 = 1400
		expect(hit).toBe('w1')
		const nn = ((w as Wall).nodes as GN[]).find((n) => n.id === 'n1')!
		expect(nn).toEqual({ x: 100, y: 500, z: 1400, id: 'n1' })   // y (off-axis) kept from segment; x/z from the drawn point
	})
	it('skips a hidden-layer object and returns null when nothing is close enough', () => {
		const w = wall('w1', [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 1000, y: 0, z: 0 }])
		const m = mdl({ objects: [w] })
		expect(insertGraphNode(planCtx, m, recEdit(), [500, 0], 10, { visible: () => false, locked: () => false }, rnd, ids())).toBeNull()
		expect(insertGraphNode(planCtx, m, recEdit(), [500, 500], 10, shown, rnd, ids())).toBeNull()   // far away
	})
})

describe('branchNode — pure, no edit bracket', () => {
	it('adds a coincident node + connecting segment, and returns the STORE array element (not a detached copy)', () => {
		const w = { type: 'wall', id: 'w1', h: 2800, thickness: 100, nodes: [{ id: 'a', x: 5, y: 6, z: 7 }], segments: [] } as Extract<Obj, { type: 'wall' | 'conduit' }>
		const from: GN = { id: 'a', x: 5, y: 6, z: 7 }
		const nn = branchNode(w, from, ids())
		expect(nn).toEqual({ id: 'n1', x: 5, y: 6, z: 7 })   // uid('n') → 1st call
		expect(w.nodes).toHaveLength(2)
		expect(nn).toBe((w.nodes as GN[])[1])   // the store's own element, not a fresh object
		expect(w.segments).toEqual([{ id: 's2', a: 'a', b: 'n1' }])   // uid('s') → 2nd call
	})
})

describe('addGuide / addSection — B26 regression: works on a model with NO array yet', () => {
	it('addGuide creates mdl.guides on demand and the item is visible afterwards, bracketed as Add guide', () => {
		const m = mdl(), edit = recEdit()
		const g: Guide = { id: 'g1', plane: 'plan', orient: 'h', pos: 500 }
		addGuide(m, edit, g)
		expect(m.guides).toEqual([g])
		expect(edit.log).toEqual(['begin', 'mark:Add guide', 'end'])
	})
	it('addSection creates mdl.sections on demand and the item is visible afterwards, bracketed as Add section', () => {
		const m = mdl(), edit = recEdit()
		const s: Section = { id: 's1', clip: { x0: 0, y0: 0, z0: 0, x1: 1, y1: 1, z1: 1 }, dir: 'front' }
		addSection(m, edit, s)
		expect(m.sections).toEqual([s])
		expect(edit.log).toEqual(['begin', 'mark:Add section', 'end'])
	})
	it('a second add re-reads the proxy, not a stale raw array (B26 shape)', () => {
		const m = mdl(), edit = recEdit()
		addGuide(m, edit, { id: 'g1', plane: 'plan', orient: 'h', pos: 0 })
		addGuide(m, edit, { id: 'g2', plane: 'plan', orient: 'v', pos: 0 })
		expect(m.guides?.map((g) => g.id)).toEqual(['g1', 'g2'])
	})
})

describe('setSectionDir', () => {
	const m = () => mdl({ sections: [{ id: 's1', clip: { x0: 0, y0: 0, z0: 0, x1: 1, y1: 1, z1: 1 }, dir: 'front' as const }] })
	it('changes the direction, brackets as Set section direction, returns true', () => {
		const mm = m(), edit = recEdit()
		expect(setSectionDir(mm, edit, 's1', 'rear')).toBe(true)
		expect(mm.sections![0].dir).toBe('rear')
		expect(edit.log).toEqual(['begin', 'mark:Set section direction', 'end'])
	})
	it('NO-OP (no bracket at all) when the direction is unchanged', () => {
		const mm = m(), edit = recEdit()
		expect(setSectionDir(mm, edit, 's1', 'front')).toBe(false)
		expect(edit.log).toEqual([])
	})
	it('NO-OP when the section id is not found', () => {
		const mm = m(), edit = recEdit()
		expect(setSectionDir(mm, edit, 'nope', 'rear')).toBe(false)
		expect(edit.log).toEqual([])
	})
})

describe('deleteSection', () => {
	const m = () => mdl({ sections: [{ id: 's1', clip: { x0: 0, y0: 0, z0: 0, x1: 1, y1: 1, z1: 1 }, dir: 'front' as const }] })
	it('removes it, brackets as Delete section, returns true', () => {
		const mm = m(), edit = recEdit()
		expect(deleteSection(mm, edit, 's1')).toBe(true)
		expect(mm.sections).toEqual([])
		expect(edit.log).toEqual(['begin', 'mark:Delete section', 'end'])
	})
	it('NO-OP when not found', () => {
		const mm = m(), edit = recEdit()
		expect(deleteSection(mm, edit, 'nope')).toBe(false)
		expect(edit.log).toEqual([])
		expect(mm.sections).toHaveLength(1)
	})
})

describe('setSectionClip — no edit bracket (the caller\'s drag gesture records the step)', () => {
	it('mutates the matching section\'s clip in place; a no-op when not found', () => {
		const clip = { x0: 0, y0: 0, z0: 0, x1: 1, y1: 1, z1: 1 }
		const m = mdl({ sections: [{ id: 's1', clip, dir: 'front' }] })
		const newClip = { x0: 10, y0: 10, z0: 0, x1: 20, y1: 20, z1: 100 }
		setSectionClip(m, 's1', newClip)
		expect(m.sections![0].clip).toEqual(newClip)
		setSectionClip(m, 'nope', newClip)   // no throw, no change elsewhere
		expect(m.sections).toHaveLength(1)
	})
})
