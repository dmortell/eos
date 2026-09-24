import { describe, it, expect } from 'vitest'
import { viewToDxf } from './exportDxf'
import type { Model } from './3dview/types'
import type { Ent } from './ui/geometry'

const model: Model = {
	id: 'm', name: 'M',
	layers: [
		{ id: 'walls', name: 'Walls', color: '#ff0000', visible: true, locked: false },
		{ id: 'off', name: 'Hidden', color: '#00ff00', visible: false, locked: false },
		{ id: 'anno', name: 'Annotations', color: '#0000ff', visible: true, locked: false, group: 'General' },
	],
	objects: [
		{ type: 'prism', id: 'p1', layer: 'walls', x: 1000, y: 2000, z: 0, w: 600, d: 400, h: 2000, edges: 4, label: 'IDF-A' },
		{ type: 'prism', id: 'p2', layer: 'off', x: 0, y: 0, z: 0, w: 10, d: 10, h: 10, edges: 4 },
	],
} as Model
const ents: Ent[] = [
	{ id: 'r', type: 'rect', a: [0, 0], b: [100, 50], layer: 'anno' },
	{ id: 't', type: 'text', a: [10, 10], text: 'HELLO', layer: 'anno' },
	{ id: 'i', type: 'image', a: [0, 0], b: [10, 10], src: 'x', layer: 'anno' },
	{ id: 'e', type: 'rect', a: [0, 0], b: [10, 10], layer: 'anno', plane: 'front' },   // an elevation shape: not in the plan
]

describe('DXF export (C1)', () => {
	it('exports the plan: visible objects (y flipped), labels, plan shapes; hidden layers + images left out', () => {
		const r = viewToDxf({ model, ents, dir: 'plan', scaleN: 100 })
		expect(r.objects).toBe(1)
		expect(r.shapes).toBe(2)
		expect(r.skipped).toBe(1)
		expect(r.text).toContain('Walls')
		expect(r.text).toContain('Annotations')
		expect(r.text).not.toContain('Hidden')
		expect(r.text).toContain('IDF-A')
		expect(r.text).toContain('HELLO')
		expect(r.text).toMatch(/\n-2000(\.0+)?\r?\n/)   // the box's y = 2000 → DXF −2000 (y-up)
	})
	it('an elevation keeps its own shapes and puts the ground at Y = 0', () => {
		const r = viewToDxf({ model, ents, dir: 'front', scaleN: 50 })
		expect(r.shapes).toBe(1)
		expect(r.text).toMatch(/\n2000(\.0+)?\r?\n/)   // the 2000-high box's top
	})
})
