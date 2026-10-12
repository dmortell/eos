// What ADR 0007 promises about shapes, stated as behaviour.
import { describe, it, expect } from 'vitest'
import { isFlat, isVertical, ownerOf, rotateGeometry, mirrorGeometry, arcPoints, type Shape, type Geometry } from './shapes'

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

describe('rotate and mirror geometry', () => {
	const O = { x: 0, y: 0 }
	const X = { x: 1, y: 0 }, Y = { x: 0, y: 1 }   // mirror lines through O: along x (horizontal), along y (vertical)
	const g = <K extends Geometry['kind']>(x: Geometry, _k: K) => x as Extract<Geometry, { kind: K }>

	it('a turn moves points about the pivot, clockwise on screen, and adds to a box’s / ellipse’s / image’s / text’s rotation', () => {
		const r = g(rotateGeometry({ kind: 'rect', centre: { x: 100, y: 0 }, size: { x: 50, y: 20 }, rot: 30 }, O, 90), 'rect')
		expect(r.centre).toEqual({ x: 0, y: 100 })   // +x turned a quarter clockwise is down the sheet
		expect(r.rot).toBe(120)
		expect(g(rotateGeometry({ kind: 'ellipse', centre: O, rx: 5, ry: 3, rot: 350 }, O, 20), 'ellipse').rot).toBe(10)
		expect(g(rotateGeometry({ kind: 'image', fileId: 'f', centre: O, size: X, rot: 270 }, O, 90), 'image').rot).toBeUndefined()
		const t = g(rotateGeometry({ kind: 'text', at: { x: 10, y: 10 }, text: 'A', sizeMm: 3 }, { x: 10, y: 0 }, -90), 'text')
		expect(t.at).toEqual({ x: 20, y: 0 })
		expect(t.rot).toBe(270)
		expect(g(rotateGeometry({ kind: 'insert', blockId: 'b', at: { x: 5, y: 0 }, rot: 10 }, O, 180), 'insert')).toMatchObject({ at: { x: -5, y: 0 }, rot: 190 })
	})
	it('a turned arc keeps its sweep; a path keeps its heights', () => {
		expect(g(rotateGeometry({ kind: 'arc', centre: { x: 10, y: 0 }, r: 5, start: 0, end: 90 }, O, 90), 'arc')).toMatchObject({ centre: { x: 0, y: 10 }, start: 90, end: 180 })
		const p = g(rotateGeometry({ kind: 'path', nodes: [{ id: 'a', x: 100, y: 0, z: 300 }], segs: [] }, O, 90), 'path')
		expect(p.nodes[0]).toEqual({ id: 'a', x: 0, y: 100, z: 300 })
	})
	it('a turned dimension keeps its line on the same side; a quarter turn makes a horizontal one vertical; any other angle an aligned one of the same length', () => {
		const al = g(rotateGeometry({ kind: 'dimension', a: O, b: { x: 100, y: 0 }, offset: 10, mode: 'aligned', textAt: { x: 50, y: 20 } }, O, 90), 'dimension')
		expect(al).toMatchObject({ a: O, b: { x: 0, y: 100 }, offset: 10, textAt: { x: -20, y: 50 } })
		const h = { kind: 'dimension', a: O, b: { x: 100, y: 40 }, offset: 10, mode: 'horizontal' } as const
		expect(g(rotateGeometry(h, O, 90), 'dimension')).toMatchObject({ mode: 'vertical', a: O, b: { x: -40, y: 100 }, offset: -10 })
		expect(g(rotateGeometry(h, O, 180), 'dimension')).toMatchObject({ mode: 'horizontal', offset: -10 })
		const t = g(rotateGeometry(h, O, 30), 'dimension')
		expect(t.mode).toBe('aligned')
		expect(Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y)).toBeCloseTo(100)   // it still measures the 100 across
		expect(t.offset).toBeCloseTo(10)
	})
	it('a mirror flips a rotation about the line: in a horizontal line r → −r, in a vertical one r → 180 − r', () => {
		const rect = { kind: 'rect', centre: { x: 100, y: 50 }, size: { x: 50, y: 20 }, rot: 30 } as const
		expect(g(mirrorGeometry(rect, O, X), 'rect')).toMatchObject({ centre: { x: 100, y: -50 }, rot: 150 })   // −30, and a box turned half round is the same box
		expect(g(mirrorGeometry(rect, O, Y), 'rect')).toMatchObject({ centre: { x: -100, y: 50 }, rot: 150 })
		expect(g(mirrorGeometry({ kind: 'insert', blockId: 'b', at: { x: 5, y: 5 }, rot: 45 }, O, X), 'insert')).toMatchObject({ at: { x: 5, y: -5 }, rot: 315 })
		const p = g(mirrorGeometry({ kind: 'path', nodes: [{ id: 'a', x: 3, y: 4, z: 9 }], segs: [] }, { x: 0, y: 1 }, { x: 1, y: 1 }), 'path')
		expect(p.nodes[0]).toEqual({ id: 'a', x: 3, y: -2, z: 9 })
	})
	it('a mirrored arc still sweeps clockwise from start to end, over the mirrored part of the circle', () => {
		const a = g(mirrorGeometry({ kind: 'arc', centre: O, r: 10, start: 0, end: 90 }, O, X), 'arc')
		expect(a).toMatchObject({ start: 270, end: 0 })
		const [s, , e] = arcPoints(a)
		expect([s.x, s.y, e.x, e.y].map((v) => Math.round(v) || 0)).toEqual([0, -10, 10, 0])   // the original ran (10,0) → (0,10)
	})
	it('mirrored text stays readable: its point is mirrored, not its letters, and it still ends where the mirror image would', () => {
		const t = { kind: 'text', at: { x: 10, y: 10 }, text: 'A', sizeMm: 3 } as const
		const v = g(mirrorGeometry(t, O, Y), 'text')
		expect(v).toMatchObject({ at: { x: -10, y: 10 }, align: 'right' })
		expect(v.rot).toBeUndefined()   // not upside down
		const h = g(mirrorGeometry({ ...t, rot: 30 }, O, X), 'text')
		expect(h).toMatchObject({ at: { x: 10, y: -10 }, rot: 330 })
		expect(h.align).toBeUndefined()
		expect(g(mirrorGeometry({ kind: 'image', fileId: 'f', centre: { x: 1, y: 0 }, size: X }, O, Y), 'image').rot).toBeUndefined()
	})
	it('a mirrored dimension keeps its line on the mirrored side', () => {
		const d = g(mirrorGeometry({ kind: 'dimension', a: O, b: { x: 100, y: 0 }, offset: 10, mode: 'aligned' }, O, X), 'dimension')
		expect(d).toMatchObject({ a: O, b: { x: 100, y: 0 }, offset: -10 })   // was below the line (+y), now above
		const h = g(mirrorGeometry({ kind: 'dimension', a: O, b: { x: 100, y: 40 }, offset: 10, mode: 'horizontal' }, O, Y), 'dimension')
		expect(h).toMatchObject({ mode: 'horizontal', b: { x: -100, y: 40 }, offset: 10 })
	})
})
