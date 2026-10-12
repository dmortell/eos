// The backbone cable list and the links table rows (Dave, 2026-10-05).
import { describe, it, expect } from 'vitest'
import { ProjectIndex } from './project'
import { cableGroups, cableColour, linkRows } from './cableList'
import type { Entity } from './drawing'

const level = (id: string, name: string, order: number) => ({ type: 'level', id, buildingId: 'B', number: order, name, order, elevationMm: order * 4000 }) as Entity
const room = (id: string, levelId: string, name: string) => ({ type: 'space', id, levelId, kind: 'server room', name, order: 1 }) as Entity
const rack = (id: string, levelId: string, spaceId: string, name: string) => ({ type: 'rack', id, levelId, spaceId, name, order: 1, kind: '4-post', widthMm: 600, depthMm: 1000, heightU: 42 }) as Entity
const panel = (id: string, rackId: string, name: string) => ({ type: 'device', id, rackId, name, u: 40, heightU: 1, portCount: 24 }) as Entity
const link = (id: string, kind: 'horizontal' | 'tie' | 'backbone', a: string, b: string, port: number, cableType?: string) =>
	({ type: 'link', id, kind, a: { on: a, port }, b: { on: b, port }, status: 'design', ...(cableType ? { cableType } : {}) }) as Entity

const ents: Entity[] = [
	level('L1', '1F', 1), level('L2', '2F', 2), level('L3', '3F', 3), level('L4', '4F', 4),
	room('S1', 'L1', 'MDF'), room('S4', 'L4', 'IDF4'),
	rack('R1', 'L1', 'S1', 'A01'), rack('R1b', 'L1', 'S1', 'A02'), rack('R4', 'L4', 'S4', 'B01'),
	panel('P1', 'R1', 'FP01'), panel('P1b', 'R1b', 'FP02'), panel('P4', 'R4', 'FP01'),
	// listed 4F-end first: the list still starts at the lower floor
	link('k1', 'backbone', 'P4', 'P1', 1, 'OS2 12c'), link('k2', 'backbone', 'P4', 'P1', 2, 'OS2 12c'), link('k3', 'backbone', 'P1', 'P4', 3, 'Cat6A'),
	link('t1', 'tie', 'P1', 'P1b', 10, 'OM4'),
]

describe('cable list', () => {
	it('one group per panel pair and type: lowest floor first, transit floors counted, jacket colors', () => {
		const g = cableGroups(new ProjectIndex(ents))
		expect(g.map((x) => [x.kind, x.links.length, x.type, x.floors])).toEqual([
			['tie', 1, 'OM4', '1F'],
			['backbone', 2, 'OS2 12c', '1F → 4F (2 transit)'],
			['backbone', 1, 'Cat6A', '1F → 4F (2 transit)'],
		])
		const os2 = g.find((x) => x.type === 'OS2 12c')!
		expect(os2).toMatchObject({ a: '1F MDF A01 · FP01', b: '4F IDF4 B01 · FP01', floors: '1F → 4F (2 transit)', colour: '#facc15' })
		expect(os2.links.sort()).toEqual(['k1', 'k2'])
		expect(g.find((x) => x.kind === 'tie')).toMatchObject({ floors: '1F', colour: '#22d3ee' })
		expect(g).toHaveLength(3)
		expect(cableColour('Cat6A')).toBe('#64748b')
	})
	it('link rows: a horizontal link is a "run"; both ends, type and status', () => {
		const rows = linkRows(new ProjectIndex(ents), (id) => (id === 'k1' ? 42 : undefined))
		expect(rows).toHaveLength(4)
		expect(rows.find((r) => r.id === 'k1')).toMatchObject({ kind: 'backbone', a: 'B01 · FP01 : 1', b: 'A01 · FP01 : 1', cableType: 'OS2 12c', status: 'design', lengthM: 42 })
		expect(rows.find((r) => r.id === 't1')?.label).toMatch(/^A01~A02:/)
	})
})
