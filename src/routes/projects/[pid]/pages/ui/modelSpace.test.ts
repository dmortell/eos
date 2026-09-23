import { describe, it, expect } from 'vitest'
import { onDark } from './modelSpace'

describe('onDark (B31 model-space colours)', () => {
	it('lifts a colour too dark to read on the dark background', () => {
		expect(onDark('#475569')).toBe('#acb3bc')   // slate ink → light slate
		expect(onDark('#000')).toBe('#8c8c8c')
	})
	it('keeps colours that already read on dark', () => {
		for (const c of ['#dc2626', '#0e7490', '#2563eb', '#8a7f72', '#ffffff']) expect(onDark(c)).toBe(c)
	})
	it('passes non-hex values through', () => {
		for (const c of ['none', 'red', 'rgba(0,0,0,0.5)', 'var(--x)']) expect(onDark(c)).toBe(c)
	})
})
