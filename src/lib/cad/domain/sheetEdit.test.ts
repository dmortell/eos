// Duplicate a sheet; number a group of sheets from a pattern.
import { describe, it, expect } from 'vitest'
import { duplicateSheet, numberFrom } from './sheetEdit'
import type { Sheet } from './drawing'
import type { Shape } from './shapes'

describe('sheet edits', () => {
	it('duplicates with its viewports and tied notes under new ids, no number, no revisions, after the original', () => {
		const s: Sheet = { type: 'sheet', id: 'S', number: 'P1', title: 'Plan', order: 20, status: 'archived', paper: { size: 'A3', orientation: 'landscape', marginMm: 5 }, revisions: [{ code: 'A', date: '2026-01-01' }],
			viewports: [{ id: 'V', view: { levelId: 'L', spec: { kind: 'plan' } }, rect: { x: 0, y: 0, w: 10, h: 10 }, scale: 100, centre: { x: 0, y: 0 } }] }
		const notes = [
			{ type: 'shape', id: 'N1', sheetId: 'S', geom: { kind: 'text', at: { x: 0, y: 0 }, text: 'x', sizeMm: 3 } },
			{ type: 'shape', id: 'N2', sheetId: 'S', vpId: 'V', geom: { kind: 'text', at: { x: 0, y: 0 }, text: 'y', sizeMm: 3 } },
			{ type: 'shape', id: 'N3', sheetId: 'OTHER', geom: { kind: 'text', at: { x: 0, y: 0 }, text: 'z', sizeMm: 3 } },
		] as unknown as Shape[]
		let n = 0
		const d = duplicateSheet(s, notes, () => `new${++n}`)
		expect(d.sheet).toMatchObject({ number: '', title: 'Plan (copy)', order: 20.5, status: 'active', revisions: undefined })
		expect(d.sheet.id).not.toBe('S')
		expect(d.sheet.viewports[0].id).not.toBe('V')
		expect(d.notes.map((x) => x.sheetId)).toEqual([d.sheet.id, d.sheet.id])
		expect((d.notes[1] as { vpId?: string }).vpId).toBe(d.sheet.viewports[0].id)
		expect(s.viewports[0].id).toBe('V')   // the original untouched
	})
	it('numbers from a pattern, keeping the width', () => {
		expect(numberFrom('RE-01', 3)).toEqual(['RE-01', 'RE-02', 'RE-03'])
		expect(numberFrom('S9', 2)).toEqual(['S9', 'S10'])
		expect(numberFrom('P101a', 2)).toEqual(['P101a', 'P102a'])
		expect(numberFrom('RE', 2)).toEqual(['RE-01', 'RE-02'])
	})
})
