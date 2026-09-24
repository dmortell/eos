import { describe, it, expect } from 'vitest'
import { outletRows } from './outletSchedule'
import type { Model } from '../3dview/types'

describe('outlet schedule (C2)', () => {
	it('lists outlets in natural label order with ports, level, patch and port labels', () => {
		const model = {
			id: 'm', name: 'M', objects: [], layers: [{ id: 'data', name: 'Data Outlets', color: '#00f', visible: true, locked: false }],
			shapes: [
				{ id: 'b', type: 'insert', block: 'outlet-wall', a: [10.4, 20], layer: 'data', attrs: { LABEL: '4A10', PORTS: '2', TYPE: 'network', NOTE: 'R1' } },
				{ id: 'a', type: 'insert', block: 'outlet-box', a: [0, 0], fill: '#0f0', attrs: { LABEL: '4A2', PORTS: '1' } },
				{ id: 't', type: 'text', a: [0, 0], text: 'not an outlet' },
			],
		} as unknown as Model
		const rows = outletRows(model, new Map([['b', 'R01 · PP-01 : 3-4']]))
		expect(rows.map((r) => r.label)).toEqual(['4A2', '4A10'])
		expect(rows[0]).toMatchObject({ mount: 'Rosette / box', level: 'Low', portLabels: '4A2' })
		expect(rows[1]).toMatchObject({ ports: 2, mount: 'Wall mount', level: 'High', room: 'R1', x: 10, layer: 'Data Outlets', patch: 'R01 · PP-01 : 3-4', portLabels: '4A10.A, 4A10.B' })
	})
})
