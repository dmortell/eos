// Renumber over outlets, racks and labelled shapes.
import { describe, it, expect } from 'vitest'
import { renumberEntities, orderFor, numberGroups, startOf, clashes, renumberable, replaceInLabels } from './renumber'
import type { Entity } from './drawing'
import type { Outlet, Rack } from './types'
import type { Shape } from './shapes'

const outlet = (id: string, label: string, x: number, y: number): Outlet => ({ type: 'outlet', id, levelId: 'L', label, tier: 'low', usage: 'desk', mount: 'floor', at: { x, y }, ports: [{ port: 1, label: `${label}.A`, cableType: 'cat6a' }] }) as Outlet
const rack = (id: string, name: string): Rack => ({ type: 'rack', id, levelId: 'L', spaceId: 'S', order: 1, name, kind: 'cabinet', heightU: 42, widthMm: 600, depthMm: 1000 })
const note = (id: string, label?: string): Shape => ({ type: 'shape', id, levelId: 'L', geom: { kind: 'text', at: { x: 0, y: 0 }, text: 'x', sizeMm: 2 }, ...(label ? { label } : {}) })

describe('renumber', () => {
	it('outlets take start, start + step … and their ports follow; racks and shapes change their own text', () => {
		const r = renumberEntities([outlet('a', '33-007', 0, 0), outlet('b', '33-003', 0, 0), rack('r', 'R301'), note('n', 'P-9')], { start: 10, step: 2 })
		expect(r.map((e) => (e.type === 'outlet' ? [e.label, e.ports[0].label] : e.type === 'rack' ? e.name : (e as Shape).label))).toEqual([
			['33-010', '33-010.A'], ['33-012', '33-012.A'], 'R014', 'P-16',   // a number keeps its width (R301 → 14 = R014)
		])
	})
	it('every item takes the format of the first item of its type; ports follow (prefix or matching number)', () => {
		const imported = { ...outlet('c', 'A.010', 0, 0), ports: [{ port: 1, label: '01A.010A', cableType: 'cat6a' }] } as Outlet
		const r = renumberEntities([outlet('a', 'A.037', 0, 0), outlet('b', 'A001', 0, 0), imported, rack('r', 'R301')], { start: 50 })
		expect(r.map((e) => (e.type === 'outlet' ? [e.label, e.ports[0].label] : e.type === 'rack' ? e.name : ''))).toEqual([
			['A.050', 'A.050.A'], ['A.051', 'A.051.A'], ['A.052', '01A.052A'], 'R053',   // the rack keeps a rack's format
		])
	})
	it('a number group the first label does not have changes nothing (no label copied onto every item) (Q22)', () => {
		const items = [rack('a', 'R01'), rack('b', 'R02'), rack('c', 'R03')]
		expect(renumberEntities(items, { start: 5, group: 1 })).toEqual([])
		expect(renumberEntities(items, { start: 5, group: 0 }).map((e) => (e as Rack).name)).toEqual(['R05', 'R06', 'R07'])
	})
	it('only what changes is returned; things without a label are not renumberable', () => {
		expect(renumberEntities([outlet('a', '33-005', 0, 0)], { start: 5 })).toEqual([])
		expect([renumberable(note('n')), renumberable(note('m', 'A1'))]).toEqual([false, true])
	})
	it('reading order = rows top to bottom, then left to right; label order = natural sort', () => {
		const items: Entity[] = [outlet('c', 'X10', 500, 4000), outlet('a', 'X2', 2000, 0), outlet('b', 'X9', 100, 100)]
		expect(orderFor(items, 'reading').map((e) => e.id)).toEqual(['b', 'a', 'c'])
		expect(orderFor(items, 'label').map((e) => e.id)).toEqual(['a', 'b', 'c'])
	})
	it('the number groups to pick from, and where a run starts by default', () => {
		expect(numberGroups('L01.A.023')).toEqual(['01', '023'])
		expect(startOf([outlet('a', 'L01.A.023', 0, 0)])).toBe(23)
		expect(startOf([outlet('a', 'L01.A.023', 0, 0)], 0)).toBe(1)
	})
	it('a new label someone else of the same type already has is a clash; the run itself never clashes', () => {
		const all: Entity[] = [outlet('a', 'A1', 0, 0), outlet('b', 'A2', 0, 0), outlet('c', 'A5', 0, 0), rack('r', 'A6')]
		const next = renumberEntities([all[0], all[1]], { start: 2 })   // A1 → A2, A2 → A3
		expect(clashes(next, all)).toEqual([])
		expect(clashes(renumberEntities([all[0], all[1]], { start: 5 }), all)).toEqual(['A5'])   // A6 is a rack: no clash
	})
	it('outlet labels only clash on their own level (another floor may use the same ones)', () => {
		const here = outlet('a', 'A1', 0, 0), there = { ...outlet('b', 'A2', 0, 0), levelId: 'OTHER' } as Entity
		expect(clashes(renumberEntities([here], { start: 2 }), [here, there])).toEqual([])
	})
})

describe('find / replace in labels', () => {
	it('plain text: every match, in outlet labels (ports follow), rack names and shape labels; "$" is just "$"', () => {
		const r = replaceInLabels([outlet('a', 'A.001', 0, 0), rack('r', 'A.R1'), note('n', 'A.x'), outlet('b', 'B.002', 0, 0)], { find: 'A.', repl: '$' })
		expect(r).toEqual([
			expect.objectContaining({ id: 'a', label: '$001', ports: [expect.objectContaining({ label: '$001.A' })] }),
			expect.objectContaining({ id: 'r', name: '$R1' }), expect.objectContaining({ id: 'n', label: '$x' }),
		])
	})
	it('a pattern with groups; a bad pattern says why', () => {
		const r = replaceInLabels([outlet('a', '33-007', 0, 0)], { find: String.raw`^(\d+)-(\d+)$`, repl: '$2/$1', regex: true }) as Outlet[]
		expect(r[0].label).toBe('007/33')
		expect(replaceInLabels([outlet('a', 'x', 0, 0)], { find: '(', repl: '', regex: true })).toMatchObject({ problem: expect.stringMatching(/Not a valid pattern/) })
	})
	it('port labels only: the outlet keeps its label; racks and shapes are left out', () => {
		const r = replaceInLabels([outlet('a', 'A.001', 0, 0), rack('r', 'A.R1')], { find: '.A', repl: '-1', ports: true }) as Outlet[]
		expect(r).toHaveLength(1)
		expect([r[0].label, r[0].ports[0].label]).toEqual(['A.001', 'A.001-1'])
		expect(replaceInLabels([outlet('a', 'A.001', 0, 0)], { find: 'zzz', repl: 'y' })).toEqual([])
	})
})
