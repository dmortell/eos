import { describe, it, expect } from 'vitest'
import { similarTo } from './similar'
import type { Entity } from './drawing'

const sh = (id: string, geom: object, more: object = {}) => ({ type: 'shape', id, geom, ...more }) as unknown as Entity
const line = { kind: 'path', nodes: [], segs: [] }

describe('select similar', () => {
	it('a shape matches the same drawn kind on the same layer; an insert the same block; a run the same role', () => {
		const all = [
			sh('a', line, { layerId: 'L1' }), sh('b', line, { layerId: 'L1' }), sh('c', line, { layerId: 'L2' }),
			sh('d', { kind: 'rect' }, { layerId: 'L1' }),
			sh('i1', { kind: 'insert', blockId: 'B1' }), sh('i2', { kind: 'insert', blockId: 'B1' }, { layerId: 'L9' }), sh('i3', { kind: 'insert', blockId: 'B2' }),
			sh('t1', line, { role: { kind: 'containment' } }), sh('t2', line, { role: { kind: 'containment' } }), sh('w', line, { role: { kind: 'wall' } }),
		]
		const get = (id: string) => all.find((e) => e.id === id)!
		expect(similarTo([get('a')], all)).toEqual(['a', 'b'])
		expect(similarTo([get('i1')], all)).toEqual(['i1', 'i2'])
		expect(similarTo([get('t1')], all)).toEqual(['t1', 't2'])
		expect(similarTo([get('d'), get('w')], all)).toEqual(['d', 'w'])
	})
	it('racks and devices match by kind; other things by type', () => {
		const all = [
			{ type: 'rack', id: 'r1', kind: 'cabinet' }, { type: 'rack', id: 'r2', kind: 'vcm' }, { type: 'rack', id: 'r3', kind: 'cabinet' },
			{ type: 'device', id: 'd1', kind: 'panel' }, { type: 'device', id: 'd2', kind: 'switch' },
			{ type: 'outlet', id: 'o1' }, { type: 'outlet', id: 'o2' },
		] as unknown as Entity[]
		expect(similarTo([all[0]], all)).toEqual(['r1', 'r3'])
		expect(similarTo([all[3]], all)).toEqual(['d1'])
		expect(similarTo([all[5]], all)).toEqual(['o1', 'o2'])
	})
})
