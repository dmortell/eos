// File names for downloads.
import { describe, it, expect } from 'vitest'
import { fileSafe } from './download'

describe('fileSafe', () => {
	it('keeps Japanese text and letters; replaces what Windows / macOS forbid (Q26)', () => {
		expect(fileSafe('東京オフィス 1F')).toBe('東京オフィス_1F')
		expect(fileSafe('Test Project: 1F/2F')).toBe('Test_Project_1F_2F')
		expect(fileSafe('a.b-c_d')).toBe('a.b-c_d')
		expect(fileSafe('///')).toBe('export')
	})
})
