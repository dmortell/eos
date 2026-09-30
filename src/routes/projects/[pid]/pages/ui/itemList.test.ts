import { describe, it, expect } from 'vitest'
import { itemRows, filterItems, catCounts, rowKey } from './itemList'
import type { Model } from '../3dview/types'

const model: Model = {
	id: 'm', name: 'M',
	layers: [{ id: 'hi', name: 'Outlets high level', color: '#f00', visible: true, locked: false }, { id: 'lo', name: 'Outlets low level', color: '#00f', visible: false, locked: false }],
	shapes: [
		{ id: 'o10', type: 'insert', block: 'outlet-box', a: [0, 0], layer: 'hi', attrs: { LABEL: '4A10', PORTS: '2', TYPE: 'Data' } },
		{ id: 'o2', type: 'insert', block: 'outlet-box', a: [0, 0], layer: 'lo', fill: '#000', attrs: { LABEL: '4A2', PORTS: '1', TYPE: 'Power' } },
		{ id: 't', type: 'text', a: [0, 0], text: '## Meeting room\nmore', layer: 'hi' },
		{ id: 'v', type: 'text', a: [0, 0], text: 'view note', space: 'view:f2' },
		{ id: 'e', type: 'rect', a: [0, 0], b: [1200, 600], plane: 'front' },
		{ id: 'd', type: 'dim', a: [0, 0], b: [3000, 0] },
	],
	objects: [
		{ id: 'r', type: 'prism', x: 0, y: 0, z: 0, w: 600, d: 1000, h: 2000, edges: 4, rack: { u: 42 }, label: 'R01' },
		{ id: 'c', type: 'conduit', w: 100, h: 50, edges: 4, nodes: [], segments: [] },
	],
}

describe('items list', () => {
	const rows = itemRows(model)
	it('rows per category, outlets first in natural label order, with their facts', () => {
		expect(rows.slice(0, 2).map((r) => r.name)).toEqual(['4A2', '4A10'])
		expect(rows[1]).toMatchObject({ cat: 'outlet', level: 'High', usage: 'Data', ports: 2, layer: 'Outlets high level', detail: '2p · High · Data' })
		expect(rows[0].level).toBe('Low')
		expect(rows.find((r) => r.id === 't')?.name).toBe('Meeting room')
		expect(rows.find((r) => r.id === 'd')?.name).toBe('3000 mm')
		expect(rows.find((r) => r.id === 'r')).toMatchObject({ kind: 'obj', cat: 'rack', name: 'R01', detail: '42U' })
		expect(rows.find((r) => r.id === 'c')?.cat).toBe('trunk')
		expect(catCounts(rows).find((c) => c.id === 'outlet')?.n).toBe(2)
	})
	it('filters by category, level, usage, layer and text', () => {
		expect(filterItems(rows, { cat: 'outlet', level: 'Low' }).map((r) => r.id)).toEqual(['o2'])
		expect(filterItems(rows, { usage: 'Data' }).map((r) => r.id)).toEqual(['o10'])
		expect(filterItems(rows, { layer: 'hi' }).map((r) => r.id)).toEqual(['o10', 't'])
		expect(filterItems(rows, { q: 'meeting' }).map((r) => r.id)).toEqual(['t'])
	})
	it('"in this view" drops hidden layers, other views\' notes and other planes', () => {
		const hidden = (id?: string) => id === 'lo'
		const plan = filterItems(rows, { view: { hidden, frameId: 'f1', dir: 'plan' } }).map((r) => r.id)
		expect(plan).toContain('o10'); expect(plan).not.toContain('o2'); expect(plan).not.toContain('v'); expect(plan).not.toContain('e')
		const front = filterItems(rows, { view: { hidden, frameId: 'f2', dir: 'front' } }).map((r) => r.id)
		expect(front).toContain('e'); expect(front).toContain('v'); expect(front).not.toContain('o10')   // plan symbols aren't drawn in elevations
	})
	it('row keys carry the kind (a shape and an object may share an id)', () => {
		expect(rowKey(rows[0])).toBe('ent:o2'); expect(rowKey(rows.find((r) => r.id === 'r')!)).toBe('obj:r')
	})
})
