import { describe, it, expect } from 'vitest'
import {
	buildReservationMap, deriveServerRoomCount, deriveFramesFromRacks, buildPortInfoMap, matchesFace,
	repairLocationIds, locationIdFor,
} from './portmap'
import type { PortReservation } from '../../routes/projects/[pid]/frames/parts/types'

// ── Fixtures: one room-A rack with a 24-port floor panel at U10 ──

const rack = { id: 'rack-1', label: 'R01', serverRoom: 'A', heightU: 42, type: 'cabinet', rowId: 'row-1', order: 1 }
const panel = { id: 'dev-1', rackId: 'rack-1', type: 'panel', label: 'PP01', positionU: 10, heightU: 1, portCount: 24 }
const rearSwitch = { id: 'dev-2', rackId: 'rack-1', type: 'switch', label: 'SW01', positionU: 20, heightU: 1, portCount: 48, mounting: 'rear' }

const frameData = {
	zoneLocations: {
		A: [
			{ locationNumber: 1, portCount: 2, serverRoomAssignment: ['A', 'A'], locationType: 'desk' },
			{ locationNumber: 2, portCount: 1, serverRoomAssignment: ['A'], locationType: 'AP' },
		],
	},
}

describe('matchesFace', () => {
	it('defaults to both faces when mounting is unset', () => {
		expect(matchesFace({}, 'front')).toBe(true)
		expect(matchesFace({}, 'rear')).toBe(true)
		expect(matchesFace({ mounting: 'rear' }, 'front')).toBe(false)
	})
})

describe('buildReservationMap', () => {
	it('keys reservations by frameId:ru:row:col', () => {
		const reservations: PortReservation[] = [
			{ id: '1', type: 'AP', ports: [{ frameId: 'rack-1', ru: 10, row: 'top', col: 0 }] },
		]
		const map = buildReservationMap(reservations)
		expect(map.get('rack-1:10:top:0')).toBe('AP')
		expect(map.size).toBe(1)
	})

	it('tolerates null/undefined', () => {
		expect(buildReservationMap(undefined).size).toBe(0)
		expect(buildReservationMap(null).size).toBe(0)
	})
})

describe('deriveServerRoomCount', () => {
	it('derives from location assignments and frames', () => {
		expect(deriveServerRoomCount(frameData.zoneLocations)).toBe(1)
		expect(deriveServerRoomCount({ A: [{ serverRoomAssignment: ['A', 'B'] }] })).toBe(2)
		expect(deriveServerRoomCount({}, [{ serverRoom: 'C' }])).toBe(3)
	})

	it('honours the explicit value as a lower bound', () => {
		expect(deriveServerRoomCount(frameData.zoneLocations, [], 2)).toBe(2)
	})
})

describe('deriveFramesFromRacks', () => {
	it('turns racks docs into FrameConfigs, filtering by face', () => {
		const frames = deriveFramesFromRacks({ A: { racks: [rack], devices: [panel, rearSwitch] } }, 'front')
		expect(frames).toHaveLength(1)
		expect(frames[0].id).toBe('rack-1')
		expect(frames[0].panelDevices).toHaveLength(1)
		expect(frames[0].slots).toHaveLength(0) // rear-mounted switch excluded from front face
	})
})

