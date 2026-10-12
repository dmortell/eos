// Segment lengths of a run / wall (3D: a drop counts its height), and their total.
import { describe, it, expect } from 'vitest'
import { segmentLengths, splitRunsAt, runZAt } from './pathEdit'
import type { Shape } from './shapes'

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
	it('drawn at another height, the new run drops to it: runZAt finds the run’s height under the point', () => {
		expect(runZAt([trunk], 'L', { x: 1500, y: 0 }, 2950)).toBe(2600)
		expect(runZAt([trunk], 'L', { x: 1500, y: 300 }, 2950)).toBeNull()
	})
})
