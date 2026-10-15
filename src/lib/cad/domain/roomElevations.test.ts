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

describe('the plan shows a room\'s elevations as one marker (Dave 2026-10-15)', () => {
	it('a circle and a lettered pointer per section, picking it — no cut lines for them; another section keeps its line', async () => {
		const { planDisplayList } = await import('../views/plan')
		const { ProjectIndex } = await import('./project')
		const level = { type: 'level', id: 'L1', name: '1F', number: 1, order: 1, elevationMm: 0, heights: { slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2600, plenumMm: 700 } }
		let i = 0
		const secs = roomElevations(room, () => `E${i++}`)
		const other = { type: 'section', id: 'X', levelId: 'L1', name: 'Section X', a: { x: 0, y: 5000 }, b: { x: 4000, y: 5000 }, depth: 1000 }
		const ps = planDisplayList(new ProjectIndex([level, room, ...secs, other] as never[]), 'L1', { scale: 100 })
		expect(ps.filter((p) => p.cls === 'elev-marker')).toHaveLength(1)
		expect(ps.filter((p) => p.cls === 'section-arrow' && secs.some((s) => s.id === p.src))).toHaveLength(4)
		expect(ps.filter((p) => p.k === 'text' && p.cls === 'elev-marker-letter').map((p) => (p.k === 'text' ? p.text : ''))).toEqual(['A', 'B', 'C', 'D'])
		expect(ps.filter((p) => p.cls === 'section-line').map((p) => p.src)).toEqual(['X'])
	})
})
