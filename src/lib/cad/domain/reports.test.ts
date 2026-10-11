import { describe, it, expect } from 'vitest'
import { ProjectIndex } from './project'
import { outletSchedule, patchList, runLengths, bom, cordBom } from './reports'
import type { Cord } from './types'
import { validateProject } from './validate'
import { demoProject } from './fixtures'

const p = () => new ProjectIndex(demoProject())

describe('the demo project', () => {
	it('is valid', () => {
		expect(validateProject(demoProject())).toEqual([])
	})
})

describe('labels exist once', () => {
	it("a panel port shows the label of the outlet port it is linked to; an unlinked port shows its own text", () => {
		const ix = p()
		expect(ix.portLabel({ on: 'P1', port: 3, face: 'front' })).toBe('33-002.A')
		expect(ix.portLabel({ on: 'SW1', port: 2 })).toBe('SW1-02')
		expect(ix.portLabel({ on: 'P1', port: 20 })).toBe('')
	})
	it('renaming an outlet port renames it on the panel too (no copy to go stale)', () => {
		const ents = demoProject().map((e) => (e.id === 'O2' && e.type === 'outlet' ? { ...e, ports: e.ports.map((pt) => ({ ...pt, label: pt.label.replace('33-002', '33-099') })) } : e))
		expect(new ProjectIndex(ents).portLabel({ on: 'P1', port: 3 })).toBe('33-099.A')
	})
})

describe('outlet schedule', () => {
	it('lists each outlet with where every port is patched to', () => {
		const { rows, totals } = outletSchedule(p())
		expect(rows.map((r) => r.label)).toEqual(['33-001', '33-002'])
		expect(rows[0].ports[1]).toEqual({ label: '33-001.B', cableType: 'cat6a', serverRoom: 'IDF-A', patchedTo: 'A01 · Panel 1 : 2 (rear)' })
		expect(totals).toEqual({ outlets: 2, ports: 4, byUsage: { desk: 2 } })
	})
})

describe('patch list', () => {
	it('shows both ends of each cord with the labels people read on the ports', () => {
		const rows = patchList(p())
		expect(rows.map((r) => [r.fromLabel, r.toLabel])).toEqual([['33-001.A', 'SW1-01'], ['33-001.B', 'SW1-02']])
		expect(rows[0].from).toBe('A01 · Panel 1 : 1 (front)')
	})
	it('a moved end of a change says where it was (↶)', () => {
		const ents = demoProject().map((e) => (e.id === 'C1' && e.type === 'cord' ? { ...e, status: 'change' as const, b: { on: 'SW1', port: 9 }, previous: { a: e.a, b: e.b, status: 'installed' as const } } : e))
		const r = patchList(new ProjectIndex(ents)).find((x) => x.id === 'C1')!
		expect([r.wasFrom, r.wasTo]).toEqual([undefined, new ProjectIndex(ents).portPlace({ on: 'SW1', port: 1 })])
	})
})

describe('cord BOM', () => {
	it('counts cords by type × length, a column per status, types A → Z then shortest first', () => {
		const c = (cableType: string, lengthM: number, status: Cord['status']) => ({ cableType, lengthM, status }) as Cord
		const lines = cordBom([c('cat6a', 2, 'add'), c('cat6a', 1, 'installed'), c('cat6a', 2, 'remove'), c('om4', 3, 'add'), c('cat6a', 2, 'add'), c('cat6a', 0, 'add')], (id) => id.toUpperCase())
		expect(lines.map((l) => [l.type, l.lengthM, l.total])).toEqual([['CAT6A', 0, 1], ['CAT6A', 1, 1], ['CAT6A', 2, 3], ['OM4', 3, 1]])
		expect(lines[2].n).toEqual({ add: 2, change: 0, remove: 1, installed: 0 })
	})
})

describe('containment', () => {
	it('measures runs in 3D and counts the drop separately', () => {
		const [t] = runLengths(p())
		expect(t.horizontalM).toBeCloseTo(6)
		expect(t.verticalM).toBeCloseTo(2.6)
		expect(t.size).toBe('100×50')
	})
})

describe('BOM', () => {
	it('quantities by item, metres rounded up per line, unknown lengths still counted', () => {
		const lines = bom(p())
		const q = (item: string) => lines.find((l) => l.item === item)?.qty
		expect(q('2-port outlet (floor)')).toBe(2)
		expect(q('Jack / module cat6a')).toBe(4)
		expect(q('Patch panel 24-port RJ45 1U')).toBe(1)
		expect(q('cat6a (incl. 10% waste)')).toBe(94)                   // 2 × 42.5 m hand-set, + 10 % → 93.5 → 94
		expect(lines.find((l) => l.item === 'cat6a (incl. 10% waste)')?.note).toBe('≈ 1 box(es) of 305 m')
		expect(q('cat6a — no route, length unknown')).toBe(2)
		expect(q('trunk 100×50')).toBe(9)                             // 6 + 2.6 → 9
		expect(q('Core drill Ø100 through slab')).toBe(1)
		expect(q('cat6a 1 m')).toBe(2)
	})
})
