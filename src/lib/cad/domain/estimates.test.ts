// Estimated cables before allocation: every outlet port with no link yet gets one to its server room, routed like a
// link (same graph, same tier / room rules), counted in fill as estimated, drawn dashed on the Routes overlay — and it
// goes once the port is linked.
import { describe, it, expect } from 'vitest'
import { ProjectIndex } from './project'
import { routeAll, estimateMetres } from './estimates'
import { bom } from './reports'
import { cableSchedule, scheduleTotals, estimatedTotals } from './cableSchedule'
import { panelZ, routeLinks, cableSettings } from './routing'
import { fillBySegment, cableCountText, segKey } from './fill'
import { allRoutesOf, fillBands, routesOf } from '../views/overlays'
import type { Entity } from './drawing'
import type { Shape } from './shapes'
import type { Prim } from '../views/display'

const level = (id: string, elevationMm: number) => ({ type: 'level', id, name: id, number: 1, elevationMm, order: 1, heights: { slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2600, plenumMm: 700 } })
function run(id: string, levelId: string, pts: [number, number, number][], tier: 'low' | 'high' = 'low', serves?: string[]): Shape {
	const nodes = pts.map(([x, y, z], i) => ({ id: `${id}n${i}`, x, y, z }))
	return {
		type: 'shape', id, levelId, geom: { kind: 'path', nodes, segs: nodes.slice(1).map((n, i) => ({ id: `${id}s${i}`, a: nodes[i].id, b: n.id })) },
		section: { w: 100, h: 50 }, role: { kind: 'containment', form: 'trunk', tier, ...(serves ? { serves } : {}) },
	} as Shape
}
const room = (id: string, extra: object = {}) => ({ type: 'space', id, levelId: 'L1', name: id, kind: 'server room', order: 1, ...extra })
const DEV = { type: 'device', id: 'P1', rackId: 'R1', name: 'P1', kind: 'panel', u: 40, heightU: 1, face: 'front', portCount: 48 }
/** The rack's drop for an estimate: 500 mm to the trunk, then up to a panel's default height (no panel chosen yet). */
const EST_RACK_DROP = 500 + panelZ(undefined)
type O = { tier?: 'low' | 'high'; ports?: number; room?: string | null; zoneId?: string; usage?: string; at?: boolean }
const outlet = (id: string, x: number, y: number, o: O = {}) => ({
	type: 'outlet', id, levelId: 'L1', label: id, tier: o.tier ?? 'low', usage: o.usage ?? 'desk', mount: 'floor', ...(o.at === false ? {} : { at: { x, y } }), ...(o.zoneId ? { zoneId: o.zoneId } : {}),
	ports: Array.from({ length: o.ports ?? 1 }, (_, i) => ({ port: i + 1, label: `${id}.${i + 1}`, cableType: 'cat6a', ...(o.room === null ? {} : { serverRoomId: o.room ?? 'S' }) })),
})
const link = (id: string, outletId: string, port = 1, panelPort = port) => ({ type: 'link', id, kind: 'horizontal', a: { on: 'P1', port: panelPort }, b: { on: outletId, port }, cableType: 'cat6a', status: 'design' })

function project(extra: unknown[] = []) {
	return new ProjectIndex([
		level('L1', 0), level('L2', 4000), room('S'),
		{ type: 'rack', id: 'R1', levelId: 'L1', spaceId: 'S', order: 1, name: 'R1', kind: '4-post', heightU: 42, widthMm: 600, depthMm: 1000, at: { x: 0, y: 0 } },
		DEV,
		run('T1', 'L1', [[0, 500, 0], [10000, 500, 0]]),
		...extra,
	] as Entity[])
}
const CABLE = { slackM: 0.5, wastePct: 0 }

