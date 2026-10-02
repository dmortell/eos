// The riser view: floors, rooms at their racks' x, risers between levels, backbone groups with counts and lengths.
import { describe, it, expect } from 'vitest'
import { ProjectIndex } from '../domain/project'
import { riserDisplayList, riserShafts } from './riser'
import type { Entity } from '../domain/drawing'

const level = (id: string, name: string, e: number) => ({ type: 'level', id, name, number: 1, elevationMm: e, order: 1, heights: { slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2600, plenumMm: 700 } })
const path = (id: string, levelId: string, pts: [number, number, number, string?][], label?: string) => ({
	type: 'shape', id, levelId, label, section: { w: 100, h: 50 }, role: { kind: 'containment', form: 'trunk', tier: 'low' },
	geom: { kind: 'path', nodes: pts.map(([x, y, z, l], i) => ({ id: `${id}${i}`, x, y, z, ...(l ? { levelId: l } : {}) })), segs: pts.slice(1).map((_, i) => ({ id: `${id}s${i}`, a: `${id}${i}`, b: `${id}${i + 1}` })) },
})
const ents = [
	level('L1', '1F', 0), level('L4', '4F', 11400),
	{ type: 'space', id: 'S1', levelId: 'L1', name: 'IDF1', kind: 'server room' }, { type: 'space', id: 'S4', levelId: 'L4', name: 'Server room A', kind: 'server room' },
	{ type: 'rack', id: 'R1', levelId: 'L1', spaceId: 'S1', order: 1, name: 'P3A', kind: '2-post', heightU: 45, widthMm: 600, depthMm: 520, at: { x: 10495, y: -2727 } },
	{ type: 'rack', id: 'R4', levelId: 'L4', spaceId: 'S4', order: 1, name: '4AR01', kind: '4-post', heightU: 42, widthMm: 700, depthMm: 800, at: { x: 10495, y: -1500 } },
	{ type: 'device', id: 'PP1', rackId: 'R1', name: 'PP1', kind: 'panel', u: 41, heightU: 1, face: 'both', portCount: 24 },
	{ type: 'device', id: 'PP2', rackId: 'R4', name: 'PP2', kind: 'panel', u: 10, heightU: 1, face: 'both', portCount: 24 },
	path('TR1', 'L1', [[7920, -2600, 2600], [10210, -2600, 2600]]),
	path('RA', 'L1', [[10210, -2600, 2600], [10210, -2600, 0, 'L4']], 'Riser A'),
	path('T4', 'L4', [[10210, -2600, 0], [10210, -1500, 0]]),
	...[1, 2].map((n) => ({ type: 'link', id: `B${n}`, kind: 'backbone', a: { on: 'PP1', port: n, face: 'rear' }, b: { on: 'PP2', port: n, face: 'rear' }, cableType: 'cat6a', status: 'design' })),
] as Entity[]

describe('riser view', () => {
	const ix = new ProjectIndex(ents)
	it('finds risers: vertical runs between levels', () => {
		expect(riserShafts(ix).map((s) => [s.s.id, s.z0, s.z1])).toEqual([['RA', 2600, 11400]])
	})
	it('draws floors, rooms, the riser and one backbone group through it', () => {
		const ps = riserDisplayList(ix)
		expect(ps.filter((p) => p.k === 'line' && p.cls === 'riser-ffl').map((p) => p.k === 'line' && p.pts[0].y)).toEqual([-0, -11400])
		expect(ps.filter((p) => p.k === 'line' && p.cls === 'riser-room').map((p) => p.src)).toEqual(['S1', 'S4'])
		const bb = ps.filter((p) => p.k === 'line' && p.cls === 'backbone')
		expect(bb).toHaveLength(1)
		expect(bb[0].k === 'line' && bb[0].pts.length).toBe(4)   // room → riser → up → room
		const label = ps.find((p) => p.k === 'text' && p.cls === 'backbone-label')
		expect(label?.k === 'text' && label.text).toMatch(/^2 × cat6a · \d+m$/)
	})
	it('says so when there is nothing to show', () => {
		const ps = riserDisplayList(new ProjectIndex([level('L1', '1F', 0)] as Entity[]))
		expect(ps[0]).toMatchObject({ k: 'text', text: 'No risers or placed server rooms yet' })
	})
})
