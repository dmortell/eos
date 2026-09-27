import { describe, it, expect } from 'vitest'
import { polyMeasure, entMeasure, fmtArea } from './area'
import type { Ent } from './geometry'

describe('AREA (O19)', () => {
	it('a polygon: shoelace area (either winding) + perimeter with the closing edge', () => {
		expect(polyMeasure([[0, 0], [4000, 0], [4000, 3000], [0, 3000]])).toEqual({ area: 12e6, perimeter: 14000 })
		expect(polyMeasure([[0, 0], [0, 3000], [4000, 3000], [4000, 0]]).area).toBe(12e6)
		expect(polyMeasure([[0, 0], [3, 4]])).toEqual({ area: 0, perimeter: 5 })
	})
	it('shapes: rect, ellipse (π a b), a closed polyline; a line / text is no area', () => {
		const e = (o: Partial<Ent>) => ({ id: 'e', type: 'rect', ...o }) as Ent
		expect(entMeasure(e({ a: [0, 0], b: [2000, -1000] }))).toEqual({ area: 2e6, perimeter: 6000 })
		const c = entMeasure(e({ type: 'ellipse', a: [0, 0], b: [2000, 2000] }))!
		expect(c.area).toBeCloseTo(Math.PI * 1e6); expect(c.perimeter).toBeCloseTo(2 * Math.PI * 1000)
		expect(entMeasure(e({ type: 'polyline', a: undefined, pts: [[0, 0], [10, 0], [10, 10], [0, 0]] }))!.area).toBe(50)
		expect(entMeasure(e({ type: 'polyline', a: undefined, pts: [[0, 0], [10, 0]] }))).toBeNull()
		expect(entMeasure(e({ type: 'text', b: undefined }))).toBeNull()
	})
	it('formats m² with mm² in brackets; tiny areas in mm² only', () => {
		expect(fmtArea(12e6)).toBe('12 m² (12,000,000 mm²)')
		expect(fmtArea(2500)).toBe('2,500 mm²')
	})
})
