import { describe, it, expect } from 'vitest'
import { withDefaults, dimLabel } from './drawingDefaults'
import type { Ent } from './geometry'

describe('drawing defaults (D10)', () => {
	const d = { color: '#f00', fontPt: 10, weight: 0.5, dash: 'dashed' as const, dimHead: 'tick' as const, dimUnit: 'm' as const }
	it('fills only unset fields, per shape type', () => {
		expect(withDefaults({ id: 't', type: 'text', a: [0, 0] }, d)).toMatchObject({ color: '#f00', fontPt: 10 })
		expect(withDefaults({ id: 't', type: 'text', a: [0, 0] }, d).weight).toBeUndefined()
		expect(withDefaults({ id: 'l', type: 'polyline', pts: [], color: '#00f' }, d)).toMatchObject({ color: '#00f', weight: 0.5, dash: 'dashed' })
		expect(withDefaults({ id: 'd', type: 'dim', a: [0, 0], b: [1, 0] }, d)).toMatchObject({ headStart: 'tick', headEnd: 'tick', unit: 'm' })
	})
	it('leaves blocks, images and empty ("unset") defaults alone', () => {
		const ins: Ent = { id: 'i', type: 'insert', block: 'x', a: [0, 0] }
		expect(withDefaults(ins, d)).toBe(ins)
		expect(withDefaults({ id: 'r', type: 'rect', a: [0, 0], b: [1, 1] }, { color: '', weight: 0, dash: '' })).toEqual({ id: 'r', type: 'rect', a: [0, 0], b: [1, 1] })
	})
	it('formats a dimension in its unit', () => {
		expect([dimLabel(1234.4), dimLabel(1234.4, 'cm'), dimLabel(1234.4, 'm')]).toEqual(['1234', '123.4', '1.23'])
	})
})
