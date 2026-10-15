// The legacy import against docs shaped like the real ones (frames / racks / patching / outlets).
import { describe, it, expect } from 'vitest'
import { importLegacy, type LegacySource } from './legacy'
import { ProjectIndex } from '../../domain/project'
import { validateProject } from '../../domain/validate'
import { outletSchedule, patchList, bom } from '../../domain/reports'
import type { Outlet, Rack, Underlay, Level, Space } from '../../domain/types'
import type { Shape } from '../../domain/shapes'
import { repairLocationIds } from '../../../elevation/portmap'

const src = (): LegacySource => ({
	pid: 'P',
	project: { name: 'Tower', floors: [{ number: 33, serverRoomCount: 1, roomNames: { A: 'IDF-A' } }] },
	frames: {
		P_F33: {
			floorFormat: 'L01',
			zoneLocations: {
				A: [
					{ id: 'loc1', locationNumber: 1, portCount: 2, serverRoomAssignment: ['A', 'A'], locationType: 'desk' },
					{ id: 'loc2', locationNumber: 2, portCount: 2, serverRoomAssignment: ['A', 'A'], locationType: 'AP', isHighLevel: true },
				],
			},
			bakedLabels: { 'dev-panel:1': { label: 'STICKER-1', locationId: 'loc1', port: 1 } },
		},
	},
	racks: {
		P_F33_RA: {
			rows: [{ id: 'row1', label: 'Row A' }],
			racks: [{ id: 'r1', label: 'A01', rowId: 'row1', order: 0, heightU: 42, heightMm: 2000, widthMm: 600, depthMm: 1000, type: 'cabinet', serverRoom: 'A' }],
			devices: [
				{ id: 'dev-panel', rackId: 'r1', label: 'PP1', type: 'panel', heightU: 1, positionU: 40, portCount: 24, patchLevel: 'floor', serverRoom: 'A' },
				{ id: 'dev-hl', rackId: 'r1', label: 'PP-HL', type: 'panel', heightU: 1, positionU: 41, portCount: 24, patchLevel: 'high', serverRoom: 'A' },
				{ id: 'sw', rackId: 'r1', label: 'SW1', type: 'switch', heightU: 1, positionU: 38, portCount: 48, mounting: 'front' },
			],
		},
	},
	patching: {
		P_F33_RA: {
			connections: [{
				id: 'c1', fromPortRef: { rackId: 'r1', deviceId: 'dev-panel', portIndex: 1, face: 'front' }, toPortRef: { rackId: 'r1', deviceId: 'sw', portIndex: 1, face: 'front' },
				cableType: 'cat6a', cableColor: '#f00', lengthMeters: 1, lengthLocked: false, kind: 'patch', status: 'installed',
			}],
		},
	},
	outlets: {
		P_F33: {
			outlets: [
				{ id: 'o1', position: { x: 1000, y: 2000 }, level: 'low', portCount: 2, cableType: 'cat6', mountType: 'floor', usage: 'network', label: 'A.001', locationId: 'loc1' },
				{ id: 'o2', position: { x: 1500, y: 2000 }, level: 'low', portCount: 2, cableType: 'cat6', mountType: 'floor', usage: 'network', label: 'dup', locationId: 'loc1' },
				{ id: 'o3', position: { x: 3000, y: 2000 }, level: 'low', portCount: 1, cableType: 'cat6a', mountType: 'wall', usage: 'phone', label: 'X-1' },
			],
			trunks: [{
				id: 't1', shape: 'rect', location: 'ceiling-plenum', spec: { catalog: 'MK2', widthMm: 100, heightMm: 50 }, isPrimary: true, rooms: ['A'],
				nodes: [{ id: 'n1', position: { x: 0, y: 0 }, z: 3000 }, { id: 'n2', position: { x: 5000, y: 0 }, z: 3000, connectedRackId: 'r1' }],
				segments: [{ id: 's1', nodes: ['n1', 'n2'] }],
			}],
			rackPlacements: [{ rackId: 'r1', room: 'A', position: { x: 8000, y: 1000 }, rotation: 90 }],
			selectedFileId: 'file1', selectedPage: 2,
		},
	},
})

