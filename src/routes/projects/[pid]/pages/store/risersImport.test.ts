import { describe, it, expect } from 'vitest'
import { riserFloors, riserStoreys, risersToBuilding, mergeRisers, storeyLevels, type RisersDocIn } from './risersImport'
import type { Model } from '../3dview/types'

const doc: RisersDocIn = {
	fromFloor: 12, toFloor: 33,
	floorHeights: { 33: { clearHeightMm: 3000 } },
	settings: { defaultFloorHeights: { slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2600, plenumMm: 700 } },
	rooms: [
		{ id: 'r12', kind: 'server', floor: 12, xMm: 5000, widthMm: 4000, label: 'MDF' },
		{ id: 'r33', kind: 'eps', floor: 33, xMm: 9000, widthMm: 2000, label: 'EPS33' },
	],
	ladders: [{ id: 'L1', label: 'Riser 1', xMm: 8000, fromFloor: 12, toFloor: 33 }],
	cables: [{ id: 'c1', label: 'OM4', segments: [{ roomId: 'r12', level: 'high', ladderId: 'L1' }, { roomId: 'r33' }] }],
	labels: [{}],
}

describe('Risers import', () => {
	it("covers every floor in the riser's range (no floor 0)", () => {
		expect(riserFloors({ fromFloor: 2, toFloor: 4 })).toEqual([2, 3, 4])
		expect(riserFloors({ fromFloor: 1, toFloor: -2 })).toEqual([-2, -1, 1])
		expect(riserFloors(doc)).toHaveLength(22)
	})
	it('stacks storeys from the per-floor heights; levels are heights above each datum', () => {
		const s = riserStoreys(doc, [12, 30, 33])
		expect(s.map((x) => [x.name, x.z])).toEqual([['12F', 0], ['30F', 3800], ['33F', 7600]])   // 300 + 2600 + 700 + 200 per floor
		expect(storeyLevels(s[2])).toEqual({ floorSlab: 0, raisedFloor: 300, ceilingTile: 3300, ceilingSlab: 4000 })
	})
	it('rooms → boxes on the raised floor, ladders → a vertical trunk, cables → a routed conduit', () => {
		const r = risersToBuilding({ ...doc, fromFloor: 12, toFloor: 33 })
		const z33 = r.storeys.find((s) => s.name === '33F')!.z
		expect(z33).toBe(21 * 3800)   // 21 floors of 300 + 2600 + 700 + 200 below 33F
		const room = r.objects.find((o) => o.id === 'rsr-room-r12')!
		expect(room).toMatchObject({ type: 'prism', layer: 'riser-rooms', x: 3000, z: 300, w: 4000, h: 2600 })
		expect(r.objects.find((o) => o.id === 'rsr-room-r33')!.layer).toBe('riser-eps')
		const lad = r.objects.find((o) => o.id === 'rsr-lad-L1')!
		expect(lad.type === 'conduit' && lad.nodes.map((n) => n.z)).toEqual([0, z33 + 4000])
		const cab = r.objects.find((o) => o.id === 'rsr-cab-c1')!
		// leaves MDF in its plenum, along to the ladder, up it, then along to EPS33 in its plenum
		expect(cab.type === 'conduit' && cab.nodes.map((n) => [n.x, n.z])).toEqual([[5000, 3250], [8000, 3250], [8000, z33 + 3650], [9000, z33 + 3650]])
		expect(r.notes).toEqual(['1 text label not imported (no elevation text yet)'])
	})
	it('importing again replaces what was imported and keeps what was drawn in Pages', () => {
		const m: Model = { id: 'b', name: 'Hibiya', objects: [{ type: 'prism', id: 'mine', x: 0, y: 0, z: 0, w: 1, h: 1, d: 1, edges: 4 }], layers: [] }
		const small = { ...doc, fromFloor: 32, toFloor: 33, rooms: [], cables: [], ladders: [] }
		const once = mergeRisers(m, risersToBuilding({ ...small, rooms: doc.rooms!.filter((r) => r.floor === 33) }))
		const twice = mergeRisers(once, risersToBuilding({ ...small, rooms: doc.rooms!.filter((r) => r.floor === 33) }))
		expect(twice.objects.length).toBe(once.objects.length)
		expect(twice.objects[0].id).toBe('mine')
		expect(twice.layers!.map((l) => l.id)).toEqual(['riser-rooms', 'riser-eps', 'riser-ladders', 'riser-cables'])
		expect(twice.storeys!.map((s) => s.name)).toEqual(['32F', '33F'])
	})
})
