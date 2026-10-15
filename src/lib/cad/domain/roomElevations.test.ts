// Room elevations A–D (Dave 2026-10-15): four sections, each looking at one wall from inside the room.
import { describe, it, expect } from 'vitest'
import { roomElevations, PAST_WALL_MM } from './roomElevations'
import { sectionFrame } from '../views/sectionMarks'
import type { Space } from './types'

const room = { type: 'space', id: 'R', levelId: 'L1', kind: 'eps', name: 'EPS 1', order: 1, boundary: [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }] } as Space

describe('room elevations', () => {
	let n = 0
	const secs = roomElevations(room, () => `S${n++}`)
	it('four, named after the room, each looking at its wall from the middle, reaching just past it', () => {
		expect(secs.map((s) => s.name)).toEqual(['EPS 1 A', 'EPS 1 B', 'EPS 1 C', 'EPS 1 D'])
		const look = secs.map((s) => { const { f } = sectionFrame(s); return { x: Math.round(-f.n.x) + 0, y: Math.round(-f.n.y) + 0 } })
		expect(look).toEqual([{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }])
		expect(secs.map((s) => s.depth)).toEqual([1500, 2000, 1500, 2000].map((d) => d + PAST_WALL_MM))
		// as wide as the room, through its middle
		expect(secs[0]).toMatchObject({ a: { x: 0, y: 1500 }, b: { x: 4000, y: 1500 } })
		expect(Math.hypot(secs[1].b.x - secs[1].a.x, secs[1].b.y - secs[1].a.y)).toBe(3000)
	})
	it('names already on the level are skipped; no outline, none', () => {
		expect(roomElevations(room, () => 'x', ['EPS 1 A', 'EPS 1 C']).map((s) => s.name)).toEqual(['EPS 1 B', 'EPS 1 D'])
		expect(roomElevations({ ...room, boundary: undefined }, () => 'x')).toEqual([])
	})
})
