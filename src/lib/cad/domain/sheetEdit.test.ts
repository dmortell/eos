// Duplicate a sheet; number a group of sheets from a pattern; untie a note from its viewport.
import { describe, it, expect } from 'vitest'
import { duplicateSheet, numberFrom, untie } from './sheetEdit'
import type { Sheet, Viewport } from './drawing'
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

describe('untie a note from its viewport (deleted / retargeted): it stays where it showed, at its printed size', () => {
	// 1:100, the view point (1000, 2000) at the window's middle, paper (150, 125)
	const vp = { id: 'V', view: { levelId: 'L', spec: { kind: 'plan' } }, rect: { x: 50, y: 50, w: 200, h: 150 }, scale: 100, centre: { x: 1000, y: 2000 } } as Viewport
	const tied = (geom: object) => ({ type: 'shape', id: 'n', sheetId: 'SH', vpId: 'V', geom }) as Shape
	it('a line’s nodes, a picture, a legend', () => {
		const line = untie(tied({ kind: 'path', nodes: [{ id: 'a', x: 1000, y: 2000, z: 0 }, { id: 'b', x: 3000, y: 2000, z: 0 }], segs: [{ id: 's', a: 'a', b: 'b' }] }), vp)
		expect(line.vpId).toBeUndefined()
		expect((line.geom as { nodes: unknown[] }).nodes).toMatchObject([{ x: 150, y: 125 }, { x: 170, y: 125 }])
		expect(untie(tied({ kind: 'image', fileId: 'f', centre: { x: 2000, y: 2000 }, size: { x: 4000, y: 3000 } }), vp).geom).toMatchObject({ centre: { x: 160, y: 125 }, size: { x: 40, y: 30 } })
		expect(untie(tied({ kind: 'legend', at: { x: 0, y: 0 }, sizeMm: 2.5 }), vp).geom).toEqual({ kind: 'legend', at: { x: 140, y: 105 }, sizeMm: 2.5 })
	})
	it('a block: a symbol (paper mm already) keeps its scale; a model block shrinks by the drawing scale', () => {
		const sym = untie(tied({ kind: 'insert', blockId: 'builtin:datum', at: { x: 1000, y: 3000 }, scale: 2 }), vp)
		expect(sym.geom).toMatchObject({ at: { x: 150, y: 135 }, scale: 2 })
		const desk = untie(tied({ kind: 'insert', blockId: 'mine', at: { x: 1000, y: 2000 } }), vp)
		expect(desk.geom).toMatchObject({ at: { x: 150, y: 125 }, scale: 0.01 })
	})
})
