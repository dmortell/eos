// Markdown notes: the pure layout (markdown → positioned runs and table rules) and the prims it becomes.
import { describe, it, expect } from 'vitest'
import { layoutMarkdown, parseInline, markdownPrims, mdWidth, type MdItem } from './markdown'
import { shapePrims } from './plan'
import { displayListToDxf } from '../render/dxf'
import type { Shape } from '../domain/shapes'

const texts = (items: MdItem[]) => items.filter((i): i is Extract<MdItem, { k: 'text' }> => i.k === 'text')
const rules = (items: MdItem[]) => items.filter((i): i is Extract<MdItem, { k: 'rule' }> => i.k === 'rule')

describe('inline', () => {
	it('bold, italic, both; code plain; escapes', () => {
		expect(parseInline('a **b** *c* ***d*** `e` \\*f')).toEqual([
			{ text: 'a ' }, { text: 'b', bold: true }, { text: ' ' }, { text: 'c', italic: true }, { text: ' ' }, { text: 'd', bold: true, italic: true }, { text: ' ' }, { text: 'e' }, { text: ' *f' },
		])
	})
	it('~~struck~~ and __underlined__ (User 2026-10-14: __ is no longer bold); \\~ escapes', () => {
		expect(parseInline('a ~~b~~ __c__ \\~~d')).toEqual([{ text: 'a ' }, { text: 'b', strike: true }, { text: ' ' }, { text: 'c', under: true }, { text: ' ~~d' }])
	})
	it('a struck / underlined stretch draws one line through / under its words, not past them; plain words get none', () => {
		const items = layoutMarkdown('x ~~two words~~ y __u__', 10).items, [r1, r2] = rules(items), w = (t: string) => mdWidth(t, 10)
		expect(rules(items)).toHaveLength(2)
		expect(r1).toMatchObject({ x0: w('x '), x1: w('x two words'), y0: -3, y1: -3 })   // through the middle of the letters
		expect(r2).toMatchObject({ x0: w('x two words y '), x1: w('x two words y u'), y0: 1.5 })   // just under the baseline
		expect(texts(items).every((t) => !t.bold)).toBe(true)
		// on paper and in DXF as lines, like a table's rules
		const s = { type: 'shape', id: 'n', sheetId: 'S', geom: { kind: 'text', at: { x: 0, y: 0 }, text: '~~gone~~', sizeMm: 2.5, markdown: true } } as Shape
		expect(markdownPrims(s.geom as never, 1, 'n').prims.filter((p) => p.k === 'line')).toHaveLength(1)
	})
	it('a lone * or snake_case is left alone', () => {
		expect(parseInline('2 * 3 and a_b_c')).toEqual([{ text: '2 * 3 and a_b_c' }])
	})
})

