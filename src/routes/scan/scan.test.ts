import { describe, expect, it } from 'vitest'
import { nextEmpty, parseLabels, parseMac, toCsv, valueColumn } from './scan'

describe('parseMac', () => {
	it('takes the bare and the separated forms, upper-cased', () => {
		expect(parseMac('884F59CB74D9')).toBe('884F59CB74D9')
		expect(parseMac(' 88:4f:59:cb:74:d9 ')).toBe('884F59CB74D9')
		expect(parseMac('88-4F-59-CB-74-D9')).toBe('884F59CB74D9')
		expect(parseMac('884f.59cb.74d9')).toBe('884F59CB74D9')
	})
	it('rejects the other barcodes on a phone label', () => {
		expect(parseMac('74-134165-03')).toBeNull()      // part number: 12 characters, not hex
		expect(parseMac('DP-9851-K9 V03')).toBeNull()
		expect(parseMac('WZP29129F2B')).toBeNull()       // serial
		expect(parseMac('MAC 884F59CB74D9')).toBeNull()
		expect(parseMac('')).toBeNull()
	})
})

describe('walk list', () => {
	const items = [{ label: '348', value: 'A' }, { label: '201', value: '' }, { label: '302', value: 'B' }, { label: '203', value: '' }]
	it('reads one label per line, dropping blanks', () => {
		expect(parseLabels('348\r\n201\n\n 302 \n')).toEqual(['348', '201', '302'])
	})
	it('finds the next empty row, wrapping back to skipped ones', () => {
		expect(nextEmpty(items, 0)).toBe(1)
		expect(nextEmpty(items, 2)).toBe(3)
		expect(nextEmpty(items, 4)).toBe(1)
		expect(nextEmpty(items.map(i => ({ ...i, value: 'x' })), 0)).toBe(-1)
	})
	it('exports label and MAC as CSV, quoting where needed', () => {
		expect(toCsv([{ label: '348', value: 'A' }, { label: 'Desk "A", east', value: '' }]))
			.toBe('Label,MAC\r\n348,A\r\n"Desk ""A"", east",\r\n')
	})
	it('keeps blank rows in the copied column so it lines up with the labels', () => {
		expect(valueColumn(items)).toBe('A\n\nB\n')
	})
})
