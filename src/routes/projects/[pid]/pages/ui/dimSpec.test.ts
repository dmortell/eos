import { describe, it, expect } from 'vitest'
import { dimSpec, resolveDimMode } from './dimSpec.svelte'

describe('dimSpec — the Dimension tool mode', () => {
	it('resolves Linear (auto) by the larger delta; the others as set', () => {
		expect(resolveDimMode('auto', [0, 0], [500, 100])).toBe('h')
		expect(resolveDimMode('auto', [0, 0], [100, -500])).toBe('v')
		expect(resolveDimMode('aligned', [0, 0], [500, 100])).toBe('aligned')
		expect(resolveDimMode('v', [0, 0], [500, 100])).toBe('v')
	})
	it('command-line options by their leading letters: A / L / H / V; anything else is not an option', () => {
		expect(dimSpec.option('h')).toBe(true); expect(dimSpec.mode).toBe('h')
		expect(dimSpec.option('VERT')).toBe(true); expect(dimSpec.mode).toBe('v')
		expect(dimSpec.option('L')).toBe(true); expect(dimSpec.mode).toBe('auto')
		expect(dimSpec.option('a')).toBe(true); expect(dimSpec.mode).toBe('aligned')
		expect(dimSpec.option('U')).toBe(false); expect(dimSpec.option('C')).toBe(false); expect(dimSpec.option('')).toBe(false)
		expect(dimSpec.mode).toBe('aligned')
	})
})
