// Match properties: one shape's layer and look onto others.
import { describe, it, expect } from 'vitest'
import { matchProps } from './match'
import type { Shape } from './shapes'
import type { Layer } from './drawing'

const box = (id: string, extra: Partial<Shape> = {}) => ({ type: 'shape', id, levelId: 'L1', geom: { kind: 'rect', centre: { x: 0, y: 0 }, size: { x: 100, y: 100 } }, ...extra }) as Shape
const text = (id: string, sizeMm: number, extra: Partial<Shape> = {}) => ({ type: 'shape', id, levelId: 'L1', geom: { kind: 'text', at: { x: 0, y: 0 }, text: 'A', sizeMm }, ...extra }) as Shape
const layers: Layer[] = [{ type: 'layer', id: 'IDF1', name: 'IDF1', order: 500 }]

describe('match properties', () => {
	it('copies the layer and the look; the target keeps what it is (geometry, line ends)', () => {
		const src = box('S', { layerId: 'IDF1', style: { stroke: '#f00', dash: 'dashed', weightMm: 0.5 } })
		const t = box('T', { style: { fill: '#0f0', ends: { a: 'arrow' } } })
		const out = matchProps(src, t, layers)!
		expect(out.layerId).toBe('IDF1')
		expect(out.style).toEqual({ stroke: '#f00', dash: 'dashed', weightMm: 0.5, ends: { a: 'arrow' } })   // its fill dropped: the source has none
		expect(out.geom).toEqual(t.geom)
	})
	it('a source on its default layer (Drawing) puts a box back on Drawing, a text on Drawing too', () => {
		const out = matchProps(box('S'), box('T', { layerId: 'IDF1' }), layers)!
		expect('layerId' in out).toBe(false)
		expect(matchProps(box('S'), text('X', 2.5), layers)!.layerId).toBe('sys:drawing')   // a note's default is Notes
	})
	it('a text takes the size of a source text; nothing to do on itself or a match', () => {
		expect((matchProps(text('A', 5), text('B', 2.5), layers)!.geom as { sizeMm: number }).sizeMm).toBe(5)
		const s = box('S', { style: { stroke: '#f00' } })
		expect(matchProps(s, s, layers)).toBeNull()
		expect(matchProps(s, box('T', { style: { stroke: '#f00' } }), layers)).toBeNull()
	})
})
