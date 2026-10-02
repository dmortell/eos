// A small but complete project for tests: one floor, a server room with a rack, a patch panel and a switch, two
// 2-port outlets linked to the panel, two patch cords, a trunk with a drop, and a core drill.
import type { Entity } from './drawing'
import type { Outlet, Device, Link, Cord } from './types'
import { makeRun } from './make'
import { portLabelsFor } from './labels'

export function demoProject(): Entity[] {
	const outlet = (id: string, label: string, x: number): Outlet => ({
		type: 'outlet', id, levelId: 'L33', zoneId: 'Z3', label, tier: 'low', usage: 'desk', mount: 'floor', at: { x, y: 4000 }, z: 0,
		ports: portLabelsFor(label, 2).map((l, i) => ({ port: i + 1, label: l, serverRoomId: 'SR-A', cableType: 'cat6a' })),
	})
	const panel: Device = { type: 'device', id: 'P1', rackId: 'R1', name: 'Panel 1', kind: 'panel', u: 40, heightU: 1, face: 'both', portCount: 24, portType: 'RJ45', panel: { tier: 'low', serverRoomId: 'SR-A' } }
	const sw: Device = { type: 'device', id: 'SW1', rackId: 'R1', name: 'Switch 1', kind: 'switch', u: 38, heightU: 1, face: 'front', portCount: 48, portLabels: { '1': 'SW1-01', '2': 'SW1-02' } }
	const link = (id: string, panelPort: number, on: string, port: number, lengthM?: number): Link =>
		({ type: 'link', id, kind: 'horizontal', a: { on: 'P1', port: panelPort, face: 'rear' }, b: { on, port }, cableType: 'cat6a', status: 'design', ...(lengthM ? { lengthM } : {}) })
	const cord = (id: string, panelPort: number, swPort: number): Cord =>
		({ type: 'cord', id, kind: 'patch', a: { on: 'P1', port: panelPort, face: 'front' }, b: { on: 'SW1', port: swPort }, cableType: 'cat6a', colour: '#3b82f6', lengthM: 1, lengthLocked: false, status: 'add' })
	const run = { ...makeRun('L33', [{ x: 0, y: 3000, z: 2900 }, { x: 6000, y: 3000, z: 2900 }, { x: 6000, y: 3000, z: 300 }], { w: 100, h: 50 }, { tier: 'high', form: 'trunk' }), id: 'T1', label: 'T1' }

	return [
		{ type: 'building', id: 'B', name: 'Tower', order: 0 },
		{ type: 'level', id: 'L33', buildingId: 'B', number: 33, name: '33F', order: 33, elevationMm: 132000, heights: { slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2700, plenumMm: 800 } },
		{ type: 'space', id: 'Z3', levelId: 'L33', kind: 'zone', name: 'Zone 3', code: '3', order: 0 },
		{ type: 'space', id: 'SR-A', levelId: 'L33', kind: 'server room', name: 'IDF-A', code: 'A', order: 1 },
		{ type: 'rack', id: 'R1', levelId: 'L33', spaceId: 'SR-A', order: 0, name: 'A01', kind: 'cabinet', heightU: 42, widthMm: 600, depthMm: 1000 },
		panel, sw,
		outlet('O1', '33-001', 1000), outlet('O2', '33-002', 2000),
		link('K1', 1, 'O1', 1, 42.5), link('K2', 2, 'O1', 2, 42.5), link('K3', 3, 'O2', 1), link('K4', 4, 'O2', 2),
		cord('C1', 1, 1), cord('C2', 2, 2),
		run,
		{ type: 'shape', id: 'PEN1', levelId: 'L33', geom: { kind: 'circle', centre: { x: 6000, y: 3000 }, r: 50 }, role: { kind: 'penetration', diaMm: 100, through: 'slab' } },
	]
}
