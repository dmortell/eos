import { describe, it, expect } from 'vitest'
import { legendRows, legendSize, LEGEND } from './legend'
import type { Model } from '../3dview/types'

const model = {
	id: 'm', name: 'M',
	layers: [
		{ id: 'walls', name: 'Walls', color: '#111', visible: true, locked: false },
		{ id: 'data', name: 'Data Outlets', color: '#00f', visible: true, locked: false, group: 'Outlets' },
		{ id: 'cu', name: 'Copper Trunks', color: '#0a0', visible: true, locked: false, swatch: 'line', dash: 'dashed' },
		{ id: 'off', name: 'Hidden', color: '#999', visible: false, locked: false },
		{ id: 'empty', name: 'Empty', color: '#999', visible: true, locked: false },
		{ id: 'bg', name: 'Floorplan', color: '#999', visible: true, locked: false, group: 'Background' },
	],
	objects: [{ type: 'prism', layer: 'walls', x: 0, y: 0, z: 0, w: 1, d: 1, h: 1, edges: 4 }, { type: 'prism', layer: 'off', x: 0, y: 0, z: 0, w: 1, d: 1, h: 1, edges: 4 }],
	shapes: [
		{ id: 'o1', type: 'insert', block: 'outlet-box', layer: 'data' }, { id: 'o2', type: 'insert', block: 'outlet-box', layer: 'data' },
		{ id: 't', type: 'polyline', pts: [], layer: 'cu' }, { id: 'i', type: 'image', layer: 'bg' }, { id: 'lg', type: 'insert', block: 'legend', layer: 'data' },
	],
} as unknown as Model

describe('legend (D1)', () => {
	it('lists visible, non-empty, non-background layers with their counts; line layers get a line swatch', () => {
		expect(legendRows(model, {}).map((r) => [r.name, r.count, r.line])).toEqual([['Walls', 1, false], ['Data Outlets', 2, false], ['Copper Trunks', 1, true]])
	})
	it('EXCLUDE drops layers by name or id; the box grows with its rows', () => {
		expect(legendRows(model, { EXCLUDE: 'walls, copper trunks' }).map((r) => r.name)).toEqual(['Data Outlets'])
		expect(legendSize(3)).toEqual([LEGEND.w, LEGEND.title + 3 * LEGEND.row + LEGEND.pad])
	})
})
