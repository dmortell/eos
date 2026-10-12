// The tables' shared sort / filter / keys (UX review T5–T7).
import { describe, it, expect } from 'vitest'
import { TableState, arrowSelect, selectAllRows, RowPick, nextCell, CellEdit } from './tableKit.svelte'

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
	it('starts on its own column and scope, and a third click still goes back to the table order', () => {
		const t = new TableState('test3', 'all', 'label', ['sel', 'all'])
		expect(t.scope).toBe('all')
		expect(t.apply(rows, (r) => r.label, cols).map((r) => r.id)).toEqual(['b', 'a', 'c'])
		t.toggle('label'); t.toggle('label')
		expect(t.sortKey).toBe(null)
		t.sortBy('n')
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
	it('Ctrl+A in a table picks its shown rows (not the whole drawing); in a cell’s box it’s the box’s', () => {
		let sel: string[] = []
		const key = (o: Partial<KeyboardEvent> & { target?: unknown }) => selectAllRows({ key: 'a', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, target: null, ...o } as unknown as KeyboardEvent, ['a', 'b'], (x) => { sel = x })
		expect(key({})).toBe(true)
		expect(sel).toEqual(['a', 'b'])
		sel = []
		expect(key({ target: { closest: () => ({}) } })).toBe(false)   // typing in a cell
		expect(key({ ctrlKey: false })).toBe(false)
		expect(sel).toEqual([])
	})
	it('a click picks one row, Shift-click the range from it (keeping what the table doesn’t list), Ctrl-click adds / drops', () => {
		const rp = new RowPick(), ids = ['a', 'b', 'c', 'd']
		let sel: string[] = ['rack']
		const set = (x: string[]) => { sel = x }
		const m = (o: Partial<{ shiftKey: boolean; ctrlKey: boolean }> = {}) => ({ shiftKey: false, ctrlKey: false, metaKey: false, ...o })
		rp.pick('b', m(), ids, sel, set)
		expect(sel).toEqual(['b'])
		rp.pick('d', m({ shiftKey: true }), ids, sel, set, ['rack'])
		expect(sel).toEqual(['rack', 'b', 'c', 'd'])
		rp.pick('c', m({ ctrlKey: true }), ids, sel, set)
		expect(sel).toEqual(['rack', 'b', 'd'])
		rp.pick('a', m({ shiftKey: true }), ids, sel, set)   // from the last row clicked (c)
		expect(sel).toEqual(['a', 'b', 'c'])
	})
	it('Enter goes down the column, Tab along the row then on to the next row, and stops at the ends', () => {
		const ids = ['r1', 'r2', 'r3'], fields = (id: string) => (id === 'r2' ? ['label'] : ['label', 'usage'])
		expect(nextCell({ id: 'r1', field: 'usage' }, ids, fields, false, false)).toEqual({ id: 'r3', field: 'usage' })   // r2 has no usage
		expect(nextCell({ id: 'r1', field: 'label' }, ids, fields, true, false)).toEqual({ id: 'r1', field: 'usage' })
		expect(nextCell({ id: 'r1', field: 'usage' }, ids, fields, true, false)).toEqual({ id: 'r2', field: 'label' })
		expect(nextCell({ id: 'r3', field: 'label' }, ids, fields, true, true)).toEqual({ id: 'r2', field: 'label' })
		expect(nextCell({ id: 'r2', field: 'label' }, ids, fields, true, true)).toEqual({ id: 'r1', field: 'usage' })
		expect(nextCell({ id: 'r3', field: 'usage' }, ids, fields, true, false)).toBe(null)
		expect(nextCell({ id: 'r1', field: 'label' }, ids, fields, false, true)).toBe(null)
	})
	it('F2 / Enter on the table edit the selected row’s first cell; leaving the box saves it once', () => {
		const saved: string[] = []
		const ed = new CellEdit<'label' | 'usage'>({ fields: () => ['label', 'usage'], ids: () => ['a', 'b'], save: (id, f, v) => saved.push(`${id}.${f}=${v}`) })
		const key = (k: string) => ({ key: k, target: null, ctrlKey: false, metaKey: false, altKey: false }) as unknown as KeyboardEvent
		expect(ed.tableKey(key('F2'), [])).toBe(false)   // nothing selected
		expect(ed.tableKey(key('F2'), ['b'])).toBe(true)
		expect(ed.at).toEqual({ id: 'b', field: 'label' })
		expect(ed.tableKey(key('Enter'), ['b'])).toBe(false)   // already editing: the box has the key
		ed.blur('b', 'label', 'B1')
		ed.blur('b', 'label', 'B1')
		expect(saved).toEqual(['b.label=B1'])
		expect(ed.at).toBe(null)
		ed.start('a', 'usage')
		expect(ed.is('a', 'usage')).toBe(true)
	})
	it('Japanese IME: Enter / Esc mid-conversion neither save nor cancel the cell, nor start an edit', () => {
		const saved: string[] = []
		const ed = new CellEdit<'label'>({ fields: () => ['label'], ids: () => ['a'], save: (id, f, v) => saved.push(`${id}.${f}=${v}`) })
		const box = { value: '東京', closest: () => null }
		const ime = (k: string) => ({ key: k, isComposing: true, keyCode: 229, target: box, currentTarget: box, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, stopPropagation() {}, preventDefault() {} }) as unknown as KeyboardEvent
		expect(ed.tableKey(ime('Enter'), ['a'])).toBe(false)
		ed.start('a', 'label')
		ed.key(ime('Enter'), 'a', 'label')
		ed.key(ime('Escape'), 'a', 'label')
		expect(saved).toEqual([])
		expect(ed.is('a', 'label')).toBe(true)   // still editing
		expect(arrowSelect(ime('ArrowDown'), ['a', 'b'], ['a'], () => { throw new Error('moved') })).toBe(false)
	})
})
