import { describe, it, expect } from 'vitest'
import {
	buildReservationMap, deriveServerRoomCount, deriveFramesFromRacks, buildPortInfoMap, matchesFace,
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
