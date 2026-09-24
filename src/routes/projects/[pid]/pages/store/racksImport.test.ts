import { describe, it, expect } from 'vitest'
import { rowToObjects, mergeRackRow, freeU, uToZ, zToU, rackHeightMm } from './racksImport'
import type { Model, Obj } from '../3dview/types'

const doc = {
	rows: [{ id: 'r1' }],
	racks: [
		{ id: 'B', rowId: 'r1', order: 2, heightU: 42, widthMm: 800, depthMm: 1200, label: 'R02' },
		{ id: 'A', rowId: 'r1', order: 1, heightU: 42, widthMm: 600, depthMm: 1000, label: 'R01' },
		{ id: 'X', rowId: 'other', order: 1 },
	],
	devices: [
		{ id: 'd1', rackId: 'A', label: 'PP-01', type: 'panel', heightU: 1, positionU: 40, portCount: 24, mounting: 'front' as const },
		{ id: 'd2', rackId: 'A', label: 'SW', type: 'switch', heightU: 2, positionU: 1 },
		{ id: 'd3', rackId: 'A', mounting: 'none' as const },
	],
}

describe('racks → a rack-row model (G4)', () => {
	it('lays the row out side by side in order; devices at their U on their face', () => {
		const o = rowToObjects(doc, 'r1')
		const [a, dA1, dA2, b] = o
		expect(o.map((x) => x.id)).toEqual(['rk-A', 'dv-d1', 'dv-d2', 'rk-B'])
		expect(a.type === 'prism' && b.type === 'prism' && b.x - (a.x + a.w)).toBe(10)
		expect(a.type === 'prism' && a.h).toBe(rackHeightMm(42))
		expect(dA1.type === 'prism' && dA1.z).toBe(uToZ(0, 40))
		expect(dA1.device).toMatchObject({ rackId: 'rk-A', u: 40, hU: 1, mount: 'front', ports: 24, kind: 'panel' })
		expect(dA2.type === 'prism' && dA2.h).toBe(90)
	})
	it('U ↔ z round-trips; a free U skips the used ones; re-import replaces only imported objects', () => {
		expect(zToU(0, uToZ(0, 17))).toBe(17)
		const o = rowToObjects(doc, 'r1')
		expect(freeU(o, 'rk-A', 42, 2)).toBe(3)   // U1-2 = the switch
		expect(freeU(o, 'rk-A', 42, 42)).toBeNull()
		const m = { id: 'm', name: 'Row', objects: [{ type: 'prism', id: 'mine', x: 0, y: 0, z: 0, w: 1, d: 1, h: 1, edges: 4 } as Obj, ...o], layers: [] } as Model
		const r = mergeRackRow(m, rowToObjects(doc, 'r1'))
		expect(r.objects.filter((x) => x.id === 'mine')).toHaveLength(1)
		expect(r.objects).toHaveLength(5)
		expect(r.layers?.map((l) => l.id)).toEqual(['racks', 'devices'])
		// a panel's allocation survives the re-import
		const alloc = { 1: { outlet: 'o', model: 'f', port: 1, label: 'X' } }
		const withAlloc = { ...m, objects: m.objects.map((x) => (x.id === 'dv-d1' ? { ...x, device: { ...x.device!, alloc } } : x)) }
		expect(mergeRackRow(withAlloc, rowToObjects(doc, 'r1')).objects.find((x) => x.id === 'dv-d1')?.device?.alloc).toEqual(alloc)
	})
})