describe('layout', () => {
	it('lines go down from a first baseline of 0; a blank line is a half gap', () => {
		const t = texts(layoutMarkdown('one\n\ntwo', 10).items)
		expect(t.map((i) => [i.text, i.y])).toEqual([['one', 0], ['two', 13 + 6.5]])
	})
	it('a heading is bigger and bold', () => {
		const [h, p] = texts(layoutMarkdown('# Title\nbody', 10).items)
		expect(h).toMatchObject({ text: 'Title', size: 16, bold: true })
		expect(p.size).toBe(10)
		expect(p.y).toBeGreaterThan(h.y)
	})
	it('bullets hang: the marker at the indent, the words after the gap, wrapped words under the words', () => {
		const t = texts(layoutMarkdown('- alpha beta gamma delta epsilon', 10, 80).items)
		expect(t[0]).toMatchObject({ text: '•', x: 0 })
		expect(t[1].x).toBe(15)
		const second = t.filter((i) => i.y > 0)
		expect(second.length).toBeGreaterThan(0)
		expect(second.every((i) => i.x === 15)).toBe(true)
		expect(Math.max(...t.map((i) => i.x + mdWidth(i.text, i.size)))).toBeLessThanOrEqual(80)
	})
	it('numbered lists keep their numbers; nested ones indent', () => {
		const t = texts(layoutMarkdown('1. one\n2. two\n  - sub', 10).items)
		expect(t.filter((i) => /^\d\.$/.test(i.text)).map((i) => i.text)).toEqual(['1.', '2.'])
		expect(t.find((i) => i.text === 'sub')!.x).toBeGreaterThan(t.find((i) => i.text === 'two')!.x - 1)
	})
	it('bold in the middle of a line is its own run, after the plain one', () => {
		const t = texts(layoutMarkdown('see **this** now', 10).items)
		expect(t.map((i) => [i.text, !!i.bold])).toEqual([['see ', false], ['this', true], [' now', false]])
		expect(t[1].x).toBeCloseTo(mdWidth('see ', 10))
	})
	it('wraps to the width and never past it', () => {
		const lay = layoutMarkdown('the quick brown fox jumps over the lazy dog', 10, 100)
		expect(new Set(texts(lay.items).map((i) => i.y)).size).toBeGreaterThan(1)
		expect(lay.width).toBeLessThanOrEqual(100)
	})
	it('a table: header bold, a grid of rules, right-aligned column ends at its edge', () => {
		const lay = layoutMarkdown('| Item | Qty |\n|:--|--:|\n| Cat 6 | 12 |\n| Patch | 3 |', 10)
		const t = texts(lay.items), r = rules(lay.items)
		expect(t.filter((i) => i.bold).map((i) => i.text)).toEqual(['Item', 'Qty'])
		expect(r.filter((i) => i.y0 === i.y1)).toHaveLength(4)   // top, under the header, under row 1, bottom
		expect(r.filter((i) => i.x0 === i.x1)).toHaveLength(3)   // 2 columns
		const right = Math.max(...r.map((i) => i.x1)), qty = t.find((i) => i.text === '12')!
		expect(qty.x + mdWidth('12', 10)).toBeCloseTo(right - 4)
		expect(t.find((i) => i.text === 'Cat 6')!.x).toBeCloseTo(4)
	})
	it('a narrow width wraps cells and keeps the table inside it', () => {
		const wide = layoutMarkdown('| a | b |\n|---|---|\n| one two three four | five six seven eight |', 10)
		const narrow = layoutMarkdown('| a | b |\n|---|---|\n| one two three four | five six seven eight |', 10, 120)
		expect(narrow.width).toBeLessThanOrEqual(120)
		expect(wide.width).toBeGreaterThan(120)
		expect(narrow.height).toBeGreaterThan(wide.height)
	})
	it('a table without a --- row has no header; text after it continues below', () => {
		const lay = layoutMarkdown('| a | b |\n| c | d |\nafter', 10)
		expect(texts(lay.items).some((i) => i.bold)).toBe(false)
		const after = texts(lay.items).find((i) => i.text === 'after')!, bottom = Math.max(...rules(lay.items).map((i) => i.y1))
		expect(after.y).toBeGreaterThan(bottom)
	})
})

describe('prims, PDF classes and DXF', () => {
	const note = (extra: object = {}): Shape => ({ type: 'shape', id: 'N', levelId: 'L', geom: { kind: 'text', at: { x: 1000, y: 2000 }, text: '# Hi\n| a | b |\n|---|---|\n| 1 | **2** |', sizeMm: 2.5, markdown: true, ...extra } } as Shape)
	it('texts are note prims (bold / italic classes), rules are lines, all picking the shape; sized by k', () => {
		const ps = markdownPrims((note().geom as never), 100, 'N').prims
		expect(ps.every((p) => p.src === 'N')).toBe(true)
		const hi = ps.find((p) => p.k === 'text' && p.text === 'Hi')!
		expect(hi).toMatchObject({ k: 'text', size: 400, cls: 'note note-b' })
		expect(ps.filter((p) => p.k === 'line').length).toBeGreaterThan(0)
		expect(ps.find((p) => p.k === 'line')).toMatchObject({ cls: 'leader' })
	})
	it('a turned note turns its rules and runs about its point', () => {
		const ps = markdownPrims((note({ rot: 90 }).geom as never), 1, 'N').prims
		expect(ps.find((p) => p.k === 'text' && p.text === 'Hi')).toMatchObject({ rot: 90 })
		const t = ps.find((p) => p.k === 'text' && p.text === 'a')!
		expect((t as { at: { x: number; y: number } }).at.x).toBeLessThan(1000)   // down the text = −x when turned 90
	})
	it('the plan generator draws it (and a plain text is unchanged)', () => {
		const ps = shapePrims(note(), 100)
		expect(ps.some((p) => p.k === 'line' && p.cls === 'leader')).toBe(true)
		const plain = shapePrims(note({ markdown: undefined, text: 'x' }), 100)
		expect(plain).toHaveLength(1)
	})
	it('the DXF carries the text runs and the table rules', () => {
		const ps = shapePrims(note(), 100)
		const r = displayListToDxf(ps)
		expect(r.entities).toBe(ps.length)   // every run a TEXT, every rule a polyline
		expect(r.text).toContain('Hi')
	})
})
