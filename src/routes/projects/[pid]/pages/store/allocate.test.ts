import { describe, it, expect } from 'vitest'
import { allocate, unallocate, allocatedOutlets, portLabel, outletRef } from './allocate'
import type { Model } from '../3dview/types'
import type { Ent } from '../ui/geometry'

const o = (id: string, ports: number) => ({ id, model: 'f', label: id.toUpperCase(), ports })

describe('allocate outlet ports to a panel (E8)', () => {
	it('fills ports in order from the start port, skipping taken ones; per-port letters', () => {
		const r1 = allocate({}, 24, [o('a', 2), o('b', 1)])
		expect(Object.keys(r1.alloc)).toEqual(['1', '2', '3'])
		expect(r1.alloc['2']).toEqual({ outlet: 'a', model: 'f', port: 2, label: 'A.B' })
		expect(r1.alloc['3'].label).toBe('B')
		const r2 = allocate(r1.alloc, 24, [o('c', 2)], 2)
		expect(r2.alloc['4'].outlet).toBe('c'); expect(r2.alloc['5'].outlet).toBe('c')
	})
	it('moves an outlet already on the panel; what does not fit overflows; unallocate frees', () => {
		const a = allocate({}, 4, [o('a', 2), o('b', 2)]).alloc
		const moved = allocate(a, 4, [o('a', 2)], 3)   // a's ports 1-2 freed, 3-4 are b's → no room
		expect(moved.overflow.map((x) => x.id)).toEqual(['a'])
		expect(unallocate(a, { outlets: ['a'] })).toEqual({ 3: a['3'], 4: a['4'] })
		expect(Object.keys(unallocate(a, { ports: [1] }))).toEqual(['2', '3', '4'])
	})
	it('lists allocated outlets with their rack · panel : ports; reads LABEL / PORTS off an outlet', () => {
		const alloc = allocate({}, 24, [o('a', 2)]).alloc
		const m = { id: 'r', name: 'Row', objects: [
			{ type: 'prism', id: 'rk', label: 'R01', x: 0, y: 0, z: 0, w: 1, d: 1, h: 1, edges: 4, rack: { u: 42 } },
			{ type: 'prism', id: 'pp', label: 'PP-01', x: 0, y: 0, z: 0, w: 1, d: 1, h: 1, edges: 4, device: { rackId: 'rk', u: 40, hU: 1, alloc } },
		] } as Model
		expect(allocatedOutlets([m]).get('a')).toBe('R01 · PP-01 : 1-2')
		expect(portLabel('X', 1, 1)).toBe('X')
		expect(outletRef({ id: 'e', type: 'insert', attrs: { LABEL: 'L', PORTS: '4' } } as Ent, 'm')).toEqual({ id: 'e', model: 'm', label: 'L', ports: 4 })
	})
})
