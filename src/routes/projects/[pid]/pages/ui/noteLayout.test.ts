import { describe, it, expect } from 'vitest'
import { layoutNote, wrap } from './noteLayout'

describe('K3 notes layout', () => {
	it('wraps words to the width (cutting a too-long word)', () => {
		expect(wrap('aa bb cc', 5)).toEqual(['aa bb', 'cc'])
		expect(wrap('abcdefgh', 3)).toEqual(['abc', 'def', 'gh'])
	})
	it('headings are bigger + bold; bullets and numbers are indented with their marker; height grows', () => {
		const L = layoutNote('# Title\n- one\n1. first', 80, 3)
		const t = L.items.filter((i) => i.kind === 'text') as Extract<(typeof L.items)[number], { kind: 'text' }>[]
		expect(t[0]).toMatchObject({ text: 'Title', bold: true }); expect(t[0].size).toBeCloseTo(4.8)
		expect(t.some((i) => i.text === '•')).toBe(true); expect(t.some((i) => i.text === '1.')).toBe(true)
		expect(t.find((i) => i.text === 'one')!.x).toBeGreaterThan(t[0].x)
		expect(L.h).toBeGreaterThan(15)
	})
	it('tables get a grid; the |---| row makes the first row a bold header', () => {
		const L = layoutNote('| A | B |\n|---|---|\n| 1 | 2 |', 80, 3)
		const lines = L.items.filter((i) => i.kind === 'line'), texts = L.items.filter((i) => i.kind === 'text') as { text: string; bold?: boolean }[]
		expect(lines).toHaveLength(3 + 3)   // 3 horizontal (2 rows) + 3 vertical (2 cols)
		expect(texts.find((i) => i.text === 'A')!.bold).toBe(true); expect(texts.find((i) => i.text === '1')!.bold).toBeFalsy()
	})
})
