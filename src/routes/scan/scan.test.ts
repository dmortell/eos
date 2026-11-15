import { describe, expect, it } from 'vitest'
import { macsInOrder, nextEmpty, parseLabels, parseMac, toCsv, valueColumn } from './scan'

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

describe('macsInOrder', () => {
	// Corner points as the decoder returned them for a photo of a Cisco label (MAC above WLAN MAC)
	const pt = (...n: number[]) => [0, 2, 4, 6].map(i => ({ x: n[i], y: n[i + 1] }))
	const wired = '884F59514DD9', wlan = '884F59514DDB'
	it('takes the upper MAC first, whichever way up the label is', () => {
		expect(macsInOrder([   // upright
			{ rawValue: wired, cornerPoints: pt(212, 1112, 1191, 1112, 1194, 1215, 208, 1215) },
			{ rawValue: wlan, cornerPoints: pt(205, 1392, 1199, 1392, 1195, 1464, 203, 1464) },
		])).toEqual([wired, wlan])
		expect(macsInOrder([   // turned 90°, WLAN read first
			{ rawValue: wlan, cornerPoints: pt(622, 206, 622, 1197, 558, 1196, 558, 203) },
			{ rawValue: wired, cornerPoints: pt(904, 211, 904, 1192, 801, 1194, 801, 208) },
		])).toEqual([wired, wlan])
		expect(macsInOrder([   // upside down, WLAN read first
			{ rawValue: wlan, cornerPoints: pt(1308, 558, 315, 558, 314, 622, 1305, 622) },
			{ rawValue: wired, cornerPoints: pt(1303, 801, 317, 801, 319, 904, 1300, 904) },
		])).toEqual([wired, wlan])
	})
	it('drops the barcodes that are not MACs', () => {
		expect(macsInOrder([
			{ rawValue: 'DP-9851-K9 V03', cornerPoints: pt(104, 304, 436, 304, 436, 307, 104, 307) },
			{ rawValue: '884F59CB74D9', cornerPoints: pt(104, 339, 398, 339, 399, 374, 104, 374) },
		])).toEqual(['884F59CB74D9'])
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
