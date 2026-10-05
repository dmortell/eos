// The tables' shared sort / filter / keys (UX review T5–T7).
import { describe, it, expect } from 'vitest'
import { TableState, arrowSelect } from './tableKit.svelte'

const rows = [{ id: 'a', label: 'A.10', n: 3 }, { id: 'b', label: 'A.2', n: 1 }, { id: 'c', label: 'B.1', n: 2 }]
const cols = { label: (r: (typeof rows)[number]) => r.label, n: (r: (typeof rows)[number]) => r.n }

describe('table kit', () => {
	it('sorts by a column (natural order), reverses, and goes back to the table order', () => {
		const t = new TableState('test')
		t.toggle('label')
		expect(t.apply(rows, (r) => r.label, cols).map((r) => r.id)).toEqual(['b', 'a', 'c'])   // A.2 before A.10
		t.toggle('label')
		expect(t.apply(rows, (r) => r.label, cols).map((r) => r.id)).toEqual(['c', 'a', 'b'])
		t.toggle('label')
		expect(t.apply(rows, (r) => r.label, cols).map((r) => r.id)).toEqual(['a', 'b', 'c'])
		t.toggle('n')
		expect(t.apply(rows, (r) => r.label, cols).map((r) => r.id)).toEqual(['b', 'c', 'a'])
	})
	it('filters by text', () => {
		const t = new TableState('test2')
		t.q = 'a.'
		expect(t.apply(rows, (r) => r.label, cols).map((r) => r.id)).toEqual(['a', 'b'])
	})
	it('↑ / ↓ move the selection along the shown rows', () => {
		let sel = ['b']
		const key = (k: string) => arrowSelect({ key: k, target: null } as unknown as KeyboardEvent, ['a', 'b', 'c'], sel, (x) => { sel = x })
		expect(key('ArrowDown')).toBe(true)
		expect(sel).toEqual(['c'])
		key('ArrowDown')
		expect(sel).toEqual(['c'])   // stays on the last
		key('ArrowUp'); key('ArrowUp')
		expect(sel).toEqual(['a'])
		expect(key('x')).toBe(false)
	})
})
