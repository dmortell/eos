// Cable routing over drawn containment (Phase 5.1–5.2): drops at both ends, tees, risers to another level, the
// tier / room filters, lengths with slack (rounded up), the 90 m flag, a hand-set length winning, and BOM metres.
import { describe, it, expect } from 'vitest'
import { ProjectIndex } from './project'
import { routeLinks, cableMetres, panelZ, boxNote, viaValue } from './routing'
import { cableSchedule, scheduleTotals } from './cableSchedule'
import type { Entity } from './drawing'
import type { Shape } from './shapes'

const level = (id: string, elevationMm: number) => ({ type: 'level', id, name: id, number: 1, elevationMm, order: 1, heights: { slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2600, plenumMm: 700 } })
/** A containment run through points (z = height above its level); `to` puts the LAST node on another level (a riser). */
function run(id: string, levelId: string, pts: [number, number, number][], tier: 'low' | 'high' = 'low', o: { serves?: string[]; toLevel?: string } = {}): Shape {
	const nodes = pts.map(([x, y, z], i) => ({ id: `${id}n${i}`, x, y, z, ...(o.toLevel && i === pts.length - 1 ? { levelId: o.toLevel } : {}) }))
	return {
		type: 'shape', id, levelId, geom: { kind: 'path', nodes, segs: nodes.slice(1).map((n, i) => ({ id: `${id}s${i}`, a: nodes[i].id, b: n.id })) },
		section: { w: 100, h: 50 }, role: { kind: 'containment', form: 'trunk', tier, ...(o.serves ? { serves: o.serves } : {}) },
	} as Shape
}
const DEV = { type: 'device', id: 'P1', rackId: 'R1', name: 'P1', kind: 'panel', u: 40, heightU: 1, face: 'front', portCount: 24 }
const RACK_DROP = 500 + panelZ(DEV as never)   // rack at (0,0), the trunk at y = 500, z 0
const outlet = (id: string, levelId: string, x: number, y: number, tier: 'low' | 'high' = 'low') =>
	({ type: 'outlet', id, levelId, label: id, tier, usage: 'desk', mount: 'floor', at: { x, y }, ports: [{ port: 1, label: `${id}.A`, serverRoomId: 'S', cableType: 'cat6a' }] })
const link = (id: string, outletId: string, port = 1) => ({ type: 'link', id, kind: 'horizontal', a: { on: 'P1', port }, b: { on: outletId, port: 1 }, cableType: 'cat6a', status: 'design' })

function project(extra: unknown[] = []) {
	return new ProjectIndex([
		level('L1', 0), level('L2', 4000),
		{ type: 'space', id: 'S', levelId: 'L1', name: 'IDF', kind: 'serverRoom' },
		{ type: 'rack', id: 'R1', levelId: 'L1', spaceId: 'S', order: 1, name: 'R1', kind: '4-post', heightU: 42, widthMm: 600, depthMm: 1000, at: { x: 0, y: 0 } },
		DEV,
		run('T1', 'L1', [[0, 500, 0], [10000, 500, 0]]),
		...extra,
	] as Entity[])
}

