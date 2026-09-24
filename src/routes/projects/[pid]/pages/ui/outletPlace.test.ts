import { describe, it, expect } from 'vitest'
import { incLabel, nextOutletLabel } from './outletPlace.svelte'
import type { Ent } from './geometry'

const o = (LABEL: string): Ent => ({ id: LABEL, type: 'insert', block: 'outlet-box', a: [0, 0], attrs: { LABEL, PORTS: '1' } })

describe('outlet labels (E2 / E3)', () => {
	it('counts on the last number, keeping padding and any suffix', () => {
		expect(incLabel('4A013')).toBe('4A014')
		expect(incLabel('4A099')).toBe('4A100')
		expect(incLabel('D-09b')).toBe('D-10b')
		expect(incLabel('LOBBY')).toBe('')
	})
	it('follows the last label issued, else the highest in the model, skipping taken ones', () => {
		const ex = [o('4A001'), o('4A007'), o('4A003'), o('4A008')]
		expect(nextOutletLabel(ex, '4A002')).toBe('4A004')
		expect(nextOutletLabel(ex, '')).toBe('4A009')
		expect(nextOutletLabel([], '')).toBe('')
	})
})
