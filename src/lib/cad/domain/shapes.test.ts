// What ADR 0007 promises about shapes, stated as behaviour.
import { describe, it, expect } from 'vitest'
import { isFlat, isVertical, ownerOf, type Shape } from './shapes'

const line: Shape = {
	type: 'shape', id: 's1', levelId: 'L1',
	geom: { kind: 'path', nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 3000, y: 0, z: 0 }], segs: [{ id: 'g', a: 'a', b: 'b' }] },
}

describe('one shape type', () => {
	it('a plain line is 2D; the same line with a section is 3D', () => {
		expect(isFlat(line)).toBe(true)
		expect(isFlat({ ...line, section: { w: 100, h: 50 } })).toBe(false)
	})
	it('converting a line to a trunk changes its role and section, never its points', () => {
		const trunk: Shape = { ...line, section: { w: 100, h: 50 }, role: { kind: 'containment', form: 'trunk', tier: 'high' } }
		expect(trunk.geom).toBe(line.geom)
		const back: Shape = { ...trunk, role: undefined, section: undefined }
		expect(isFlat(back)).toBe(true)
	})
	it('a rectangle is flat until it has an extent (then it is a box)', () => {
		const rect: Shape = { type: 'shape', id: 'r', levelId: 'L1', geom: { kind: 'rect', centre: { x: 0, y: 0 }, size: { x: 600, y: 400 } }, plane: { kind: 'plan', z: 0 } }
		expect(isFlat(rect)).toBe(true)
		expect(isFlat({ ...rect, extent: 720 })).toBe(false)
	})
	it('a drop or riser segment is vertical: both ends at one plan position', () => {
		expect(isVertical({ x: 100, y: 200 }, { x: 100, y: 200 })).toBe(true)
		expect(isVertical({ x: 100, y: 200 }, { x: 100, y: 260 })).toBe(false)
	})
	it('text on a sheet and a line in a model are the same kind of record, told apart only by owner', () => {
		const note: Shape = { type: 'shape', id: 't', sheetId: 'S1', geom: { kind: 'text', at: { x: 20, y: 20 }, text: 'NOTES', sizeMm: 3.5 } }
		expect(ownerOf(note)).toEqual({ kind: 'sheet', id: 'S1' })
		expect(ownerOf(line)).toEqual({ kind: 'level', id: 'L1' })
	})
})
