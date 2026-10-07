// Segment lengths of a run / wall (3D: a drop counts its height), and their total.
import { describe, it, expect } from 'vitest'
import { segmentLengths } from './pathEdit'
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
