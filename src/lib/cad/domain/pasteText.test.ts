// Text to and from office apps: pasted text / tables → notes; copied items → readable words.
import { describe, it, expect } from 'vitest'
import { pastedNote, parseTsv, htmlTable, toMarkdownTable, readableClip } from './pasteText'
import type { Entity } from './types'

describe('pasted text', () => {
	it('plain text stays a plain note, trailing blank lines dropped', () => {
		expect(pastedNote('Hello\r\nworld\r\n\r\n')).toEqual({ text: 'Hello\nworld', markdown: false })
		expect(pastedNote('  \n ')).toBeNull()
	})
	it('Excel cells (tabs) become a markdown table, the first row the header', () => {
		expect(pastedNote('Room\tU\nA1\t12\nA2\t4\n')).toEqual({ text: '| Room | U |\n| --- | --- |\n| A1 | 12 |\n| A2 | 4 |', markdown: true })
	})
	it('a quoted cell may hold a tab, a newline, a quote', () => {
		expect(parseTsv('a\t"b\tc"\n"x\ny"\t"say ""hi"""')).toEqual([['a', 'b\tc'], ['x\ny', 'say "hi"']])
	})
	it('a | inside a cell is escaped; short rows are padded', () => {
		expect(toMarkdownTable([['a|b', 'c'], ['d']])).toBe('| a\\|b | c |\n| --- | --- |\n| d |  |')
	})
	it('an HTML table (Word, a web page) wins over its plain text, entities and tags cleaned', () => {
		const html = '<html><body><table><tr><th>Item</th><th>Qty</th></tr><tr><td><b>Cat&nbsp;6</b></td><td>12 &amp; more</td></tr></table></body></html>'
		expect(htmlTable(html)).toEqual([['Item', 'Qty'], ['Cat 6', '12 & more']])
		expect(pastedNote('Item\tQty', html)?.text).toBe('| Item | Qty |\n| --- | --- |\n| Cat 6 | 12 & more |')
	})
	it('a single-cell HTML table is just text', () => {
		expect(pastedNote('one', '<table><tr><td>one</td></tr></table>')).toEqual({ text: 'one', markdown: false })
	})
})

describe('copied items as words', () => {
	it('texts and callouts as typed, others by label / name, one per line', () => {
		const items = [
			{ type: 'shape', id: 'a', geom: { kind: 'text', text: 'Note one' } },
			{ type: 'shape', id: 'b', geom: { kind: 'leader', text: 'Callout' } },
			{ type: 'shape', id: 'c', label: 'Wall', geom: { kind: 'path' } },
			{ type: 'outlet', id: 'd', label: '33-001' },
			{ type: 'rack', id: 'e', name: 'R301' },
			{ type: 'shape', id: 'f', geom: { kind: 'rect' } },
		] as unknown as Entity[]
		expect(readableClip(items)).toBe('Note one\nCallout\nWall\n33-001\nR301')
	})
})
