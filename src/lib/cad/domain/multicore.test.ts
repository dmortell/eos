// Multi-core cables: Link to… puts the cores into cables of the type's cores; fill, the BOM, the cable schedule, the
// cable list and validation count a cable once.
import { describe, it, expect } from 'vitest'
import { ProjectIndex } from './project'
import { bulkInterconnect } from './interconnect'
import { cablesOf, coreLabels, coresOf, intoCables } from './multicore'
import { fillBySegment } from './fill'
import { cableMetres, type Route } from './routing'
import { cableSchedule } from './cableSchedule'
import { cableGroups, linkRows } from './cableList'
import { validateProject } from './validate'
import type { Entity } from './drawing'
import type { Link } from './types'

const settings = { type: 'settings', id: 'settings', portSuffix: 'alpha', usages: [], defaults: {}, cableTypes: [
	{ id: 'os2-12', label: 'OS2 12-core', media: 'fibre', color: '', diameterMm: 6, cores: 12 }, { id: 'cat6a', label: 'Cat6A', media: 'copper', color: '' }] }
const rack = (id: string, spaceId: string, levelId: string) => ({ type: 'rack', id, levelId, spaceId, order: 1, name: id, kind: '4-post', heightU: 42, widthMm: 600, depthMm: 1000 })
const panel = (id: string, rackId: string) => ({ type: 'device', id, rackId, name: id, kind: 'panel', u: 40, heightU: 1, face: 'front', portCount: 24 })
const run = { type: 'shape', id: 'T1', levelId: 'L1', section: { w: 100, h: 50 }, role: { kind: 'containment', form: 'trunk', tier: 'low' },
	geom: { kind: 'path', nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 1000, y: 0, z: 0 }], segs: [{ id: 's0', a: 'a', b: 'b' }] } }
const base = [
	{ type: 'level', id: 'L1', name: '1F', number: 1, elevationMm: 0, order: 1, heights: {} }, { type: 'level', id: 'L4', name: '4F', number: 4, elevationMm: 12000, order: 4, heights: {} },
	rack('A', 'S1', 'L1'), rack('B', 'S4', 'L4'), panel('PP1', 'A'), panel('PP2', 'B'), settings, run,
] as Entity[]
/** 18 ports PP1 → PP2 on the 12-core type: a 12-core cable and a 6-core one. */
const linked = () => bulkInterconnect(new ProjectIndex(base), { on: 'PP1', ports: Array.from({ length: 18 }, (_, i) => i + 1) }, { on: 'PP2', start: 1 }, { cableType: 'os2-12', cores: 12 }).links

describe('multi-core cables', () => {
	it('Link to… on a 12-core type: 18 ports → one full cable and one with 6 cores', () => {
		const links = linked()
		expect(links).toHaveLength(18)
		expect(cablesOf(links).map((g) => g.length)).toEqual([12, 6])
		expect(new Set(links.map((l) => l.cable)).size).toBe(2)
		expect(coresOf(settings as never, 'os2-12')).toBe(12)
		expect(coresOf(settings as never, 'cat6a')).toBe(1)
		expect(intoCables(links.map(({ cable: _c, ...l }) => l as Link), 1).every((l) => !l.cable)).toBe(true)
		const labels = coreLabels(links, () => 12)
		expect([labels.get(links[0].id), labels.get(links[17].id)]).toEqual(['core 1 of 12', 'core 6 of 12'])
	})
	it('fill, the BOM, the cable schedule and the cable list count each cable once', () => {
		const links = linked(), ix = new ProjectIndex([...base, ...links])
		const routes = new Map<string, Route>(links.map((l) => [l.id, { linkId: l.id, segs: [{ shape: 'T1', seg: 's0' }], routeMm: 40_000, lengthM: 40 }]))
		const f = fillBySegment(ix, routes).get('T1:s0')!
		expect(f.cables).toEqual({ 'os2-12': 2 })
		expect(f.cableMm2).toBe(2 * 36)
		expect(cableMetres(ix, routes, { slackM: 0, wastePct: 0 })).toEqual([{ type: 'os2-12', metres: 80, links: 2, unrouted: 0 }])
		const rows = cableSchedule(ix, routes, { slackM: 0, wastePct: 0 })
		expect(rows.map((r) => [r.from, r.to, r.type])).toEqual([
			['A · PP1 : 1–12', 'B · PP2 : 1–12', 'os2-12 (12 of 12 cores)'],
			['A · PP1 : 13–18', 'B · PP2 : 13–18', 'os2-12 (6 of 12 cores)'],
		])
		const g = cableGroups(ix)
		expect(g.map((x) => [x.cables, x.links.length])).toEqual([[2, 18]])
		expect(linkRows(ix).find((r) => r.id === links[12].id)?.core).toBe('core 1 of 12')
	})
	it('more cores linked than the type has is a warning', () => {
		const links = linked().map((l) => ({ ...l, cable: 'C1' }))
		expect(validateProject([...base, ...links]).filter((i) => i.code === 'cable-cores').map((i) => i.message)).toEqual(['18 cores linked on a 12-core os2-12'])
	})
})
