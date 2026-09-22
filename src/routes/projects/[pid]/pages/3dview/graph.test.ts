import { describe, it, expect } from 'vitest'
import { adjacency, degree, runs, nodeMap, type GNode, type GSeg } from './graph'

// Small graph builders: nodes named by id at z=0; segments 'ab' connect a→b.
const N = (...ids: string[]): GNode[] => ids.map((id, i) => ({ id, x: i * 100, y: 0, z: 0 }))
const S = (...pairs: string[]): GSeg[] => pairs.map((p) => ({ id: p, a: p[0], b: p[1] }))

describe('adjacency / degree', () => {
	it('counts segment ends per node; an unknown node has degree 0', () => {
		const adj = adjacency(N('a', 'b', 'c'), S('ab', 'bc'))
		expect(degree(adj, 'a')).toBe(1)
		expect(degree(adj, 'b')).toBe(2)
		expect(degree(adj, 'c')).toBe(1)
		expect(degree(adj, 'zz')).toBe(0)
	})
	it('ignores a segment whose end node does not exist', () => {
		const adj = adjacency(N('a'), S('ab'))
		expect(degree(adj, 'a')).toBe(1)
		expect(adj.has('b')).toBe(false)
	})
})

describe('runs — chains through degree-2 nodes', () => {
	it('an open path is one open run in order', () => {
		const r = runs(N('a', 'b', 'c'), S('ab', 'bc'))
		expect(r).toHaveLength(1)
		expect(r[0].nodeIds).toEqual(['a', 'b', 'c'])
		expect(r[0].segIds).toEqual(['ab', 'bc'])
		expect(r[0].closed).toBe(false)
	})
	it('a pure cycle is one closed run that repeats its start node', () => {
		const r = runs(N('a', 'b', 'c', 'd'), S('ab', 'bc', 'cd', 'da'))
		expect(r).toHaveLength(1)
		expect(r[0].closed).toBe(true)
		expect(r[0].nodeIds[0]).toBe(r[0].nodeIds[r[0].nodeIds.length - 1])
		expect(r[0].segIds).toHaveLength(4)
	})
	it('a junction (degree ≥ 3) breaks runs — a T gives three single-segment runs', () => {
		const r = runs(N('a', 'b', 'c', 'd'), S('ab', 'bc', 'bd'))
		expect(r).toHaveLength(3)
		for (const run of r) { expect(run.segIds).toHaveLength(1); expect(run.closed).toBe(false) }
		expect(r.map((x) => x.segIds[0]).sort()).toEqual(['ab', 'bc', 'bd'])
	})
	it('a profile change breaks a run even through a degree-2 node', () => {
		const r = runs(N('a', 'b', 'c', 'd'), S('ab', 'bc', 'cd'), (id) => (id === 'bc' ? 'thick' : 'thin'))
		// endpoint-started runs come first (ab, cd); the orphaned middle segment is swept up last
		expect(r.map((x) => x.segIds).sort()).toEqual([['ab'], ['bc'], ['cd']])
		expect(r.every((x) => x.segIds.length === 1)).toBe(true)
	})
	it('covers every segment exactly once, mixing an open path and a separate cycle', () => {
		const segs = S('ab', 'bc', 'xy', 'yz', 'zx')
		const r = runs(N('a', 'b', 'c', 'x', 'y', 'z'), segs)
		const seen = r.flatMap((x) => x.segIds).sort()
		expect(seen).toEqual(segs.map((s) => s.id).sort())
		expect(r.filter((x) => x.closed)).toHaveLength(1)
	})
	it('an empty graph yields no runs', () => {
		expect(runs([], [])).toEqual([])
	})
})

describe('nodeMap', () => {
	it('indexes nodes by id', () => {
		const nm = nodeMap(N('a', 'b'))
		expect(nm.get('b')?.x).toBe(100)
		expect(nm.get('q')).toBeUndefined()
	})
})