describe('routing', () => {
	it('outlet → nearest run → along it → rack: drops at both ends; length = route + slack, rounded up', () => {
		const ix = project([outlet('O1', 'L1', 8000, 1500), link('K1', 'O1')])
		const r = routeLinks(ix, { slackM: 0.5, wastePct: 10 }).get('K1')!
		expect(r.problem).toBeUndefined()
		expect(r.routeMm).toBeCloseTo(RACK_DROP + 8000 + 1000)
		expect(r.lengthM).toBe(Math.ceil((RACK_DROP + 9000) / 1000 + 0.5))   // 11.36 + 0.5 → 12
		expect(r.segs).toEqual([{ shape: 'T1', seg: 'T1s0' }])
	})
	it('an outlet by a stub shorter than the join distance joins the run beside it, not the stub (Dave: Journey TV06 — a 38 mm end bit, "not connected")', () => {
		// T1 ends with a 38 mm bit going off sideways at x = 10000; the outlet is nearest that bit
		const stubbed = { ...run('T1', 'L1', [[0, 500, 0], [10000, 500, 0], [10000, 538, 0]]) }
		const ix = new ProjectIndex([...project().byId.values()].map((e) => (e.id === 'T1' ? stubbed : e)).concat([outlet('O1', 'L1', 10000, 1100), link('K1', 'O1')] as Entity[]))
		const r = routeLinks(ix, { slackM: 0.5, wastePct: 10 }).get('K1')!
		expect(r.problem).toBeUndefined()
		expect(r.segs).toEqual([{ shape: 'T1', seg: 'T1s0' }])
	})
	it('takes a tee branch (segments cut where another run meets them)', () => {
		const ix = project([run('B1', 'L1', [[5000, 500, 0], [5000, 5000, 0]]), outlet('O1', 'L1', 5300, 4000), link('K1', 'O1')])
		const r = routeLinks(ix).get('K1')!
		expect(r.routeMm).toBeCloseTo(RACK_DROP + 5000 + 3500 + 300)
		expect(r.segs).toEqual([{ shape: 'B1', seg: 'B1s0' }, { shape: 'T1', seg: 'T1s0' }])
	})
	it('climbs a riser to another level and joins its run there', () => {
		const ix = project([
			run('V1', 'L1', [[2000, 500, 0], [2000, 500, 0]], 'low', { toLevel: 'L2' }),   // the riser: L1 FFL → L2 FFL (4 m)
			run('T2', 'L2', [[2000, 500, 0], [2000, 6000, 0]]),
			outlet('O2', 'L2', 2500, 6000), link('K2', 'O2'),
		])
		const r = routeLinks(ix).get('K2')!
		expect(r.problem).toBeUndefined()
		expect(r.routeMm).toBeCloseTo(RACK_DROP + 2000 + 4000 + 5500 + 500)
		expect(r.segs.map((s) => s.shape)).toEqual(['T2', 'V1', 'T1'])
	})
	it('a riser ending at FFL meets a ceiling run straight above its end (the shaft carries on to the tray)', () => {
		const ix = project([
			run('V1', 'L1', [[2000, 500, 0], [2000, 500, 0]], 'low', { toLevel: 'L2' }),
			run('H2', 'L2', [[2000, 500, 2800], [2000, 6000, 2800]], 'high'),
			outlet('O2', 'L2', 2500, 6000, 'high'), link('K2', 'O2'),
		])
		const r = routeLinks(ix).get('K2')!
		expect(r.problem).toBeUndefined()
		expect(r.routeMm).toBeCloseTo(RACK_DROP + 2000 + 4000 + 2800 + 5500 + 500 + 2800)   // up the riser to L2 FFL, on to 2.8 m, along; the outlet drop is 2.8 m down
		expect(r.segs.map((s) => s.shape)).toEqual(['H2', 'V1', 'T1'])
	})
	it('only a riser’s far end reaches into that floor: a riser down from L2 does not meet L2’s own ceiling run above its top (walkthrough 2026-10-14)', () => {
		// L2's riser drops from its ceiling (2.95 m) to L1's FFL; an L2 ceiling run 3 m above L2's floor was reached from the riser TOP before
		const down = run('VD', 'L2', [[2000, 500, 2950], [2000, 500, 0]], 'high', { toLevel: 'L1' })
		const ix = project([
			down,
			run('U3', 'L2', [[2000, 500, 5950], [2000, 6000, 5950]], 'high'),   // 3 m above the riser's top: not on its far side
			outlet('O3', 'L2', 2500, 6000, 'high'), link('K3', 'O3'),
		])
		expect(routeLinks(ix).get('K3')!.problem).toBeDefined()
	})
	it('the tier and the room filter which run an outlet joins; no route says why', () => {
		const ix = project([
			run('H1', 'L1', [[0, 2000, 2800], [10000, 2000, 2800]], 'high'),   // nearer, but high: a low outlet skips it
			run('X1', 'L1', [[0, 1700, 0], [10000, 1700, 0]], 'low', { serves: ['OTHER'] }),   // nearer, but serves another room
			outlet('O1', 'L1', 8000, 1800), link('K1', 'O1'),
			outlet('O3', 'L1', 8000, 1800, 'high'), link('K3', 'O3', 2),
			outlet('O4', 'L2', 8000, 1800), link('K4', 'O4', 3),   // L2 has no runs
		])
		const routes = routeLinks(ix)
		expect(routes.get('K1')!.segs[0].shape).toBe('T1')
		expect(routes.get('K3')!.segs).toEqual([{ shape: 'H1', seg: 'H1s0' }])   // the high run passes within reach of the rack
		expect(routes.get('K4')!.problem).toBe("no low run within 10 m of the outlet serving its room — draw a low run within 10 m, or tick its server room in a run's Serves (Properties)")
	})
	it('an outlet more than 10 m (MAX_OUTLET_DROP_MM) from any run of its tier has no route', () => {
		const routes = routeLinks(project([outlet('O1', 'L1', 5000, 10400), link('K1', 'O1'), outlet('O2', 'L1', 5000, 10600), link('K2', 'O2', 2)]))
		expect(routes.get('K1')!.problem).toBeUndefined()   // 9.9 m from T1 (y 500)
		expect(routes.get('K2')!.problem).toMatch(/within 10 m/)   // 10.1 m
	})
	it('a rack joins only runs within reach, not one across the floor', () => {
		// F1 tees off T1 at (6000, 500) — runs that merely cross are NOT joined; a tee needs a node on the other run
		const ix = project([run('F1', 'L1', [[6000, 500, 0], [6000, 5000, 0]]), outlet('O1', 'L1', 6200, 4000), link('K1', 'O1')])
		// F1 is 6 m from the rack: the cable goes along T1 and tees into F1, not straight across
		expect(routeLinks(ix).get('K1')!.routeMm).toBeCloseTo(RACK_DROP + 6000 + 3500 + 200)
	})
	it('a backbone between floors takes the shortest riser — or the one it is told to (diversity)', () => {
		const ix = project([
			run('V1', 'L1', [[2000, 500, 0], [2000, 500, 0]], 'low', { toLevel: 'L2' }),
			run('V2', 'L1', [[8000, 500, 0], [8000, 500, 0]], 'low', { toLevel: 'L2' }),
			run('T2', 'L2', [[2000, 500, 0], [8000, 500, 0]]),
			{ type: 'space', id: 'S2', levelId: 'L2', name: 'IDF-2', kind: 'serverRoom' },
			{ type: 'rack', id: 'R2', levelId: 'L2', spaceId: 'S2', order: 1, name: 'R2', kind: '4-post', heightU: 42, widthMm: 600, depthMm: 1000, at: { x: 5000, y: 0 } },
			{ ...DEV, id: 'P2', rackId: 'R2', name: 'P2' },
			{ type: 'link', id: 'B1', kind: 'backbone', a: { on: 'P1', port: 1 }, b: { on: 'P2', port: 1 }, cableType: 'cat6a', status: 'design' },
			{ type: 'link', id: 'B2', kind: 'backbone', a: { on: 'P1', port: 2 }, b: { on: 'P2', port: 2 }, cableType: 'cat6a', status: 'design', via: 'V2' },
		])
		const routes = routeLinks(ix, { slackM: 0.5, wastePct: 0 })
		const b1 = routes.get('B1')!, b2 = routes.get('B2')!
		expect(b1.routeMm).toBeCloseTo(RACK_DROP + 2000 + 4000 + 3000 + RACK_DROP)
		expect(b1.segs.map((s) => s.shape)).toContain('V1')
		expect(b2.routeMm).toBeCloseTo(RACK_DROP + 8000 + 4000 + 3000 + RACK_DROP)
		expect(b2.segs.map((s) => s.shape)).toEqual(['T2', 'V2', 'T1'])
		expect(b1.lengthM).toBe(Math.ceil(b1.routeMm! / 1000))   // no outlet: no slack
	})
	it('a route set by hand goes through each run in order, along it, never doubling back (G148 / T078)', () => {
		const ix = project([
			run('V1', 'L1', [[2000, 500, 0], [2000, 500, 0]], 'low', { toLevel: 'L2' }),
			run('V2', 'L1', [[8000, 500, 0], [8000, 500, 0]], 'low', { toLevel: 'L2' }),
			run('T2', 'L2', [[2000, 500, 0], [8000, 500, 0]]),
			// a loop the long way round on 2F: (2000, 500) → (2000, 6000) → (8000, 6000) → (8000, 500)
			run('U2', 'L2', [[2000, 500, 0], [2000, 6000, 0], [8000, 6000, 0], [8000, 500, 0]]),
			{ type: 'space', id: 'S2', levelId: 'L2', name: 'IDF-2', kind: 'serverRoom' },
			{ type: 'rack', id: 'R2', levelId: 'L2', spaceId: 'S2', order: 1, name: 'R2', kind: '4-post', heightU: 42, widthMm: 600, depthMm: 1000, at: { x: 5000, y: 0 } },
			{ ...DEV, id: 'P2', rackId: 'R2', name: 'P2' },
			{ type: 'link', id: 'B1', kind: 'backbone', a: { on: 'P1', port: 1 }, b: { on: 'P2', port: 1 }, cableType: 'cat6a', status: 'design', via: ['V1', 'U2'] },
			{ type: 'link', id: 'B2', kind: 'backbone', a: { on: 'P1', port: 2 }, b: { on: 'P2', port: 2 }, cableType: 'cat6a', status: 'design', via: ['V2', 'GONE'] },
		])
		const routes = routeLinks(ix, { slackM: 0.5, wastePct: 0 })
		const b1 = routes.get('B1')!
		// up V1, all the way round U2 (not up one leg and back), along T2 to the rack
		expect(b1.routeMm).toBeCloseTo(RACK_DROP + 2000 + 4000 + 17000 + 3000 + RACK_DROP)
		expect(b1.segs.map((s) => s.shape)).toEqual(['T2', 'U2', 'U2', 'U2', 'V1', 'T1'])
		// a run that isn't there (deleted) can't be reached
		expect(routes.get('B2')!.problem).toBe("the cable can't reach a chosen run in the order given")
		expect([viaValue([]), viaValue(['A']), viaValue(['A', 'A', 'B'])]).toEqual([undefined, 'A', ['A', 'B']])
	})
	it('flags over 90 m; a hand-set length wins; BOM metres add waste and a box note', () => {
		const ix = project([
			run('T9', 'L1', [[10000, 500, 0], [99000, 500, 0]]),
			outlet('O1', 'L1', 98000, 600), link('K1', 'O1'),
			outlet('O2', 'L1', 3000, 600), { ...link('K2', 'O2', 2), lengthM: 7 },
		])
		const routes = routeLinks(ix, { slackM: 0.5, wastePct: 10 })
		expect(routes.get('K1')!.over90).toBe(true)
		expect(routes.get('K2')).toMatchObject({ lengthM: 7, handSet: true })
		const [m] = cableMetres(ix, routes, { slackM: 0.5, wastePct: 10 })
		expect(m).toMatchObject({ type: 'cat6a', links: 2, unrouted: 0, metres: Math.ceil((routes.get('K1')!.lengthM! + 7) * 1.1) })
		expect(boxNote(400)).toBe('≈ 2 box(es) of 305 m')
	})
})

