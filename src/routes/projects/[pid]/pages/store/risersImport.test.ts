import { describe, it, expect } from 'vitest'
import { riserFloors, riserStoreys, risersToBuilding, mergeRisers, storeyLevels, stackFloors, restack, riserVisibleStoreys, type RisersDocIn } from './risersImport'
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
	it("covers every floor in the riser's range; 0 (GF) only when not skipped", () => {
		expect(riserFloors({ fromFloor: 2, toFloor: 4 })).toEqual([2, 3, 4])
		expect(riserFloors({ fromFloor: 1, toFloor: -2 })).toEqual([-2, -1, 0, 1])
		expect(riserFloors({ fromFloor: 1, toFloor: -2 }, [0])).toEqual([-2, -1, 1])
		expect(riserFloors(doc)).toHaveLength(22)
	})
	it("a building's stack: bottom…top without skipped floors; re-stacking keeps a storey's heights", () => {
		expect(stackFloors({ bottom: -2, top: 5, skipped: [0, 4] })).toEqual([-2, -1, 1, 2, 3, 5])
		expect(stackFloors({ bottom: -1, top: 1 })).toEqual([-1, 0, 1])   // a GF
		const tall = riserStoreys(doc, [32, 33])   // 33F has a 3000 clear height
		const re = restack([31, 32, 33], tall)
		expect(re.map((s) => [s.name, s.z])).toEqual([['31F', 0], ['32F', 3800], ['33F', 7600]])
		expect(re[2].ceilingTile).toBe(3300)   // kept from the riser
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
		expect(twice.layers!.map((l) => l.id)).toEqual(['riser-eps'])   // only the layers it uses
		expect(twice.storeys!.map((s) => s.name)).toEqual(['32F', '33F'])
	})
	it('several risers share a building: each replaces only its own objects; items land on the model\'s layers', () => {
		const m: Model = { id: 'b', name: 'B', objects: [], layers: [{ id: 'trunks', name: 'Trunks', color: '#000', visible: true, locked: false }, { id: 'fiber', name: 'Fiber', color: '#000', visible: false, locked: false }] }
		const d2 = { ...doc, cables: [{ ...doc.cables![0], media: 'fiber' as const }] }
		const a = risersToBuilding(d2, riserFloors(d2), { riserId: 'A', layerIds: ['trunks', 'fiber'] })
		expect(a.objects.find((o) => o.id === 'rsr-A-lad-L1')!.layer).toBe('trunks')
		expect(a.objects.find((o) => o.id === 'rsr-A-cab-c1')!.layer).toBe('fiber')
		expect(a.objects.find((o) => o.id === 'rsr-A-room-r12')!.label).toBe('MDF')
		const withA = mergeRisers(m, a, 'A')
		expect(withA.layers!.find((l) => l.id === 'fiber')!.visible).toBe(true)   // made visible for its cables
		const withB = mergeRisers(withA, risersToBuilding({ ...doc, cables: [] }, riserFloors(doc), { riserId: 'B' }), 'B')
		expect(withB.objects.filter((o) => o.id!.startsWith('rsr-A-')).length).toBe(a.objects.length)   // A kept
		const againA = mergeRisers(withB, a, 'A')
		expect(againA.objects.length).toBe(withB.objects.length)
	})
	it("a riser drawing's floors: its range minus its hidden floors", () => {
		const st = riserStoreys(doc, riserFloors({ fromFloor: 30, toFloor: 34 }))
		expect(riserVisibleStoreys({ fromFloor: 31, toFloor: 33, hiddenFloors: [32] }, st)).toEqual(['st-F31', 'st-F33'])
	})
})
