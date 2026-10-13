// 3D blocks (Dave 2026-10-14): furniture drawn with the Box tool, made into a block, shown in every plan, elevation and
// section as seen from there.
import { describe, it, expect } from 'vitest'
import { blockFromShapes, is3d, placed3d, explodeInsert, type Block } from './blocks'
import { ProjectIndex } from './project'
import { demoProject } from './fixtures'
import { spaceOf } from '../views/space'
import { elevationDisplayList } from '../views/elevation'
import { planDisplayList } from '../views/plan'
import type { Shape } from './shapes'
import type { Prim } from '../views/display'

const box = (id: string, x: number, y: number, w: number, d: number, z: number, h: number): Shape =>
	({ type: 'shape', id, levelId: 'L33', geom: { kind: 'rect', centre: { x, y }, size: { x: w, y: d } }, extent: h, ...(z ? { plane: { kind: 'plan', z } } : {}) }) as Shape
const line = (id: string, a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): Shape =>
	({ type: 'shape', id, levelId: 'L33', geom: { kind: 'path', nodes: [{ id: `${id}a`, ...a }, { id: `${id}b`, ...b }], segs: [{ id: `${id}s`, a: `${id}a`, b: `${id}b` }] } }) as Shape
const text = (id: string, t: string): Shape => ({ type: 'shape', id, levelId: 'L33', geom: { kind: 'text', at: { x: 5000, y: 5000 }, text: t, sizeMm: 2.5, align: 'centre' } }) as Shape

// a desk: a 1600 × 800 top 30 thick at 720, one leg, a flat outline on the floor, a label, a plain note, a cable riser
// line straight up and a line running away from the front elevation's viewer
const desk = [box('top', 5000, 5000, 1600, 800, 720, 30), box('leg', 4300, 5000, 50, 700, 0, 720),
	{ type: 'shape', id: 'flat', levelId: 'L33', geom: { kind: 'rect', centre: { x: 5000, y: 5000 }, size: { x: 1700, y: 900 } } } as Shape,
	text('lbl', '{NAME}'), text('note', 'oak'),
	line('up', { x: 5700, y: 5000, z: 0 }, { x: 5700, y: 5000, z: 720 }), line('deep', { x: 5600, y: 4700, z: 720 }, { x: 5600, y: 5300, z: 720 })]

function made() {
	const r = blockFromShapes(desk, 'Desk')
	r.block.attrs = [{ tag: 'NAME', label: 'Name', default: 'D1' }]
	return r
}
const front = spaceOf({ kind: 'elevation', dir: 'front' })
const ofIns = (prims: Prim[], id: string) => prims.filter((p) => p.src === id)

describe('3D blocks', () => {
	it('boxes make a 3D Furniture block, its heights from the floor of the lowest; the insert stands where they stood', () => {
		const { block, insert } = made()
		expect(is3d(block)).toBe(true)
		expect(block.category).toBe('furniture')
		expect(insert.geom).toMatchObject({ kind: 'insert', at: { x: 5000, y: 5000 } })
		expect((insert.geom as { z?: number }).z).toBeUndefined()   // the lowest box is on the floor
		const [s] = placed3d({ ...insert, geom: { ...insert.geom, z: 300 } } as Shape, block)
		expect(s).toMatchObject({ id: insert.id, plane: { kind: 'plan', z: 1020 }, extent: 30 })   // lifted with the insert
		expect(is3d({ type: 'block', id: 'b', name: 'B', scope: 'global', shapes: [] })).toBe(false)
	})
	it('the plan: seen from above, as the insert — not the line straight up', () => {
		const { block, insert } = made(), blocks = (id: string) => (id === block.id ? block : undefined)
		const prims = ofIns(planDisplayList(new ProjectIndex([...demoProject(), insert]), 'L33', { scale: 100, blocks }), insert.id)
		expect(prims.filter((p) => p.k === 'line').length).toBe(4)   // top, leg, flat outline, the deep line — and not the riser
		expect(prims.some((p) => p.k === 'text' && p.text === 'D1')).toBe(true)
		expect(prims.some((p) => p.k === 'text' && p.text === 'oak')).toBe(true)
	})
	it('an elevation (with no "show in elevations"): the boxes at their heights, the riser, the label — not the flat outline, the plain note or the end-on line', () => {
		const { block, insert } = made(), blocks = (id: string) => (id === block.id ? block : undefined)
		const prims = ofIns(elevationDisplayList(new ProjectIndex([...demoProject(), insert]), 'L33', front, { scale: 100, blocks }), insert.id)
		const ys = (p: Prim) => (p.k === 'line' ? p.pts.map((q) => -q.y) : [])
		const boxes = prims.filter((p) => p.k === 'line' && p.closed)
		expect(boxes.map((p) => [Math.min(...ys(p)), Math.max(...ys(p))]).sort((a, b) => a[0] - b[0])).toEqual([[0, 720], [720, 750]])
		const lines = prims.filter((p) => p.k === 'line' && !p.closed)
		expect(lines).toHaveLength(1)                     // the riser; the deep line is a point from the front
		expect(ys(lines[0]).sort((a, b) => a - b)).toEqual([0, 720])
		expect(prims.filter((p) => p.k === 'text').map((p) => p.k === 'text' && p.text)).toEqual(['D1'])
	})
	it('turned 90°: the side elevation sees the desk’s length', () => {
		const { block, insert } = made(), blocks = (id: string) => (id === block.id ? block : undefined)
		const turned = { ...insert, geom: { ...insert.geom, rot: 90 } } as Shape
		const width = (sp: ReturnType<typeof spaceOf>) => {
			const top = ofIns(elevationDisplayList(new ProjectIndex([...demoProject(), turned]), 'L33', sp, { scale: 100, blocks }), insert.id)
				.filter((p) => p.k === 'line' && p.closed).flatMap((p) => (p.k === 'line' ? p.pts.map((q) => q.x) : []))
			return Math.round(Math.max(...top) - Math.min(...top))
		}
		expect(width(front)).toBe(800)
		expect(width(spaceOf({ kind: 'elevation', dir: 'left' }))).toBe(1600)
	})
	it('explode: the boxes back where they stand', () => {
		const { block, insert } = made()
		const out = explodeInsert({ ...insert, geom: { ...insert.geom, z: 100 } } as Shape, block as Block, 100)
		expect(out.find((s) => s.geom.kind === 'rect' && s.extent === 30)).toMatchObject({ plane: { kind: 'plan', z: 820 }, levelId: 'L33' })
		expect(new Set(out.map((s) => s.id)).size).toBe(out.length)
	})
})
