import { describe, it, expect } from 'vitest'
import { joinGraph, mergeNodes, joinNewConduit, compatible, coincidentNodes } from './graphJoin'
import type { Obj } from './types'

let k = 0
const uid = (p: string) => `${p}${++k}`
const n = (id: string, x: number, y = 0, z = 0) => ({ id, x, y, z })
const cond = (id: string, pts: [string, number, number][], extra: Partial<Obj> = {}) => ({
	type: 'conduit', id, w: 100, h: 50, edges: 4, layer: 'trunks',
	nodes: pts.map(([nid, x, y]) => n(nid, x, y)),
	segments: pts.slice(1).map((p, i) => ({ id: `${id}s${i}`, a: pts[i][0], b: p[0] })), ...extra,
}) as Extract<Obj, { type: 'conduit' }>

describe('conduit join (F3)', () => {
	it('node on node: the new run shares the node', () => {
		const a = cond('A', [['a1', 0, 0], ['a2', 1000, 0]]), b = cond('B', [['b1', 1005, 0], ['b2', 1000, 800]])
		expect(joinGraph(a, b, 10, uid)).toBe(true)
		expect(a.nodes.map((x) => x.id)).toEqual(['a1', 'a2', 'b2'])
		expect(a.segments.map((s) => `${s.a}-${s.b}`)).toEqual(['a1-a2', 'a2-b2'])
	})
	it('an end on a segment splits it (a T), and nothing touching changes nothing', () => {
		const a = cond('A', [['a1', 0, 0], ['a2', 1000, 0]]), b = cond('B', [['b1', 500, 3], ['b2', 500, 900]])
		expect(joinGraph(a, b, 10, uid)).toBe(true)
		expect(a.nodes).toHaveLength(4); expect(a.segments).toHaveLength(3)
		const far = cond('C', [['c1', 0, 5000], ['c2', 10, 6000]])
		expect(joinGraph(a, far, 10, uid)).toBe(false); expect(a.nodes).toHaveLength(4)
	})
	it('a new run bridging two conduits makes them one; incompatible profiles stay apart', () => {
		const A = cond('A', [['a1', 0, 0], ['a2', 1000, 0]]), B = cond('B', [['b1', 3000, 0], ['b2', 4000, 0]]), P = cond('P', [['p1', 0, 0], ['p2', 0, 900]], { w: 25 })
		const objs: Obj[] = [A, B, P]
		const run = cond('R', [['r1', 1000, 0], ['r2', 3000, 0]])
		expect(joinNewConduit(objs, run, 10, uid)).toBe(A)
		expect(objs).toEqual([A, P])
		expect(A.segments).toHaveLength(3)
		expect(compatible(A, P)).toBe(false)
	})
	it('merging two nodes of one graph drops the collapsed segment', () => {
		const a = cond('A', [['a1', 0, 0], ['a2', 1000, 0], ['a3', 1000, 1000]])
		mergeNodes(a, 'a1', 'a3')
		expect(a.nodes.map((x) => x.id)).toEqual(['a1', 'a2'])
		expect(a.segments.map((s) => `${s.a}-${s.b}`)).toEqual(['a1-a2'])   // a2-a1 duplicates a1-a2
	})
})

describe('coincident nodes (F5)', () => {
	it('finds other objects\' nodes on the same point (not its own)', () => {
		const A = cond('A', [['a1', 0, 0], ['a2', 1000, 0]]), P = cond('P', [['p1', 1000, 0], ['p2', 1000, 500]], { w: 25 }), F = cond('F', [['f1', 3000, 0], ['f2', 4000, 0]])
		expect(coincidentNodes([A, P, F], A, A.nodes[1]).map((x) => x.id)).toEqual(['p1'])
		expect(coincidentNodes([A, P, F], A, A.nodes[0])).toEqual([])
	})
})
