import { describe, it, expect } from 'vitest'
import type { Ent } from './geometry'
import { arrange } from './arrange'

const R = (id: string, x: number, y: number, w = 10, h = 10, groupId?: string): Ent => ({ id, type: 'rect', a: [x, y], b: [x + w, y + h], groupId })
const bb = (e: Ent): [number, number, number, number] => [Math.min(e.a![0], e.b![0]), Math.min(e.a![1], e.b![1]), Math.max(e.a![0], e.b![0]), Math.max(e.a![1], e.b![1])]

describe('align / distribute', () => {
	it('aligns to the extreme edge or the centre line; unmoved shapes are left out', () => {
		const out = arrange([R('a', 0, 0), R('b', 30, 5), R('c', 60, 20)], 'top', bb)
		expect(out.map((e) => [e.id, e.a![1]])).toEqual([['b', 0], ['c', 0]])
		const r = arrange([R('a', 0, 0, 10), R('b', 30, 5, 20)], 'right', bb)
		expect(r.map((e) => e.b![0])).toEqual([50])
		const c = arrange([R('a', 0, 0, 10), R('b', 0, 30, 30)], 'hcenter', bb)   // span 0..30 → centre 15
		expect(c.map((e) => [e.id, e.a![0]])).toEqual([['a', 10]])   // b already sits on the centre line
	})
	it('distributes equal gaps, first + last fixed; a group moves as one', () => {
		const out = arrange([R('a', 0, 0), R('b', 12, 0), R('c', 100, 0)], 'hspace', bb)   // span 110, sizes 30 → gap 40
		expect(out.map((e) => [e.id, e.a![0]])).toEqual([['b', 50]])
		const g = arrange([R('a', 0, 0), R('g1', 20, 50, 10, 10, 'G'), R('g2', 40, 50, 10, 10, 'G')], 'top', bb)
		expect(g.map((e) => [e.id, e.a![1]])).toEqual([['g1', 0], ['g2', 0]])
		expect(arrange([R('a', 0, 0)], 'left', bb)).toEqual([])
	})
})
