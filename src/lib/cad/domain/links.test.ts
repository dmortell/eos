import { describe, it, expect } from 'vitest'
import { linkUrl, linkLabel, linkLive } from './links'
import type { Sheet } from './drawing'

const sheet = { type: 'sheet', id: 'S1', number: 'A-101', title: 'Level 3 plan' } as Sheet

describe('linked symbols', () => {
	it('a typed address becomes a web address we open; scripts never do', () => {
		expect(linkUrl('example.com/specs')).toBe('https://example.com/specs')
		expect(linkUrl(' https://example.com/a b')).toBeNull()   // spaces: not an address
		expect(linkUrl('http://example.com')).toBe('http://example.com/')
		expect(linkUrl('mailto:it@example.com')).toBe('mailto:it@example.com')
		expect(linkUrl('javascript:alert(1)')).toBeNull()
		expect(linkUrl('data:text/html,hi')).toBeNull()
		expect(linkUrl('ftp://example.com')).toBeNull()
		expect(linkUrl('')).toBeNull()
		expect(linkUrl('nodots')).toBeNull()
		expect(linkUrl('localhost:3000/x')).toBe('https://localhost:3000/x')
	})
	it('the badge says the sheet’s number and title, or the address without its scheme', () => {
		const of = (id: string) => (id === 'S1' ? sheet : undefined)
		expect(linkLabel({ kind: 'sheet', sheetId: 'S1' }, of)).toBe('A-101 Level 3 plan')
		expect(linkLabel({ kind: 'sheet', sheetId: 'X' }, of)).toBe('(sheet gone)')
		expect(linkLabel({ kind: 'url', url: 'https://example.com/x/' }, of)).toBe('example.com/x')
		expect(linkLive({ kind: 'sheet', sheetId: 'X' }, of)).toBe(false)
		expect(linkLive({ kind: 'url', url: 'https://example.com/' }, of)).toBe(true)
	})
})
