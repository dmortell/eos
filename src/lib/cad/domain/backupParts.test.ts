import { describe, it, expect } from 'vitest'
import { inParts, floorsOf, partsLabel } from './backupParts'
import { demoProject } from './fixtures'
import type { Entity } from './drawing'
import type { Level, Outlet, Link } from './types'

const heights = { slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2700, plenumMm: 800 }
const level = (id: string, number: number, name: string, area?: string): Level =>
	({ type: 'level', id, buildingId: 'B', number, name, order: number + (area ? 0.5 : 0), elevationMm: number * 4000, heights, ...(area ? { area } : {}) })

/** demoProject's 33F (L33, with the rack, panel P1 and outlets O1 / O2) split in two area plans: L33 becomes
 *  "33F 3303", L3307 is "33F 3307" with outlet O9 served from P1; and 32F with nothing on it. */
function journey(): Entity[] {
	const base = demoProject().map((e) => (e.type === 'level' ? { ...e, name: '33F 3303', area: '3303' } : e))
	const o9: Outlet = { type: 'outlet', id: 'O9', levelId: 'L3307', label: '33-901', tier: 'low', usage: 'desk', mount: 'floor', ports: [{ port: 1, label: '33-901.A', cableType: 'cat6a' }] }
	const k9: Link = { type: 'link', id: 'K9', kind: 'horizontal', a: { on: 'P1', port: 9, face: 'rear' }, b: { on: 'O9', port: 1 }, status: 'design' }
	return [...base, level('L3307', 33, '33F 3307', '3307'), level('L32', 32, '32F'), o9, k9,
		{ type: 'shape', id: 'TXT', levelId: 'L3307', groupId: 'G1', geom: { kind: 'text', at: { x: 0, y: 0 }, text: 'x', sizeMm: 2.5 } },
		{ type: 'group', id: 'G1', parentId: 'G0' }, { type: 'group', id: 'G0' }, { type: 'group', id: 'G-other' },
		{ type: 'sheet', id: 'S1', number: '001', title: 'Plan', order: 0, paper: { size: 'A1', orientation: 'landscape', marginMm: 10 }, viewports: [], status: 'active' },
	]
}

describe('backup parts', () => {
	it('a model holds what stands on it, not another model', () => {
		const { inside } = inParts(journey(), ['L33'])
		for (const id of ['L33', 'Z3', 'SR-A', 'R1', 'P1', 'SW1', 'O1', 'O2', 'K1', 'K4', 'C1', 'C2', 'T1', 'PEN1']) expect(inside.has(id), id).toBe(true)
		for (const id of ['L3307', 'O9', 'TXT', 'G1', 'L32', 'B', 'S1', 'settings']) expect(inside.has(id), id).toBe(false)
	})
	it('a link between two area plans crosses the edge unless both are chosen', () => {
		const one = inParts(journey(), ['L3307'])
		expect(one.inside.has('K9')).toBe(true)
		expect(one.crossing.get('K9')).toBe('a')   // the panel end is outside
		expect(inParts(journey(), ['L33']).crossing.get('K9')).toBe('b')
		const both = inParts(journey(), ['L33', 'L3307'])
		expect(both.inside.has('K9')).toBe(true)
		expect(both.crossing.size).toBe(0)
	})
	it('a model takes the groups its shapes are in, with their parents', () => {
		const { inside } = inParts(journey(), ['L3307'])
		expect(['TXT', 'G1', 'G0'].every((id) => inside.has(id))).toBe(true)
		expect(inside.has('G-other')).toBe(false)
	})
	it("'all' holds everything", () => {
		const all = journey(), { inside, crossing } = inParts(all, 'all')
		expect(inside.size).toBe(all.length)
		expect(crossing.size).toBe(0)
	})
	it('floors group their area plans, top floor first', () => {
		expect(floorsOf(journey())).toEqual([
			{ key: 'B:33', name: '33F', models: [{ id: 'L33', name: '33F 3303' }, { id: 'L3307', name: '33F 3307' }] },
			{ key: 'B:32', name: '32F', models: [{ id: 'L32', name: '32F' }] },
		])
	})
	it('labels read a whole floor as the floor', () => {
		const p = journey()
		expect(partsLabel(p, 'all')).toBe('Whole project')
		expect(partsLabel(p, ['L33', 'L3307'])).toBe('33F')
		expect(partsLabel(p, ['L32', 'L3307'])).toBe('33F 3307 + 32F')
	})
})
