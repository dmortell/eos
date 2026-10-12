// Segment lengths of a run / wall (3D: a drop counts its height), and their total.
import { describe, it, expect } from 'vitest'
import { insertNode, segmentLengths, splitRunsAt, runZAt, splitSegRefs, joinShapes, joinHeightProblem, repointRefs, pieces, pieceRefs } from './pathEdit'
import type { Shape, ContainmentRole } from './shapes'
import type { Entity, Sheet } from './drawing'
import type { Link, Outlet } from './types'

describe('segment lengths', () => {
	it('lists each segment with its end nodes, flags drops, and totals them', () => {
		const n = (id: string, x: number, y: number, z: number) => ({ id, x, y, z })
		const s = { type: 'shape', id: 'R', levelId: 'L', geom: { kind: 'path', nodes: [n('a', 0, 0, 2900), n('b', 3000, 0, 2900), n('c', 3000, 4000, 2900), n('d', 3000, 4000, 300)],
			segs: [{ id: 's1', a: 'a', b: 'b' }, { id: 's2', a: 'b', b: 'c' }, { id: 's3', a: 'c', b: 'd' }] } } as unknown as Shape
		const r = segmentLengths(s)
		expect(r.segs.map((g) => [g.from, g.to, g.len, g.vertical])).toEqual([[1, 2, 3000, false], [2, 3, 4000, false], [3, 4, 2600, true]])
		expect(r.total).toBe(9600)
	})
})

describe('splitting a wall (insertNode)', () => {
	it('its openings go to the half they sit on, measured from that half’s start (Q70)', () => {
		const n = (id: string, x: number) => ({ id, x, y: 0, z: 0 })
		const op = (id: string, at: number) => ({ id, segId: 's1', at, width: 900, z: 0, h: 2100 })
		const wall = { type: 'shape', id: 'W', levelId: 'L', role: { kind: 'wall', openings: [op('o1', 1000), op('o2', 3000)] },
			geom: { kind: 'path', nodes: [n('a', 0), n('b', 4000)], segs: [{ id: 's1', a: 'a', b: 'b' }] } } as unknown as Shape
		const r = insertNode(wall, 's1', 0.5, 'm')
		const segs = (r.geom as { segs: { id: string; a: string }[] }).segs, second = segs.find((x) => x.a === 'm')!.id
		const ops = (r.role as unknown as { openings: { id: string; segId: string; at: number }[] }).openings
		expect(ops.find((o) => o.id === 'o1')).toMatchObject({ segId: 's1', at: 1000 })
		expect(ops.find((o) => o.id === 'o2')).toMatchObject({ segId: second, at: 1000 })
	})
})

