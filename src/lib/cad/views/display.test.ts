// The bounds of a drawn prim (display.ts): what selection boxes, picking and zoom-to-fit measure.
import { describe, it, expect } from 'vitest'
import { primBounds } from './display'

describe('primBounds', () => {
	it('turned text is measured turned: a 0U PDU’s name up its 40 mm strip stays inside the strip, not as wide as the name is long', () => {
		const flat = primBounds({ k: 'text', at: { x: 30, y: -500 }, text: 'PDU-A1 metered 32A', size: 22, anchor: 'middle', cls: 'device-label' })
		const up = primBounds({ k: 'text', at: { x: 30, y: -500 }, text: 'PDU-A1 metered 32A', size: 22, anchor: 'middle', rot: -90, cls: 'device-label' })
		expect(flat.x1 - flat.x0).toBeCloseTo(18 * 22 * 0.6)
		expect(up.x0).toBeCloseTo(8)
		expect(up.x1).toBeCloseTo(34.4)
		expect(up.y1 - up.y0).toBeCloseTo(flat.x1 - flat.x0)
	})
})
