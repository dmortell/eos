// Guides: picking one, snapping onto one or a crossing, adding without doubles.
import { describe, it, expect } from 'vitest'
import { guideAt, guideSnap, addGuides, type Guide } from './guides'

const gs: Guide[] = [{ id: 'a', axis: 'v', at: 1000 }, { id: 'b', axis: 'h', at: 500 }, { id: 'c', axis: 'v', at: 3000 }]

describe('guides', () => {
	it('the guide nearest the point within the tolerance', () => {
		expect(guideAt(gs, { x: 1010, y: 9000 }, 20)?.id).toBe('a')
		expect(guideAt(gs, { x: 2000, y: 9000 }, 20)).toBeUndefined()
		expect(guideAt(gs, { x: 1015, y: 505 }, 20)?.id).toBe('b')   // the horizontal one is nearer
	})
	it('snaps onto a crossing when both are near, else square onto the nearest, else not at all', () => {
		expect(guideSnap(gs, { x: 1008, y: 492 }, 20)).toEqual({ x: 1000, y: 500 })
		expect(guideSnap(gs, { x: 2990, y: 7000 }, 20)).toEqual({ x: 3000, y: 7000 })
		expect(guideSnap(gs, { x: 2000, y: 2000 }, 20)).toBeNull()
	})
	it('adds a vertical, a horizontal or both through the point, never twice', () => {
		let n = 0
		const id = () => `g${++n}`
		expect(addGuides([], { x: 12.345, y: 7 }, 'v', id)).toEqual([{ id: 'g1', axis: 'v', at: 12.35 }])
		const both = addGuides(gs, { x: 1000, y: 800 }, 'both', id)
		expect(both.filter((g) => g.axis === 'v' && g.at === 1000)).toHaveLength(1)
		expect(both.at(-1)).toMatchObject({ axis: 'h', at: 800 })
	})
})
