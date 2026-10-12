import { describe, it, expect } from 'vitest'
import { shared, countsText, selectionKinds, plainLines, put, putMany, num, whole, text } from './propsKit'
import type { Entity } from '../domain/drawing'
import type { Txn } from '../store/store'

/** A store that records each transaction's label and what it put. */
function fakeStore() {
	const steps: { label: string; puts: Entity[] }[] = []
	return {
		steps,
		transact(label: string, fn: (tx: Txn) => void) {
			const puts: Entity[] = []
			fn({ get: () => undefined, put: (e) => puts.push(e), del: () => {} })
			steps.push({ label, puts })
		},
	}
}
const rack = (id: string, kind: string, maker?: string) => ({ type: 'rack', id, kind, maker }) as unknown as Entity

describe('shared: the value several items share', () => {
	it('gives the value when they all agree', () => {
		expect(shared([1, 1, 1], (x) => x)).toEqual({ value: 1, mixed: false })
	})
	it('says mixed (no value) when any differs', () => {
		expect(shared(['a', 'a', 'b'], (x) => x)).toEqual({ value: undefined, mixed: true })
	})
	it('an empty selection is not mixed', () => {
		expect(shared([], (x) => x)).toEqual({ value: undefined, mixed: false })
	})
	it('all blank is a shared blank, not mixed', () => {
		expect(shared([{ m: undefined }, { m: undefined }], (x) => x.m)).toEqual({ value: undefined, mixed: false })
	})
})

describe('countsText: what a mixed selection is', () => {
	it('names each kind with its count, skipping kinds with none', () => {
		expect(countsText([[3, 'rack'], [0, 'device'], [5, 'outlet']])).toBe('3 racks · 5 outlets')
	})
	it('one of a kind is singular; irregular plurals are given', () => {
		expect(countsText([[1, 'box', 'boxes'], [2, 'box', 'boxes']])).toBe('1 box · 2 boxes')
	})
})

describe('selectionKinds: a mixed selection by kind', () => {
	const shape = (id: string, geom: string, role?: string) => ({ type: 'shape', id, geom: { kind: geom }, ...(role ? { role: { kind: role } } : {}) }) as unknown as Entity
	it('splits by kind in a fixed order, so the header reads "3 racks · 5 outlets"', () => {
		const ks = selectionKinds([rack('r1', 'cabinet'), { type: 'outlet', id: 'o1' } as unknown as Entity, rack('r2', 'vcm')])
		expect(ks.map((k) => [k.key, k.items.length])).toEqual([['outlet', 1], ['rack', 2]])
		expect(countsText(ks.map((k) => [k.items.length, k.one, k.many]))).toBe('1 outlet · 2 racks')
	})
	it('names paths and shapes by what they all are', () => {
		const ks = selectionKinds([shape('a', 'path', 'wall'), shape('b', 'path', 'wall'), shape('c', 'insert'), shape('d', 'insert')])
		expect(ks.map((k) => k.many)).toEqual(['walls', 'blocks'])
		expect(selectionKinds([shape('a', 'path'), shape('b', 'path', 'containment')])[0].many).toBe('runs')
		expect(selectionKinds([shape('a', 'path')])[0].one).toBe('line')
	})
	it('several plain lines get the line’s style fields (line type, lineweight, ends) — not a mix with a run or a wall', () => {
		expect(plainLines([shape('a', 'path'), shape('b', 'path')])).toBe(true)
		expect(plainLines([shape('a', 'path'), shape('b', 'path', 'containment')])).toBe(false)
		expect(plainLines([shape('a', 'path', 'wall')])).toBe(false)
		expect(plainLines([shape('a', 'rect')])).toBe(false)
		expect(plainLines([])).toBe(false)
	})
})

describe('put / putMany: one undo step per edit', () => {
	it('put changes one item in one step', () => {
		const st = fakeStore()
		put(st, rack('r1', 'cabinet'), 'Rack kind', { kind: '2-post' } as Partial<Entity>)
		expect(st.steps).toHaveLength(1)
		expect(st.steps[0]).toMatchObject({ label: 'Rack kind', puts: [{ id: 'r1', kind: '2-post' }] })
	})
	it('putMany changes them all in ONE step, saying how many', () => {
		const st = fakeStore()
		putMany(st, [rack('r1', 'cabinet'), rack('r2', 'vcm')], 'Rack maker', { maker: 'APC' } as Partial<Entity>, 'racks')
		expect(st.steps).toHaveLength(1)
		expect(st.steps[0].label).toBe('Rack maker (2 racks)')
		expect(st.steps[0].puts.map((e) => (e as unknown as { maker: string }).maker)).toEqual(['APC', 'APC'])
	})
	it('a per-item patch may leave an item alone', () => {
		const st = fakeStore()
		putMany(st, [rack('r1', 'cabinet'), rack('r2', 'vcm')], 'Doors', (r) => ((r as unknown as { kind: string }).kind === 'cabinet' ? ({ maker: 'x' } as Partial<Entity>) : null))
		expect(st.steps[0].puts.map((e) => e.id)).toEqual(['r1'])
	})
	it('nothing selected: no step', () => {
		const st = fakeStore()
		putMany(st, [] as Entity[], 'X', {})
		expect(st.steps).toHaveLength(0)
	})
})

describe('parsers', () => {
	it('num: blank is the default, junk is refused', () => {
		expect(num(' ')).toBeUndefined()
		expect(num('12.5')).toBe(12.5)
		expect(num('abc')).toBeNull()
	})
	it('whole: only whole numbers at or above the minimum', () => {
		expect(whole('3', 1)).toBe(3)
		expect(whole('0', 1)).toBeNull()
		expect(whole('2.5', 0)).toBeNull()
		expect(whole('', 0)).toBeNull()
	})
	it('text: trimmed, blank = none', () => {
		expect(text('  a b ')).toBe('a b')
		expect(text('   ')).toBeUndefined()
	})
})
