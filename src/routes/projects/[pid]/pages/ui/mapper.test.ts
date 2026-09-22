import { describe, it, expect } from 'vitest'
import { makeMapper, type MapperArgs } from './mapper'

// A fake rect (jsdom-free): only left/top/width are read by the mapper.
const rect = (left: number, top: number, width: number): DOMRect => ({ left, top, width, right: left + width, x: left, y: top, height: width, bottom: top + width, toJSON: () => ({}) })

const args = (over: Partial<MapperArgs> = {}): MapperArgs => ({
	rect: rect(100, 50, 800), vbW: 400, minX: 0, minY: 0, cx: 200, cy: 125, view: { zoom: 1, x: 0, y: 0 }, dscale: 1, ...over,
})

describe('makeMapper', () => {
	it('toModel and toClient round-trip', () => {
		for (const a of [args(), args({ view: { zoom: 2, x: 30, y: -15 } }), args({ dscale: 0.01, cx: 14000, cy: 8750, vbW: 40 })]) {
			const m = makeMapper(a)
			const p = { x: 137, y: 264 }
			const model = m.toModel(p.x, p.y)
			const back = m.toClient(model[0], model[1])
			expect(back.x).toBeCloseTo(p.x, 6)
			expect(back.y).toBeCloseTo(p.y, 6)
		}
	})

	it('tolMm converts screen px to model mm (scaled by 1/dscale)', () => {
		// scale = rect.width/vbW = 800/400 = 2 px per viewBox unit; view.zoom 1.
		expect(makeMapper(args()).tolMm(10)).toBeCloseTo(10 / (1 * 2) / 1, 9)          // = 5 model units at 1:1
		expect(makeMapper(args({ dscale: 0.01 })).tolMm(10)).toBeCloseTo(10 / 2 / 0.01, 9) // 100× larger at 1:100
	})

	it('a viewBox unit maps to `scale` client px at zoom 1', () => {
		const m = makeMapper(args())   // scale = 2
		const a = m.toClient(m.toModel(100, 100)[0], m.toModel(100, 100)[1])
		expect(a.x).toBeCloseTo(100, 6)
	})
})