describe('cable schedule (Dave: on screen, then Excel)', () => {
	it('one row per link: from the panel, to the outlet port, route + slack = installed length; no route flagged', () => {
		const ix = project([outlet('O1', 'L1', 8000, 1500), link('K1', 'O1'), outlet('O9', 'L2', 0, 0), link('K9', 'O9', 2)])
		const rows = cableSchedule(ix, routeLinks(ix, { slackM: 0.5, wastePct: 10 }), { slackM: 0.5, wastePct: 10 })
		const k1 = rows.find((r) => r.linkId === 'K1')!
		expect(k1).toMatchObject({ label: 'O1.A', from: 'R1 · P1 : 1', to: 'O1 : 1', type: 'cat6a', slackM: 0.5, lengthM: 12, over90: false })
		expect(k1.routeM).toBeCloseTo((RACK_DROP + 9000) / 1000, 1)
		const k9 = rows.find((r) => r.linkId === 'K9')!
		expect(k9.lengthM).toBeUndefined()
		expect(scheduleTotals(rows)).toEqual({ links: 2, metres: 12, unrouted: 1, over90: 0 })
		expect(rows.map((r) => r.label)).toEqual(['O1.A', 'O9.A'])   // by label
	})
	it('sorts by label, naturally, unlabelled last', () => {
		const ix = project([outlet('O10', 'L1', 0, 0), link('K10', 'O10'), outlet('O2', 'L1', 0, 0), link('K2', 'O2', 2)])
		const rows = cableSchedule(ix, routeLinks(ix, { slackM: 0, wastePct: 0 }), { slackM: 0, wastePct: 0 })
		expect(rows.map((r) => r.linkId)).toEqual(['K2', 'K10'])
	})
})
