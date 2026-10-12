import { describe, it, expect } from 'vitest'
import { newShapeStyle, styleForNew, styleProp } from './shapeDefaults'
import type { ProjectSettings } from './types'
import type { Layer } from './drawing'

const settings = (shapeStyle?: ProjectSettings['shapeStyle']) => ({ type: 'settings', id: 'settings', shapeStyle }) as ProjectSettings

describe('the project’s defaults for new shapes', () => {
	it('a new shape starts with the project’s color, line type and lineweight', () => {
		expect(newShapeStyle(settings({ color: '#ff0000', dash: 'dashed', weightMm: 0.5 }))).toEqual({ stroke: '#ff0000', dash: 'dashed', weightMm: 0.5 })
	})
	it('nothing set (or by kind: empty / 0) leaves the shape without a style', () => {
		expect(newShapeStyle(settings())).toBeUndefined()
		expect(newShapeStyle(settings({ color: '', dash: '', weightMm: 0 }))).toBeUndefined()
		expect(newShapeStyle(undefined)).toBeUndefined()
		expect(newShapeStyle(settings({ color: '', dash: 'wavy', weightMm: 0 }))).toBeUndefined()
	})
	it('what the target layer sets itself is left to the layer (a shape’s own would override it)', () => {
		const d = settings({ color: '#ff0000', dash: 'dotted', weightMm: 0.35 })
		expect(newShapeStyle(d, { color: '#00f' })).toEqual({ dash: 'dotted', weightMm: 0.35 })
		expect(newShapeStyle(d, { color: '#00f', dash: 'dashed', weightMm: 0.7 })).toBeUndefined()
	})
	it('for a tool: the current layer’s own look is read from the project’s layer records; no layer = the Drawing layer', () => {
		const layers: Layer[] = [{ type: 'layer', id: 'L1', name: 'Red', order: 500, color: '#c00' }, { type: 'layer', id: 'sys:drawing', name: 'Drawing', order: 30, weightMm: 0.7 }]
		const d = settings({ color: '#ff0000', dash: '', weightMm: 0.25 })
		expect(styleForNew(d, layers, 'L1')).toEqual({ weightMm: 0.25 })
		expect(styleForNew(d, layers, null)).toEqual({ stroke: '#ff0000' })
		expect(styleProp(d, layers, 'L1')).toEqual({ style: { weightMm: 0.25 } })
		expect(styleProp(settings(), layers, 'L1')).toEqual({})
	})
})
