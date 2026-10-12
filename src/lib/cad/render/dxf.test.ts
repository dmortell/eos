import { describe, it, expect } from 'vitest'
import { displayListToDxf } from './dxf'
import type { Prim } from '../views/display'

describe('DXF export', () => {
	it('a project layer name DXF refuses is made safe, and names differing only by case stay apart', () => {
		const prims: Prim[] = [
			{ k: 'line', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }], cls: 'shape', layer: 'a' },
			{ k: 'line', pts: [{ x: 0, y: 5 }, { x: 10, y: 5 }], cls: 'shape', layer: 'b' },
		]
		const { text } = displayListToDxf(prims, new Map([['a', 'Low: A/V'], ['b', 'LOW_ A_V']]))
		expect(text).toContain('\nLow_ A_V\n')
		expect(text).toContain('\nLOW_ A_V_2\n')
		expect(text).not.toContain('Low: A/V')
	})
	it('a text of several lines becomes one TEXT per line (a newline would break the file)', () => {
		const { text, entities } = displayListToDxf([{ k: 'text', at: { x: 0, y: 0 }, text: 'First\nSecond', size: 2.5, cls: 'note' }])
		expect(entities).toBe(2)
		expect(text).toContain('\nFirst\n')
		expect(text).toContain('\nSecond\n')
		expect(text).not.toContain('First\nSecond')
	})
})
