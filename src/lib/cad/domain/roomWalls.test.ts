// Walls from a room (Dave 2026-10-15).
import { describe, it, expect } from 'vitest'
import { offsetOutline, wallsRound } from './roomWalls'
import type { Space } from './types'

describe('walls round a room', () => {
	const box = [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }]
	it('the centreline is half a wall outside the outline, whichever way it was drawn', () => {
		expect(offsetOutline(box, 50)).toEqual([{ x: -50, y: -50 }, { x: 4050, y: -50 }, { x: 4050, y: 3050 }, { x: -50, y: 3050 }])
		expect(offsetOutline([...box].reverse(), 50)).toEqual([{ x: -50, y: 3050 }, { x: 4050, y: 3050 }, { x: 4050, y: -50 }, { x: -50, y: -50 }])
	})
	it('one closed wall (4 segments), slab to slab by default, on the room\'s level', () => {
		const w = wallsRound({ type: 'space', id: 'R', levelId: 'L1', kind: 'room', name: 'IDF2', order: 1, boundary: box } as Space, 100)!
		expect(w.levelId).toBe('L1')
		expect(w.geom.kind === 'path' && w.geom.segs.length).toBe(4)
		expect(w.role).toMatchObject({ kind: 'wall', slabToSlab: true })
		expect(w.section?.w).toBe(100)
	})
})
