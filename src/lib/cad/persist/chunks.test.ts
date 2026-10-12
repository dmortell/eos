import { describe, it, expect } from 'vitest'
import { splitChunks } from './chunks'

describe('chunks', () => {
	it('join back to the text, and never cut a character outside the BMP in half', () => {
		const text = 'ab𠮷cd𠮷'   // 𠮷 is two UTF-16 units
		for (const size of [1, 2, 3, 4]) {
			const parts = splitChunks(text, size)
			expect(parts.join('')).toBe(text)
			for (const p of parts) expect(/[\uD800-\uDBFF]$/.test(p)).toBe(false)
		}
		expect(splitChunks('')).toEqual([''])
	})
})