describe('a run drawn to the middle of another (splitRunsAt)', () => {
	const n = (id: string, x: number, y: number, z: number) => ({ id, x, y, z })
	const trunk = { type: 'shape', id: 'T', levelId: 'L', role: { kind: 'containment', form: 'trunk', tier: 'high' },
		geom: { kind: 'path', nodes: [n('a', 0, 0, 2600), n('b', 4000, 0, 2600)], segs: [{ id: 's1', a: 'a', b: 'b' }] } } as unknown as Shape
	it('gets a node exactly there — two segments for one; not at its ends, another height, another level or a line', () => {
		const [t] = splitRunsAt([trunk], 'L', [{ x: 1500, y: 0, z: 2600 }])
		const g = t.geom as { nodes: { x: number; y: number; z: number }[]; segs: unknown[] }
		expect(g.segs).toHaveLength(2)
		expect(g.nodes.at(-1)).toMatchObject({ x: 1500, y: 0, z: 2600 })
		expect(splitRunsAt([trunk], 'L', [{ x: 4000, y: 0, z: 2600 }])).toEqual([])   // its end: already a node
		expect(splitRunsAt([trunk], 'L', [{ x: 1500, y: 0, z: 0 }])).toEqual([])      // a low run under it doesn't meet it
		expect(splitRunsAt([trunk], 'L2', [{ x: 1500, y: 0, z: 2600 }])).toEqual([])
		expect(splitRunsAt([{ ...trunk, role: undefined } as Shape], 'L', [{ x: 1500, y: 0, z: 2600 }])).toEqual([])
	})
	it('both halves keep the hand cables tied to the split segment; a penetration on the far half names it', () => {
		const tied = { ...trunk, role: { ...trunk.role, extra: [{ type: 'Power', n: 2, seg: 's1' }, { type: 'Cat6', n: 6 }] } } as Shape
		const [t] = splitRunsAt([tied], 'L', [{ x: 1500, y: 0, z: 2600 }])
		const g = t.geom as { segs: { id: string }[] }, second = g.segs.find((x) => x.id !== 's1')!.id
		expect((t.role as ContainmentRole).extra).toEqual([{ type: 'Power', n: 2, seg: 's1' }, { type: 'Power', n: 2, seg: second }, { type: 'Cat6', n: 6 }])
		const pen = (id: string, x: number) => ({ type: 'shape', id, levelId: 'L', role: { kind: 'penetration', diaMm: 50, through: 'wall', source: { run: 'T', seg: 's1', host: 'W' } }, geom: { kind: 'circle', centre: { x, y: 0 }, r: 25 } }) as unknown as Shape
		const out = splitSegRefs([pen('near', 700), pen('far', 3000)], tied, t)
		expect(out.map((e) => [e.id, ((e as Shape).role as { source: { seg: string } }).source.seg])).toEqual([['far', second]])
	})
	it('drawn at another height, the new run drops to it: runZAt finds the run’s height under the point', () => {
		expect(runZAt([trunk], 'L', { x: 1500, y: 0 }, 2950)).toBe(2600)
		expect(runZAt([trunk], 'L', { x: 1500, y: 300 }, 2950)).toBeNull()
	})
})

