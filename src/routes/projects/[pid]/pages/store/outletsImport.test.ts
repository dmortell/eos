import { describe, it, expect } from 'vitest'
import { outletsDocIdFor, outletToInsert, trunkToConduit, importOutletsInto } from './outletsImport'
import type { Model } from '../3dview/types'

const outlet = (over = {}) => ({ id: 'o1', position: { x: 1200, y: 3400 }, level: 'low', portCount: 2, cableType: 'cat6a', mountType: 'box', usage: 'network', label: '33.3.012', roomNumber: 'Mtg Rm', ...over }) as never
const trunk = { id: 't1', shape: 'rect', location: 'floor', spec: { catalog: 'MK2', widthMm: 300, heightMm: 60 }, isPrimary: true,
	nodes: [{ id: 'a', position: { x: 0, y: 0 }, z: 0 }, { id: 'b', position: { x: 5000, y: 0 }, z: 0 }], segments: [{ id: 's', nodes: ['a', 'b'] }] } as never

describe('Outlets tool import', () => {
	it('finds the doc for a floor, its legacy area (unsuffixed) and another area; rooms / rows have none', () => {
		const floors = [{ number: 33, areas: [{ id: '3303', legacy: true }, { id: '3307' }] }]
		expect(outletsDocIdFor('P', { floor: 33 }, floors)).toBe('P_F33')
		expect(outletsDocIdFor('P', { floor: 33, area: '3303' }, floors)).toBe('P_F33')
		expect(outletsDocIdFor('P', { floor: 33, area: '3307' }, floors)).toBe('P_F33__3307')
		expect(outletsDocIdFor('P', { floor: 4, room: 'A' }, floors)).toBeNull()
		expect(outletsDocIdFor('P', undefined, floors)).toBeNull()
	})
	it('an outlet becomes an insert: block by mount type, attributes, usage colour, filled + layer by level', () => {
		expect(outletToInsert(outlet())).toEqual({ id: 'out-o1', type: 'insert', block: 'outlet-box', a: [1200, 3400], layer: 'data', color: '#2563eb', fill: '#3b82f6',
			attrs: { LABEL: '33.3.012', PORTS: '2', TYPE: 'network', NOTE: 'Mtg Rm' } })
		const hi = outletToInsert(outlet({ level: 'high', mountType: 'wall', rotation: 90 }))
		expect([hi.block, hi.layer, hi.fill, hi.rot]).toEqual(['outlet-wall', 'data', undefined, 90])
		expect(outletToInsert(outlet({ mountType: 'floor' })).block).toBe('outlet-floor')
	})
	it('a trunk becomes a conduit (rect = 4 edges at w×h, pipe = 16 at its outer diameter), same nodes + segments', () => {
		expect(trunkToConduit(trunk)).toMatchObject({ type: 'conduit', id: 'trk-t1', layer: 'trunks', w: 300, h: 60, edges: 4, segments: [{ id: 's', a: 'a', b: 'b' }] })
		const pipe = trunkToConduit({ ...(trunk as object), shape: 'pipe', spec: { catalog: 'PF28', innerDiameterMm: 28, outerDiameterMm: 34 } } as never)
		expect([pipe.type === 'conduit' && pipe.w, pipe.type === 'conduit' && pipe.edges]).toEqual([34, 16])
	})
	it('merges into a model: adds, updates on re-import, keeps the user\'s own shapes, adds the layers once', () => {
		const m: Model = { id: 'm', name: '33F', objects: [], shapes: [{ id: 'mine', type: 'rect', a: [0, 0], b: [1, 1] }], layers: [] }
		const r1 = importOutletsInto(m, { outlets: [outlet()], trunks: [trunk] })
		expect([r1.added, r1.updated, r1.trunks]).toEqual([1, 0, 1])
		expect(r1.model.layers!.map((l) => l.id)).toEqual(['data', 'trunks'])
		const r2 = importOutletsInto(r1.model, { outlets: [outlet({ label: 'renamed' })], trunks: [trunk] })
		expect([r2.added, r2.updated]).toEqual([0, 1])
		expect(r2.model.shapes!.map((s) => s.id)).toEqual(['mine', 'out-o1'])
		expect(r2.model.shapes![1].attrs!.LABEL).toBe('renamed')
		expect(r2.model.objects).toHaveLength(1); expect(r2.model.layers).toHaveLength(2)
		expect(m.shapes).toHaveLength(1)   // input not mutated
	})
})
