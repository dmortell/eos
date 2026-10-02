// Interconnects: bulk panel ↔ panel cables (backbone between rooms, tie within one), skipping busy ports.
import { describe, it, expect } from 'vitest'
import { ProjectIndex } from './project'
import { bulkInterconnect, riserRuns } from './interconnect'
import type { Entity } from './drawing'

const rack = (id: string, spaceId: string, levelId = 'L1') => ({ type: 'rack', id, levelId, spaceId, order: 1, name: id, kind: '4-post', heightU: 42, widthMm: 600, depthMm: 1000 })
const panel = (id: string, rackId: string) => ({ type: 'device', id, rackId, name: id, kind: 'panel', u: 40, heightU: 1, face: 'front', portCount: 24 })
const ix = (extra: unknown[] = []) => new ProjectIndex([
	{ type: 'level', id: 'L1', name: '1F', number: 1, elevationMm: 0, order: 1, heights: {} }, { type: 'level', id: 'L4', name: '4F', number: 4, elevationMm: 12000, order: 4, heights: {} },
	rack('A', 'S1'), rack('B', 'S4', 'L4'), rack('C', 'S1'), panel('PP1', 'A'), panel('PP2', 'B'), panel('PP3', 'C'), ...extra,
] as Entity[])

describe('interconnects', () => {
	it('24 ports between rooms → 24 backbone links, port for port, with the cable type and riser', () => {
		const r = bulkInterconnect(ix(), { on: 'PP1', ports: Array.from({ length: 24 }, (_, i) => i + 1), face: 'rear' }, { on: 'PP2', start: 1, face: 'rear' }, { cableType: 'cat6a', via: 'V1' })
		expect(r.skipped).toEqual([])
		expect(r.links).toHaveLength(24)
		expect(r.links[23]).toMatchObject({ kind: 'backbone', a: { on: 'PP1', port: 24, face: 'rear' }, b: { on: 'PP2', port: 24, face: 'rear' }, cableType: 'cat6a', via: 'V1' })
	})
	it('within one room it is a tie; busy ports are skipped on both sides', () => {
		const busy = { type: 'link', id: 'X', kind: 'horizontal', a: { on: 'PP3', port: 1 }, b: { on: 'O', port: 1 }, status: 'design' }
		const busyA = { type: 'link', id: 'Y', kind: 'horizontal', a: { on: 'PP1', port: 2 }, b: { on: 'O', port: 2 }, status: 'design' }
		const r = bulkInterconnect(ix([busy, busyA]), { on: 'PP1', ports: [1, 2, 3] }, { on: 'PP3', start: 1 }, { cableType: 'cat6a' })
		expect(r.links.map((l) => [l.kind, l.a.port, l.b.port])).toEqual([['tie', 1, 2], ['tie', 3, 3]])
		expect(r.skipped).toEqual(['PP1 port 2 already has a cable'])
	})
	it('risers are runs that reach another level', () => {
		const riser = { type: 'shape', id: 'V1', levelId: 'L1', label: 'Riser A', geom: { kind: 'path', nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 0, y: 0, z: 0, levelId: 'L4' }], segs: [{ id: 's', a: 'a', b: 'b' }] }, role: { kind: 'containment', form: 'trunk', tier: 'low' } }
		const flat = { ...riser, id: 'T1', label: 'Tray', geom: { ...riser.geom, nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 9, y: 0, z: 0 }] } }
		expect(riserRuns(ix([riser, flat]))).toEqual([{ id: 'V1', label: 'Riser A' }])
	})
})