let n = 0
const run = () => importLegacy(src(), () => `id${++n}`)
const outletBy = (ents: ReturnType<typeof run>['entities'], label: string) => ents.find((e): e is Outlet => e.type === 'outlet' && e.label === label)

describe('legacy import', () => {
	it('produces a valid project', () => {
		const { entities } = run()
		expect(validateProject(entities).filter((i) => i.severity === 'error')).toEqual([])
	})
	it('one level, its server room by its project name, the zone and the rack row', () => {
		const { entities } = run()
		expect(entities.filter((e) => e.type === 'level').map((e) => (e as { number: number }).number)).toEqual([33])
		expect(entities.some((e) => e.type === 'space' && e.kind === 'server room' && e.name === 'IDF-A' && e.code === 'A')).toBe(true)
		expect(entities.some((e) => e.type === 'space' && e.kind === 'zone' && e.code === 'A')).toBe(true)
		expect(entities.some((e) => e.type === 'rackRow')).toBe(true)
	})
	it('a Frames location and its drawn outlet become ONE outlet with the position from the plan', () => {
		const { entities } = run()
		const o = outletBy(entities, 'A.001')!
		expect(o.at).toEqual({ x: 1000, y: 2000 })
		expect(o.ports.map((p) => p.cableType)).toEqual(['cat6', 'cat6'])
	})
	it("the sticker (baked) label becomes the outlet port's label, and the panel shows it through the link", () => {
		const { entities } = run()
		const ix = new ProjectIndex(entities)
		expect(outletBy(entities, 'A.001')!.ports[0].label).toBe('STICKER-1')
		const panel = entities.find((e) => e.type === 'device' && e.name === 'PP1')!
		expect(ix.portLabel({ on: panel.id, port: 1 })).toBe('STICKER-1')
	})
	it('unallocated or engine-allocated ports take the generated Frames label', () => {
		const { entities } = run()
		expect(outletBy(entities, 'A.002')!.ports.map((p) => p.label)).toEqual(['L33.A.002-A01-H', 'L33.A.002-A02-H'])
	})
	it('two drawn outlets on one location is reported as an error and the second is skipped', () => {
		const { entities, issues } = run()
		expect(outletBy(entities, 'dup')).toBeUndefined()
		expect(issues.find((i) => i.code === 'location-shared')?.severity).toBe('error')
	})
	it('a drawn outlet with no location is imported on its own, with suffix port labels', () => {
		const o = outletBy(run().entities, 'X-1')!
		expect(o.ports.map((p) => p.label)).toEqual(['X-1.A'])
		expect(o.mount).toBe('wall')
	})
	it('patch cords keep both ends and the label people read on the panel', () => {
		const ix = new ProjectIndex(run().entities)
		const [row] = patchList(ix)
		expect([row.fromLabel, row.status]).toEqual(['STICKER-1', 'installed'])
	})
	it('trunks become containment shapes, z moved from the slab to FFL, attached to the rack they end at', () => {
		const { entities } = run()
		const t = entities.find((e): e is Shape => e.type === 'shape' && e.role?.kind === 'containment')!
		const rack = entities.find((e): e is Rack => e.type === 'rack')!
		expect(t.geom.kind === 'path' && t.geom.nodes.map((nd) => nd.z)).toEqual([2700, 2700])
		expect(t.geom.kind === 'path' && t.geom.nodes[1].attach).toBe(rack.id)
		expect(t.role?.kind === 'containment' && t.role.tier).toBe('high')
		expect(t.section).toEqual({ w: 100, h: 50 })
	})
	it('a rack placement (corner + rotation) becomes the rack centre + rotation; the floorplan becomes an underlay', () => {
		const { entities } = run()
		const rack = entities.find((e): e is Rack => e.type === 'rack')!
		expect([rack.at, rack.rot]).toEqual([{ x: 8300, y: 1500 }, 90])
		expect(entities.find((e): e is Underlay => e.type === 'underlay')?.page).toBe(2)
	})
	it('floors whose Frames locations have no ids yet stay separate (repaired ids repeat on every floor)', () => {
		const locs = () => ({ A: [{ locationNumber: 1, portCount: 1, serverRoomAssignment: ['A'], locationType: 'desk' }] })
		const repairedId = repairLocationIds(locs()).zoneLocations.A[0].id
		const s: LegacySource = {
			pid: 'P', project: { floors: [{ number: 1, serverRoomCount: 1 }, { number: 4, serverRoomCount: 1 }] },
			frames: { P_F01: { zoneLocations: locs() }, P_F04: { zoneLocations: locs() } }, racks: {}, patching: {},
			outlets: {
				P_F01: { outlets: [{ id: 'a', position: { x: 1, y: 1 }, portCount: 1, locationId: repairedId }] },
				P_F04: { outlets: [{ id: 'b', position: { x: 4, y: 4 }, portCount: 1, locationId: repairedId }] },
			},
		}
		const { entities, issues } = importLegacy(s)
		const outlets = entities.filter((e): e is Outlet => e.type === 'outlet')
		expect(outlets.map((o) => o.at)).toEqual([{ x: 1, y: 1 }, { x: 4, y: 4 }])
		expect(new Set(outlets.map((o) => o.levelId)).size).toBe(2)
		expect(issues.some((i) => i.code === 'location-shared')).toBe(false)
	})
	it('a drawn outlet never linked to its location, but with the same label on the same floor, is matched to it', () => {
		const s = src()
		s.outlets.P_F33.outlets = [{ id: 'o9', position: { x: 9, y: 9 }, portCount: 2, label: 'A.002' }]
		const { entities, issues } = importLegacy(s)
		const twins = entities.filter((e): e is Outlet => e.type === 'outlet' && e.label === 'A.002')
		expect(twins.map((o) => o.at)).toEqual([{ x: 9, y: 9 }])
		expect(issues.some((i) => i.code === 'matched-by-label')).toBe(true)
	})
	it("an AREA Outlets doc (_F33__3307 — Tourney's second office on 33F) is its own plan: a level of its own", () => {
		const s = src()
		// the rack is placed on the area's plan, and a Frames location is drawn there (matched by label)
		s.outlets.P_F33.rackPlacements = []
		s.outlets.P_F33__3307 = {
			outlets: [{ id: 'q1', position: { x: 50, y: 60 }, portCount: 2, label: 'A.002' }],
			rackPlacements: [{ rackId: 'r1', room: 'A', position: { x: 100, y: 100 } }],
			selectedFileId: 'Plan_L3307.pdf',
		}
		const { entities } = importLegacy(s)
		const levels = entities.filter((e): e is Level => e.type === 'level')
		expect(levels.map((l) => [l.number, l.name, l.area])).toEqual([[33, '33F', undefined], [33, '33F 3307', '3307']])
		const area = levels[1]
		expect(outletBy(entities, 'A.002')?.levelId).toBe(area.id)          // drawn there → lives there
		expect(outletBy(entities, 'A.001')?.levelId).toBe(levels[0].id)     // drawn on the main plan → stays
		const rack = entities.find((e): e is Rack => e.type === 'rack')!
		expect(rack.levelId).toBe(area.id)
		const room = entities.find((e): e is Space => e.type === 'space' && e.id === rack.spaceId)
		expect(room?.levelId).toBe(area.id)   // its room follows
		expect(entities.filter((e): e is Underlay => e.type === 'underlay').map((u) => [u.fileId, u.levelId])).toContainEqual(['Plan_L3307.pdf', area.id])
	})
	it('the reports run on the imported project', () => {
		const ix = new ProjectIndex(run().entities)
		expect(outletSchedule(ix).totals.outlets).toBe(3)
		expect(bom(ix).find((l) => l.item === 'trunk 100×50')?.qty).toBe(5)
	})
})