describe('buildPortInfoMap', () => {
	it('resolves device ports to canonical frames labels', () => {
		const map = buildPortInfoMap(frameData, 'A', [panel], [rack], 1)
		// 3 labelled ports total (2 desk + 1 AP), allocated sequentially
		expect(map.get('dev-1:1')?.label).toBe('L01.A.001-A01')
		expect(map.get('dev-1:2')?.label).toBe('L01.A.001-A02')
		expect(map.get('dev-1:3')?.label).toBe('L01.A.002-A01')
		expect(map.get('dev-1:3')?.locationType).toBe('AP')
		expect(map.get('dev-1:4')).toBeUndefined()
	})

	it('honours block reservations (the array→Map regression)', () => {
		const withReservations = {
			...frameData,
			// Reserve the panel's first top-row slot for AP — the AP label must
			// land on port 1 instead of sequential position 3.
			portReservations: [
				{ id: '1', type: 'AP', ports: [{ frameId: 'rack-1', ru: 10, row: 'top', col: 0 }] },
			],
		}
		const map = buildPortInfoMap(withReservations, 'A', [panel], [rack], 1)
		expect(map.get('dev-1:1')?.locationType).toBe('AP')
		expect(map.get('dev-1:2')?.locationType).toBe('desk')
		expect(map.get('dev-1:3')?.locationType).toBe('desk')
	})

	it('pins assignments to exact ports and withholds their labels from auto-fill', () => {
		const withPins = {
			...frameData,
			// Pin location 2 (the AP) port 1 to physical cell top:5 → device port 6
			portAssignments: {
				'rack-1:10:top:5': { zone: 'A', locationNumber: 2, port: 1 },
			},
		}
		const map = buildPortInfoMap(withPins, 'A', [panel], [rack], 1)
		expect(map.get('dev-1:6')?.locationType).toBe('AP')
		expect(map.get('dev-1:6')?.pinned).toBe(true)
		// The AP label must not ALSO be auto-placed sequentially
		expect(map.get('dev-1:3')).toBeUndefined()
		// Desk labels still fill from the start
		expect(map.get('dev-1:1')?.locationType).toBe('desk')
		expect(map.get('dev-1:2')?.locationType).toBe('desk')
	})

	it('resolves id-form pins and keeps them across location renumbering', () => {
		// The AP location has a stable id; the pin references ONLY the id.
		const withIds = {
			zoneLocations: {
				A: [
					{ id: 'LA1', locationNumber: 1, portCount: 2, serverRoomAssignment: ['A', 'A'], locationType: 'desk' },
					{ id: 'LA2', locationNumber: 2, portCount: 1, serverRoomAssignment: ['A'], locationType: 'AP' },
				],
			},
			portAssignments: { 'rack-1:10:top:5': { locationId: 'LA2', port: 1 } },
		}
		const map = buildPortInfoMap(withIds, 'A', [panel], [rack], 1)
		expect(map.get('dev-1:6')?.locationType).toBe('AP')
		expect(map.get('dev-1:6')?.label).toBe('L01.A.002-A01')

		// Renumber the pinned location 2 → 7: the pin follows the id and the
		// label reflects the NEW number without touching the assignment.
		const renumbered = {
			...withIds,
			zoneLocations: {
				A: [
					withIds.zoneLocations.A[0],
					{ ...withIds.zoneLocations.A[1], locationNumber: 7 },
				],
			},
		}
		const map2 = buildPortInfoMap(renumbered, 'A', [panel], [rack], 1)
		expect(map2.get('dev-1:6')?.label).toBe('L01.A.007-A01')
		expect(map2.get('dev-1:6')?.pinned).toBe(true)
	})

	it('baked labels overlay engine labels and resolve locationType by id', () => {
		const withBaked = {
			zoneLocations: {
				A: [
					{ id: 'LA1', locationNumber: 1, portCount: 2, serverRoomAssignment: ['A', 'A'], locationType: 'desk' },
					{ id: 'LA2', locationNumber: 2, portCount: 1, serverRoomAssignment: ['A'], locationType: 'AP' },
				],
			},
			bakedLabels: {
				'dev-1:1': { label: 'CUSTOM-001', locationId: 'LA2', port: 1 },
				'dev-9:1': { label: 'GHOST', locationId: 'LA1', port: 1 }, // unknown device → ignored
			},
		}
		const map = buildPortInfoMap(withBaked, 'A', [panel], [rack], 1)
		// Baked string wins over the engine's sequential allocation at port 1
		expect(map.get('dev-1:1')?.label).toBe('CUSTOM-001')
		expect(map.get('dev-1:1')?.baked).toBe(true)
		expect(map.get('dev-1:1')?.locationType).toBe('AP')
		// Engine labels still fill the rest
		expect(map.get('dev-1:2')?.label).toBeTruthy()
		expect(map.get('dev-9:1')).toBeUndefined()
	})

	it('keeps room-B labels when serverRoomCount is not stored (viewport regression)', () => {
		const twoRoom = {
			zoneLocations: { A: [{ locationNumber: 1, portCount: 1, serverRoomAssignment: ['B'], locationType: 'desk' }] },
		}
		const rackB = { ...rack, id: 'rack-B', serverRoom: 'B' }
		const panelB = { ...panel, id: 'dev-B', rackId: 'rack-B' }
		// serverRoomCount deliberately omitted — must be derived, not defaulted to 1
		const map = buildPortInfoMap(twoRoom, 'B', [panelB], [rackB], 1)
		expect(map.get('dev-B:1')?.label).toBe('L01.A.001-B01')
	})
})

describe('repairLocationIds', () => {
	it('fills missing ids deterministically and leaves existing ids alone', () => {
		const input = {
			A: [
				{ locationNumber: 1, portCount: 2, serverRoomAssignment: ['A', 'A'], locationType: 'desk' },
				{ id: 'custom', locationNumber: 2, portCount: 1, serverRoomAssignment: ['A'], locationType: 'AP' },
			],
			B: [{ locationNumber: 1, portCount: 1, serverRoomAssignment: ['A'], locationType: 'desk' }],
		}
		const r1 = repairLocationIds(input as any)
		expect(r1.changed).toBe(true)
		expect(r1.zoneLocations.A[0].id).toBe('LA1')
		expect(r1.zoneLocations.A[1].id).toBe('custom')
		expect(r1.zoneLocations.B[0].id).toBe('LB1')
		// Deterministic: a second client repairing the same doc converges
		const r2 = repairLocationIds(input as any)
		expect(r2.zoneLocations).toEqual(r1.zoneLocations)
		// Idempotent: repairing repaired data changes nothing
		const r3 = repairLocationIds(r1.zoneLocations)
		expect(r3.changed).toBe(false)
	})

	it('suffixes on collision with persisted ids', () => {
		const input = {
			A: [
				{ id: 'LA1', locationNumber: 5, portCount: 1, serverRoomAssignment: ['A'], locationType: 'desk' },
				{ locationNumber: 1, portCount: 1, serverRoomAssignment: ['A'], locationType: 'desk' },
			],
		}
		const r = repairLocationIds(input as any)
		expect(r.zoneLocations.A[1].id).toBe('LA1_2')
	})

	it('locationIdFor marks generated ids as used', () => {
		const used = new Set<string>()
		expect(locationIdFor('A', 3, used)).toBe('LA3')
		expect(locationIdFor('A', 3, used)).toBe('LA3_2')
	})
})
