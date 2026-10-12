import { describe, it, expect } from 'vitest'
import { displayListToDxf, dxfLineweight } from './dxf'
import type { Prim } from '../views/display'

describe('DXF export', () => {
	it('a project layer name DXF refuses is made safe, and names differing only by case stay apart', () => {
		const prims: Prim[] = [
			{ k: 'line', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }], cls: 'shape', layer: 'a' },
			{ k: 'line', pts: [{ x: 0, y: 5 }, { x: 10, y: 5 }], cls: 'shape', layer: 'b' },
		]
		const { text } = displayListToDxf(prims, new Map([['a', 'Low: A/V'], ['b', 'LOW_ A_V']]))
		expect(text).toContain('\nLow_ A_V\n')
		expect(text).toContain('\nLOW_ A_V_2\n')
		expect(text).not.toContain('Low: A/V')
	})
	it('a layer name with a comma is made safe (a comma breaks the file’s layer table in AutoCAD) (Q24)', () => {
		const { text } = displayListToDxf([{ k: 'line', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }], cls: 'shape', layer: 'a' }], new Map([['a', 'Walls, new']]))
		expect(text).toContain('\nWalls_ new\n')
		expect(text).not.toContain('Walls, new')
	})
	it('a text of several lines becomes one TEXT per line (a newline would break the file)', () => {
		const { text, entities } = displayListToDxf([{ k: 'text', at: { x: 0, y: 0 }, text: 'First\nSecond', size: 2.5, cls: 'note' }])
		expect(entities).toBe(2)
		expect(text).toContain('\nFirst\n')
		expect(text).toContain('\nSecond\n')
		expect(text).not.toContain('First\nSecond')
	})
	// the file as its trimmed lines: a group is a code line then a value line
	const lines = (text: string) => text.split('\n').map((l) => l.trim())
	/** The value of the first group `code` found after the first line `after`. */
	const groupAfter = (ls: string[], after: string, code: string) => { const i = ls.indexOf(after); const j = ls.findIndex((l, k) => k > i && l === code); return ls[j + 1] }
	it('a shape’s lineweight is written as group 370 in hundredths of a mm, the nearest standard one, inside the entity’s own part', () => {
		expect([dxfLineweight(0.25), dxfLineweight(0.7), dxfLineweight(0.26), dxfLineweight(1)]).toEqual([25, 70, 25, 100])
		const ls = lines(displayListToDxf([{ k: 'line', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }], cls: 'shape', weight: 0.5 }, { k: 'circle', c: { x: 0, y: 0 }, r: 5, cls: 'shape', weight: 0.35 }]).text)
		// 370 sits before the entity’s own subclass marker (100 / AcDbPolyline)
		const i = ls.indexOf('LWPOLYLINE'), at = ls.indexOf('370', i)
		expect(ls[at + 1]).toBe('50')
		expect(ls.indexOf('AcDbPolyline', i)).toBeGreaterThan(at)
		const c = ls.indexOf('CIRCLE')
		expect(ls[ls.indexOf('370', c) + 1]).toBe('35')
		expect(ls.indexOf('AcDbCircle', c)).toBeGreaterThan(ls.indexOf('370', c))
	})
	it('no lineweight is written for a shape without one (it stays by layer)', () => {
		const ls = lines(displayListToDxf([{ k: 'line', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }], cls: 'shape' }]).text)
		const i = ls.indexOf('LWPOLYLINE')
		expect(ls.slice(i, ls.indexOf('AcDbPolyline', i)).includes('370')).toBe(false)
	})
	it('a region’s fill becomes a solid HATCH of its color, under its outline; a circle’s too', () => {
		const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
		const r = displayListToDxf([{ k: 'line', pts: sq, closed: true, fill: true, cls: 'shape-fill', color: '#ff0000' }, { k: 'line', pts: sq, closed: true, cls: 'shape' },
			{ k: 'circle', c: { x: 5, y: 5 }, r: 3, fill: true, cls: 'shape-fill', color: '#00ff00' }])
		const ls = lines(r.text)
		expect(ls.filter((l) => l === 'HATCH').length).toBe(2)
		expect(ls).toContain('SOLID')
		expect(groupAfter(ls, 'HATCH', '420')).toBe(String(0xff0000))
		expect(r.entities).toBe(3)
	})
})
