import { describe, it, expect } from 'vitest'
import { nextLabel, numberAt, setNumber, portLabelsFor, renumber, renumberOutlets, naturalCompare, readingOrder, reformatPorts, portsFromLabel } from './labels'
import type { Outlet } from './types'

describe('port label formats (User: 201.A → 201A, or numeric 201.1)', () => {
	it('new labels in each format', () => {
		expect(portLabelsFor('201', 2, 'alpha', '')).toEqual(['201A', '201B'])
		expect(portLabelsFor('201', 2, 'numeric', '.')).toEqual(['201.1', '201.2'])
		expect(portLabelsFor('201', 2, 'alpha', '-')).toEqual(['201-A', '201-B'])
	})
	it('reformat rewrites generated labels only — imported / hand-made ones stay', () => {
		const o = { label: '201', ports: [{ port: 1, label: '201.A' }, { port: 2, label: '201-2' }, { port: 3, label: 'SPECIAL' }] }
		expect(reformatPorts(o, 'alpha', '')!.ports.map((p) => p.label)).toEqual(['201A', '201B', 'SPECIAL'])
		expect(reformatPorts({ label: 'A.024', ports: [{ port: 1, label: '01A.024A' }] }, 'alpha', '')).toBeNull()
		expect(reformatPorts({ label: '201', ports: [{ port: 1, label: '201A' }] }, 'alpha', '')).toBeNull()   // already so
	})
})

const outlet = (label: string, ports: string[], at?: { x: number; y: number }): Outlet => ({
	type: 'outlet', id: label, levelId: 'L', label, tier: 'low', usage: 'desk', mount: 'floor', ...(at ? { at } : {}),
	ports: ports.map((p, i) => ({ port: i + 1, label: p, cableType: 'cat6a' })),
})

describe('number groups', () => {
	it('reads and writes the last number, keeping its padding', () => {
		expect(numberAt('33-009')).toBe(9)
		expect(setNumber('33-009', 10)).toBe('33-010')
		expect(setNumber('L01.A.023', 5, 1)).toBe('L01.A.005')   // group 1 = the 023, the floor stays
	})
	it('next label increments the last number; a label without one gets 1 appended', () => {
		expect(nextLabel('33-009')).toBe('33-010')
		expect(nextLabel('AP-99')).toBe('AP-100')
		expect(nextLabel('TV')).toBe('TV1')
	})
	it('port labels from an outlet label', () => {
		expect(portLabelsFor('33-001', 2)).toEqual(['33-001.A', '33-001.B'])
		expect(portLabelsFor('33-001', 2, 'numeric')).toEqual(['33-001.1', '33-001.2'])
	})
})

describe('renumber', () => {
	it('numbers labels in the order given, keeping prefix and padding', () => {
		expect(renumber(['33-007', '33-002', '33-015'], { start: 1 })).toEqual(['33-001', '33-002', '33-003'])
		expect(renumber(['A.1', 'A.2'], { start: 10, step: 10 })).toEqual(['A.10', 'A.20'])
		expect(renumber(['A.1', 'A.2'], { start: 1, pad: 3 })).toEqual(['A.001', 'A.002'])
	})
	it("carries an outlet's new number into its ports (suffix style)", () => {
		const [o] = renumberOutlets([outlet('33-001', ['33-001.A', '33-001.B'])], { start: 5 })
		expect(o.label).toBe('33-005')
		expect(o.ports.map((p) => p.label)).toEqual(['33-005.A', '33-005.B'])
	})
	it('changes only the location number in Frames-style port labels, not the floor or the port', () => {
		const [o] = renumberOutlets([outlet('L01.A.023', ['L01.A.023-B01', 'L01.A.023-B02'])], { start: 24, group: 1 })
		expect(o.label).toBe('L01.A.024')
		expect(o.ports.map((p) => p.label)).toEqual(['L01.A.024-B01', 'L01.A.024-B02'])
	})
	it('a hand-typed port label without the number is left alone', () => {
		const [o] = renumberOutlets([outlet('33-001', ['SPARE'])], { start: 2 })
		expect(o.ports[0].label).toBe('SPARE')
	})
})

describe('ordering', () => {
	it('natural sort puts 2 before 10', () => {
		expect(['A.10', 'A.2', 'A.1'].sort(naturalCompare)).toEqual(['A.1', 'A.2', 'A.10'])
	})
	it('reading order: rows down the sheet, left to right within a row; unplaced last', () => {
		const xs = [outlet('c', [], { x: 0, y: 3000 }), outlet('b', [], { x: 2000, y: 100 }), outlet('u', []), outlet('a', [], { x: 0, y: 0 })]
		expect(readingOrder(xs, (o) => o.at).map((o) => o.label)).toEqual(['a', 'b', 'c', 'u'])
	})
})

describe('ports from the outlet label (Tourney: 245 kept ports 056.A after a renumber)', () => {
	const o = (label: string, ports: string[]) => ({ label, ports: ports.map((l, i) => ({ port: i + 1, label: l })) })
	it('ports that don’t carry the label are made again from it; the rest are left alone', () => {
		expect(portsFromLabel(o('245', ['056.A', '056.B']), 'alpha', '.')?.ports.map((p) => p.label)).toEqual(['245.A', '245.B'])
		expect(portsFromLabel(o('201', ['201.A', '001.B']), 'alpha', '.')?.ports.map((p) => p.label)).toEqual(['201.A', '201.B'])
	})
	it('labels that contain the outlet’s label (any format) need nothing', () => {
		expect(portsFromLabel(o('001', ['L30.A.001-A01', 'L30.A.001-A02']), 'alpha', '.')).toBeNull()
		expect(portsFromLabel(o('203', ['203.A']), 'alpha', '.')).toBeNull()
	})
})