describe('estimated cables (ports not linked yet)', () => {
	it('an unlinked port gets one: its tier’s run, along it, to its room’s rack; length = route + slack', () => {
		const { estimates } = routeAll(project([outlet('O1', 8000, 1500)]), CABLE)
		expect(estimates).toHaveLength(1)
		const e = estimates[0]
		expect(e).toMatchObject({ outletId: 'O1', port: 1, roomId: 'S', cableType: 'cat6a', segs: [{ shape: 'T1', seg: 'T1s0' }] })
		expect(e.problem).toBeUndefined()
		expect(e.routeMm).toBeCloseTo(EST_RACK_DROP + 8000 + 1000)
		expect(e.lengthM).toBe(Math.ceil(e.routeMm! / 1000 + 0.5))
	})
	it('goes when its port is linked; the outlet’s other ports keep theirs; the links route as before', () => {
		const ix = project([outlet('O1', 8000, 1500, { ports: 3 }), link('K1', 'O1', 2)])
		const { routes, estimates } = routeAll(ix, CABLE)
		expect(estimates.map((e) => e.port)).toEqual([1, 3])
		expect(routes.get('K1')).toEqual(routeLinks(ix, CABLE).get('K1'))
		expect(routeAll(project([outlet('O1', 8000, 1500, { ports: 3 }), link('K1', 'O1', 1), link('K2', 'O1', 2), link('K3', 'O1', 3)])).estimates).toEqual([])
	})
	it('follows the tier and room rules; none for an unplaced or N/A outlet; no run in reach says why', () => {
		const ix = project([
			run('H1', 'L1', [[0, 2000, 2800], [10000, 2000, 2800]], 'high'),
			run('X1', 'L1', [[0, 1700, 0], [10000, 1700, 0]], 'low', ['OTHER']),   // nearer, but serves another room
			outlet('LO', 8000, 1800), outlet('HI', 8000, 1800, { tier: 'high' }),
			outlet('FAR', 5000, 10600),                                            // 10.1 m from T1
			outlet('NA', 8000, 1800, { usage: 'N/A' }), outlet('NOWHERE', 0, 0, { at: false }),
		])
		const by = new Map(routeAll(ix).estimates.map((e) => [e.outletId, e]))
		expect(by.get('LO')!.segs.map((s) => s.shape)).toEqual(['T1'])
		expect(by.get('HI')!.segs[0].shape).toBe('H1')
		expect(by.get('FAR')!.problem).toMatch(/no low run within 10 m/)
		expect(by.has('NA') || by.has('NOWHERE')).toBe(false)
	})
	it('the room: the port’s own, else another port’s, else its zone’s, else the level’s only server room, else the one the nearest run serves', () => {
		const roomOf = (ix: ProjectIndex, id: string, port = 1) => routeAll(ix).estimates.find((e) => e.outletId === id && e.port === port)?.roomId
		// one server room on the level: a port with none goes there
		expect(roomOf(project([outlet('O1', 8000, 1500, { room: null })]), 'O1')).toBe('S')
		// two rooms: another port of the outlet decides, else the zone, else the nearest run's one room, else none
		const two = (extra: unknown[]) => project([room('S2'), ...extra])
		const sibling = outlet('SIB', 8000, 1500, { ports: 2, room: 'S2' })
		sibling.ports[1] = { port: 2, label: 'SIB.2', cableType: 'cat6a' } as (typeof sibling.ports)[number]
		expect(roomOf(two([sibling]), 'SIB', 2)).toBe('S2')
		expect(roomOf(two([outlet('ZA', 2000, 1500, { room: 'S2', zoneId: 'Z' }), outlet('ZB', 8000, 1500, { room: null, zoneId: 'Z' })]), 'ZB')).toBe('S2')
		expect(roomOf(two([run('X2', 'L1', [[0, 1700, 0], [10000, 1700, 0]], 'low', ['S2']), outlet('O1', 8000, 1800, { room: null })]), 'O1')).toBe('S2')
		const none = routeAll(two([outlet('O1', 8000, 1500, { room: null })])).estimates[0]
		expect(none).toMatchObject({ problem: 'no server room', segs: [] })
	})
	it('ends at the room’s patch frames, else its racks, else the centre of its outline; with none of them, says so', () => {
		const outline = [{ x: 4000, y: 2000 }, { x: 6000, y: 2000 }, { x: 6000, y: 4000 }, { x: 4000, y: 4000 }]   // centre (5000, 3000)
		const ix = project([room('S3', { boundary: outline }), room('S4'), outlet('O3', 8000, 1500, { room: 'S3' }), outlet('O4', 8000, 1500, { room: 'S4' })])
		const by = new Map(routeAll(ix).estimates.map((e) => [e.outletId, e]))
		// the centre is 2.5 m from T1 (within a rack's reach), at a panel's default height; then 3 m along, 1 m drop
		expect(by.get('O3')!.routeMm).toBeCloseTo(2500 + panelZ(undefined) + 3000 + 1000)
		expect(by.get('O4')!.problem).toBe('S4 has no placed rack or outline near a run')
		// the room's patch frame takes it, though the rack that isn't one is nearer
		const framed = project([
			{ type: 'rack', id: 'R2', levelId: 'L1', spaceId: 'S', order: 2, name: 'R2', kind: '4-post', heightU: 42, widthMm: 600, depthMm: 1000, at: { x: 9000, y: 0 }, patchFrame: true },
			outlet('O1', 1000, 1500),
		])
		expect(routeAll(framed).estimates[0].routeMm).toBeCloseTo(EST_RACK_DROP + 8000 + 1000)
	})
	it('counts in fill, marked as estimated: “2 cables · 1 estimated”, its % from both', () => {
		const ix = project([outlet('O1', 8000, 1500, { ports: 2 }), link('K1', 'O1', 1)])
		const { routes, estimates } = routeAll(ix)
		const f = fillBySegment(ix, routes, undefined, estimates).get(segKey('T1', 'T1s0'))!
		expect(f.cables).toEqual({ cat6a: 2 })
		expect(f.est).toEqual({ cat6a: 1 })
		expect(cableCountText(f)).toBe('2 cables · 1 estimated')
		expect(f.pct).toBeCloseTo(fillBySegment(ix, routes).get(segKey('T1', 'T1s0'))!.pct * 2)
		expect(cableCountText(fillBySegment(ix, routes).get(segKey('T1', 'T1s0'))!)).toBe('1 cable')
		// the plan's fill band says it too
		const label = fillBands(ix, [f], 'L1', 100).find((p) => p.k === 'text')
		expect(label?.k === 'text' && label.text).toMatch(/· 1 est\.$/)
	})
	it('shows on the Routes overlay dashed (a class of its own) where a room has only estimates', () => {
		const est = routeAll(project([outlet('O1', 8000, 1500)])).estimates
		const cls = (ps: Prim[]) => ps.map((p) => (p.k === 'image' ? '' : p.cls))
		expect(cls(allRoutesOf(project(), new Map(), 'L1', est).prims)).toEqual(['all-route all-route-est'])
		const ix = project([outlet('O1', 8000, 1500, { ports: 2 }), link('K1', 'O1', 1)]), r = routeAll(ix)
		expect(cls(allRoutesOf(ix, r.routes, 'L1', r.estimates).prims)).toEqual(['all-route'])   // a linked cable there: solid
	})
	it('stays fast on a big floor: 400 outlets × 2 ports over a grid of runs, in the one routing pass', () => {
		// a spine up x = 0 with 20 runs teeing off it, each in 10 segments
		const runs = [run('SP', 'L1', [[0, 500, 0], [0, 60500, 0]]), ...Array.from({ length: 20 }, (_, i) => run(`H${i}`, 'L1', Array.from({ length: 11 }, (_, k) => [k * 6000, 500 + i * 3000, 0] as [number, number, number])))]
		const outlets = Array.from({ length: 400 }, (_, i) => outlet(`O${i}`, 500 + ((i * 7919) % 59000), 500 + (i % 20) * 3000 + 800, { ports: 2 }))
		const links = outlets.slice(0, 50).map((o, i) => link(`K${i}`, o.id, 1, i + 1))
		const ix = project([...runs, ...outlets, ...links])
		const t0 = performance.now()
		const r = routeAll(ix)
		const ms = performance.now() - t0
		expect(r.routes.size).toBe(50)
		expect(r.estimates).toHaveLength(750)
		expect(r.estimates.every((e) => !e.problem)).toBe(true)
		expect(ms).toBeLessThan(1500)
	})
})