describe('two runs joined into one (joinShapes / repointRefs)', () => {
	const n = (id: string, x: number, y: number) => ({ id, x, y, z: 2600 })
	const run = (id: string, a: [number, number], b: [number, number], role: Partial<ContainmentRole>, more: Partial<Shape> = {}) => ({
		type: 'shape', id, levelId: 'L', role: { kind: 'containment', form: 'trunk', tier: 'high', ...role },
		geom: { kind: 'path', nodes: [n(`${id}0`, ...a), n(`${id}1`, ...b)], segs: [{ id: `${id}s`, a: `${id}0`, b: `${id}1` }] }, ...more,
	}) as unknown as Shape
	it('on a plan, runs at different heights are not joined — join them in an elevation (Review 2 Q7, Dave)', () => {
		const A = run('A', [0, 0], [1000, 0], {}), B = run('B', [1000, 0], [1000, 1000], { tier: 'low' })
		expect(joinHeightProblem(A, B, [['B0', 'A1']])).toBeNull()   // both at Z 2600
		const low = { ...B, geom: { ...(B.geom as { nodes: { z: number }[] }), nodes: (B.geom as { nodes: { id: string; x: number; y: number; z: number }[] }).nodes.map((q) => ({ ...q, z: 300 })) } } as unknown as Shape
		expect(joinHeightProblem(A, low, [['B0', 'A1']])).toMatch(/different heights.*elevation/)
	})
	it('keeps the absorbed run’s hand cables (on its own segments), served rooms, primary and label', () => {
		const A = run('A', [0, 0], [1000, 0], { extra: [{ type: 'Cat6', n: 4 }], serves: ['SR1'] })
		const B = run('B', [1000, 0], [1000, 1000], { extra: [{ type: 'Coax', n: 2 }, { type: 'Power', n: 1, seg: 'Bs' }], serves: ['SR2'], primary: true }, { label: 'T-2' })
		const j = joinShapes(A, B, [['B0', 'A1']])!
		const r = j.role as ContainmentRole
		expect(r.extra).toEqual([{ type: 'Cat6', n: 4, seg: 'As' }, { type: 'Coax', n: 2, seg: 'Bs' }, { type: 'Power', n: 1, seg: 'Bs' }])
		expect(r.serves).toEqual(['SR1', 'SR2'])
		expect(r.primary).toBe(true)
		expect(j.label).toBe('T-2')
		// one open to any room → the joined run is too
		expect((joinShapes(A, run('B', [1000, 0], [1000, 1000], {}), [['B0', 'A1']])!.role as ContainmentRole).serves).toBeUndefined()
	})
	it('what named the absorbed run names the joined one', () => {
		const link = { type: 'link', id: 'K', via: ['X', 'B'] } as unknown as Link
		const outlet = { type: 'outlet', id: 'O', hostShapeId: 'B' } as unknown as Outlet
		const leader = { type: 'shape', id: 'LD', levelId: 'L', geom: { kind: 'leader', pts: [{ x: 0, y: 0 }], attach: 'B' } } as unknown as Shape
		const pen = { type: 'shape', id: 'P', levelId: 'L', role: { kind: 'penetration', diaMm: 50, through: 'wall', source: { run: 'B', seg: 'Bs', host: 'W' } }, geom: { kind: 'circle', centre: { x: 0, y: 0 }, r: 25 } } as unknown as Shape
		const line = { type: 'shape', id: 'LN', levelId: 'L', geom: { kind: 'path', nodes: [{ id: 'q', x: 0, y: 0, z: 0, attach: 'B' }], segs: [] } } as unknown as Shape
		const sheet = { type: 'sheet', id: 'S', viewports: [{ id: 'V', view: { levelId: 'L', spec: { kind: 'fill', shapeId: 'B', segId: 'Bs' } } }] } as unknown as Sheet
		const out = new Map<string, Entity>(repointRefs([link, outlet, leader, pen, line, sheet] as Entity[], 'B', () => 'A').map((e) => [e.id, e]))
		expect((out.get('K') as Link).via).toEqual(['X', 'A'])
		expect((out.get('O') as Outlet).hostShapeId).toBe('A')
		expect((out.get('LD') as Shape).geom).toMatchObject({ attach: 'A' })
		expect(((out.get('P') as Shape).role as { source: unknown }).source).toEqual({ run: 'A', seg: 'Bs', host: 'W' })
		expect(((out.get('LN') as Shape).geom as { nodes: { attach: string }[] }).nodes[0].attach).toBe('A')
		expect((out.get('S') as Sheet).viewports[0].view.spec).toEqual({ kind: 'fill', shapeId: 'A', segId: 'Bs' })
	})
	it('split into pieces: hand cables go with their segment; a penetration / fill section follows its segment’s piece', () => {
		const A = run('A', [0, 0], [1000, 0], { extra: [{ type: 'Cat6', n: 4 }, { type: 'Power', n: 1, seg: 'Ys' }] })
		const g = A.geom as Extract<Shape['geom'], { kind: 'path' }>
		const two = { ...A, geom: { ...g, nodes: [...g.nodes, n('Y0', 0, 500), n('Y1', 1000, 500)], segs: [...g.segs, { id: 'Ys', a: 'Y0', b: 'Y1' }] } } as Shape
		const [p0, p1] = pieces(two)
		expect((p0.role as ContainmentRole).extra).toEqual([{ type: 'Cat6', n: 4 }])
		expect((p1.role as ContainmentRole).extra).toEqual([{ type: 'Cat6', n: 4 }, { type: 'Power', n: 1, seg: 'Ys' }])
		const pen = { type: 'shape', id: 'P', levelId: 'L', role: { kind: 'penetration', diaMm: 50, through: 'wall', source: { run: 'A', seg: 'Ys', host: 'W' } }, geom: { kind: 'circle', centre: { x: 0, y: 0 }, r: 25 } } as unknown as Shape
		const stay = { ...pen, id: 'P2', role: { kind: 'penetration', diaMm: 50, through: 'wall', source: { run: 'A', seg: 'As', host: 'W' } } } as Shape
		const out = pieceRefs([pen, stay], two, [p0, p1])
		expect(out.map((e) => [e.id, ((e as Shape).role as { source: { run: string } }).source.run])).toEqual([['P', p1.id]])
	})
})
