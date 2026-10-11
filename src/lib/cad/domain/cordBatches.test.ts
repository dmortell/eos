// Cord label batches: ranges typed by hand, the labels used / free, the cords short of a label, the next order's start.
import { describe, it, expect } from 'vitest'
import { labelRange, inRange, batchUse, labelNeeds } from './cordBatches'
import type { Cord, CordBatch } from './types'

const batch = (first: string, last: string, extra: Partial<CordBatch> = {}): CordBatch => ({ id: first, cableType: 'cat6a', lengthM: 2, colour: '#ff0000', first, last, ...extra })
const cord = (cordId: string | undefined, extra: Partial<Cord> = {}): Cord => ({
	type: 'cord', id: `C${cordId}`, kind: 'patch', a: { on: 'A', port: 1 }, b: { on: 'B', port: 1 }, cableType: 'cat6a', colour: '#FF0000', lengthM: 2, lengthLocked: false, status: 'add', ...(cordId ? { cordId } : {}), ...extra,
})

describe('cord label batches', () => {
	it('a range: the same text before a number that counts up', () => {
		expect(labelRange('2AR-0001', '2AR-0100')).toEqual({ prefix: '2AR-', from: 1, to: 100, width: 4 })
		expect(labelRange('2AR-0100', '2AR-0001')).toBeNull()
		expect(labelRange('2AR-0001', '2BR-0100')).toBeNull()
		expect(inRange(labelRange('2AR-0001', '2AR-0100')!, '2AR-0042')).toBe(42)
		expect(inRange(labelRange('2AR-0001', '2AR-0100')!, '2AR-0101')).toBeNull()
	})
	it('used / free, the last used and the next free label; a cord of another kind with its label is flagged', () => {
		const [u] = batchUse([batch('2AR-0001', '2AR-0100')], [cord('2AR-0001'), cord('2AR-0003'), cord('2AR-0002', { lengthM: 3 }), cord('2AR-0050', { status: 'remove' }), cord(undefined)])
		expect(u).toMatchObject({ count: 100, free: 97, lastUsed: '2AR-0003', next: '2AR-0004' })
		expect(u.wrong.map((c) => c.cordId)).toEqual(['2AR-0002'])
		expect(batchUse([batch('X1', 'X3')], [])[0]).toMatchObject({ free: 3, next: 'X1' })
	})
	it('per type × length × colour: cords against labels bought, the shortfall and where the next order continues', () => {
		const cords = [...Array.from({ length: 5 }, (_, i) => cord(`2AR-000${i + 1}`)), cord(undefined, { lengthM: 3 })]
		const needs = labelNeeds([batch('2AR-0001', '2AR-0003', { delivered: 3 })], cords)
		expect(needs.find((n) => n.lengthM === 2)).toMatchObject({ cords: 5, labels: 3, delivered: 3, short: 2, nextOrder: '2AR-0004' })
		expect(needs.find((n) => n.lengthM === 3)).toMatchObject({ cords: 1, labels: 0, short: 1 })
		expect(needs.find((n) => n.lengthM === 3)!.nextOrder).toBeUndefined()
	})
})