describe('estimates: selected outlet’s route, BOM, cable schedule', () => {
	it('roomSet is true only for a room set on a port; selecting such an outlet highlights its estimated route, dashed', () => {
		const ix = project([outlet('O1', 8000, 1500), outlet('O2', 8000, 1500, { room: null })])
		const { routes, estimates } = routeAll(ix, CABLE)
		expect(estimates.find((e) => e.outletId === 'O1')!.roomSet).toBe(true)
		expect(estimates.find((e) => e.outletId === 'O2')!.roomSet).toBeUndefined()   // guessed from the level
		const prims = routesOf(ix, routes, 'L1', ['O1'], null, estimates)
		expect(prims.length).toBeGreaterThan(0)
		expect(prims.every((q) => q.cls === 'trace-route trace-route-est')).toBe(true)
		expect(routesOf(ix, routes, 'L1', ['O2'], null, estimates)).toEqual([])   // room not set: nothing
		expect(routesOf(ix, routes, 'L1', [], null, estimates)).toEqual([])
	})
	it('a linked port shows its link’s route, not an estimate', () => {
		const ix = project([outlet('O1', 8000, 1500, { ports: 2 }), link('K1', 'O1', 1)])
		const { routes, estimates } = routeAll(ix, CABLE)
		const prims = routesOf(ix, routes, 'L1', ['O1'], null, estimates)
		expect(prims.filter((q) => q.cls === 'trace-route')).not.toHaveLength(0)
		expect(prims.filter((q) => q.cls === 'trace-route trace-route-est')).not.toHaveLength(0)
	})
	it('estimateMetres: per cable type, with waste; no-route ones apart', () => {
		const { estimates } = routeAll(project([outlet('O1', 8000, 1500, { ports: 2 }), outlet('O2', 8000, 20000)]), { slackM: 0.5, wastePct: 10 })
		const ok = estimates.filter((e) => e.lengthM != null)
		expect(ok).toHaveLength(2)
		const [m] = estimateMetres(estimates, { slackM: 0.5, wastePct: 10 })
		expect(m).toMatchObject({ type: 'cat6a', ports: 3, unrouted: 1 })
		expect(m.metres).toBe(Math.ceil(ok.reduce((a, e) => a + e.lengthM!, 0) * 1.1))
	})
	it('the BOM lists estimated cable apart, in metres; a linked port’s estimate is gone and the installed link is left out', () => {
		const ix = project([outlet('O1', 8000, 1500)])
		const { routes, estimates } = routeAll(ix, CABLE)
		const line = bom(ix, [], routes, estimates).find((l) => l.category === 'Cable')!
		expect(line).toMatchObject({ unit: 'm', qty: estimateMetres(estimates, cableSettings(ix))[0].metres })
		expect(line.item).toContain('estimated')
		expect(bom(ix, [], routes).find((l) => l.category === 'Cable')).toBeUndefined()   // none given: none counted
		const ix2 = project([outlet('O1', 8000, 1500), { ...link('K1', 'O1'), status: 'installed' }])
		const r2 = routeAll(ix2, CABLE)
		expect(r2.estimates).toEqual([])
		expect(bom(ix2, [], r2.routes, r2.estimates).find((l) => l.category === 'Cable')).toBeUndefined()
	})
	it('the cable schedule has estimated rows after the real ones; totals keep them apart', () => {
		const ix = project([outlet('O1', 8000, 1500, { ports: 2 }), link('K1', 'O1', 1)])
		const { routes, estimates } = routeAll(ix, CABLE)
		const rows = cableSchedule(ix, routes, CABLE, estimates)
		expect(rows.map((r) => !!r.estimated)).toEqual([false, true])
		expect(rows[1]).toMatchObject({ from: 'S', lengthM: estimates[0].lengthM, kind: 'horizontal', type: 'cat6a' })
		expect(scheduleTotals(rows).links).toBe(1)
		expect(estimatedTotals(rows)).toEqual({ cables: 1, metres: estimates[0].lengthM, unrouted: 0 })
		expect(cableSchedule(ix, routes, CABLE).some((r) => r.estimated)).toBe(false)
	})
})
