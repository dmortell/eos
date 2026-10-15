// Text fields linked to data: {PROJECT} / {LEVEL} / {SHEET} / {DATE} and {COUNT:block}, filled when drawn.
import { describe, it, expect } from 'vitest'
import { ProjectIndex } from './project'
import { fieldCtx, fillFields, isDataField, withFields } from './fields'
import { blockAttrDefs, insertAttrs, BUILTIN_BLOCKS, type Block } from './blocks'
import type { Entity, Sheet } from './drawing'

const level = (id: string, name: string, order: number) => ({ type: 'level', id, name, number: order, elevationMm: 0, order, heights: {} })
const ins = (id: string, levelId: string, blockId: string) => ({ type: 'shape', id, levelId, geom: { kind: 'insert', blockId, at: { x: 0, y: 0 } } })
const outlet = (id: string, levelId: string, usage: string) => ({ type: 'outlet', id, levelId, label: id, usage, mount: 'box', tier: 'low', ports: [], at: { x: 0, y: 0 } })
const ix = new ProjectIndex([level('L1', '1F', 1), level('L2', '2F', 2), ins('a', 'L1', 'B1'), ins('b', 'L1', 'B1'), ins('c', 'L2', 'B1'), outlet('o1', 'L1', 'AP'), outlet('o2', 'L2', 'AP')] as Entity[])
const blocks = (id: string) => (id === 'B1' ? ({ id, name: 'Smoke detector' } as Block) : BUILTIN_BLOCKS.find((b) => b.id === id))

describe('text fields (T092)', () => {
	it('fills project, level, sheet and date; counts a block by name or id on the level (outlets drawn with it too)', () => {
		const ctx = fieldCtx(ix, { project: 'Tourney', levels: ['L1'], blocks, today: '2026-10-09' })
		expect(fillFields('{PROJECT} · {LEVEL} · {DATE}', ctx)).toBe('Tourney · 1F · 2026-10-09')
		expect(fillFields('{COUNT:smoke detector} detectors, {COUNT:B1} by id, {COUNT:Wireless AP} APs, {COUNT:nothing}', ctx)).toBe('2 detectors, 2 by id, 1 APs, 0')
		// no sheet here: {SHEET} stays as written; the whole project when no levels are given
		expect(fillFields('{SHEET} {LABEL}', ctx)).toBe('{SHEET} {LABEL}')
		const all = fieldCtx(ix, { blocks, sheet: { number: 'E-101', title: 'Ceiling plan' } as Sheet })
		expect(fillFields('{SHEET} {SHEET_TITLE}: {COUNT:Smoke detector}', all)).toBe('E-101 Ceiling plan: 3')
		expect(withFields([{ k: 'text', at: { x: 0, y: 0 }, text: '{LEVEL}', size: 1, cls: 'note' }], fieldCtx(ix, { levels: ['L2', 'L1'] }))[0]).toMatchObject({ text: '1F, 2F' })
	})
	it('a block text with a data field is not an attribute (an insert does not blank it)', () => {
		const b = { id: 'T', name: 'Tag', shapes: [{ id: 's', geom: { kind: 'text', at: { x: 0, y: 0 }, text: '{LABEL} on {LEVEL} ({COUNT:T})', sizeMm: 2 } }] } as unknown as Block
		expect(blockAttrDefs(b).map((d) => d.tag)).toEqual(['LABEL'])
		expect(insertAttrs(b)).toEqual({ LABEL: '' })
		expect([isDataField('LEVEL'), isDataField('COUNT:x'), isDataField('LABEL')]).toEqual([true, true, false])
	})
})
