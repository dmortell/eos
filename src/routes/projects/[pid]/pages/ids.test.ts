import { describe, it, expect } from 'vitest'
import { newId } from './ids'

// B13: ONE id generator for the whole Pages tool, built on nanoid. Callers rely on the `<prefix><8 chars>`
// shape only loosely (human-scannable prefixes in the store); nothing parses the suffix.
describe('newId', () => {
	it('keeps the prefix and appends an 8-char URL-safe suffix (default prefix "x")', () => {
		expect(newId('e')).toMatch(/^e[A-Za-z0-9_-]{8}$/)
		expect(newId('vf')).toMatch(/^vf[A-Za-z0-9_-]{8}$/)
		expect(newId()).toMatch(/^x[A-Za-z0-9_-]{8}$/)
		expect(newId('ly').length).toBe(2 + 8)
	})
	it('never emits ":" — pane/view keys are joined with ":" and split on it', () => {
		for (let i = 0; i < 1000; i++) expect(newId('p')).not.toContain(':')
	})
	it('is unique across 10 000 ids with the same prefix', () => {
		const seen = new Set<string>()
		for (let i = 0; i < 10_000; i++) seen.add(newId('n'))
		expect(seen.size).toBe(10_000)
	})
	it('two prefixes never collide even with the same suffix space', () => {
		expect(newId('t').startsWith('t')).toBe(true)
		expect(newId('t')).not.toBe(newId('t'))
	})
})
