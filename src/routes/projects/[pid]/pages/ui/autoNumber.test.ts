import { describe, it, expect } from 'vitest'
import { autoNumber, formatNumber, readingOrder } from './autoNumber'
import type { Ent } from './geometry'

const t = (id: string, x: number, y: number): Ent => ({ id, type: 'text', a: [x, y], text: '?' })

describe('auto-number (D6)', () => {
	it('pads to the run of #, appends without one', () => {
		expect(formatNumber('R-###', 7)).toBe('R-007')
		expect(formatNumber('4A#', 13)).toBe('4A13')
		expect(formatNumber('P', 2)).toBe('P2')
	})
	it('orders across rows (y within tol is one row) or down columns', () => {
		const ents = [t('c', 0, 100), t('b', 200, 2), t('a', 0, 0), t('d', 200, 101)]
		expect(readingOrder(ents, 'rows', 10).map((e) => e.id)).toEqual(['a', 'b', 'c', 'd'])
		expect(readingOrder(ents, 'cols', 10).map((e) => e.id)).toEqual(['a', 'c', 'b', 'd'])
	})
	it('writes texts, and an insert attribute only when a tag is given', () => {
		const ins: Ent = { id: 'i', type: 'insert', block: 'x', a: [500, 0], attrs: { A: '1' } }
		const out = autoNumber([t('a', 0, 0), ins], { template: 'D##', start: 5, step: 5, order: 'rows', tag: 'LABEL' })
		expect(out.map((e) => e.text ?? e.attrs?.LABEL)).toEqual(['D05', 'D10'])
		expect(out[1].attrs).toEqual({ A: '1', LABEL: 'D10' })
		expect(autoNumber([ins], { template: '#', start: 1, step: 1, order: 'rows' })).toEqual([])
	})
})
