// Resize grips on drawn regions (Dave, 2026-10-05).
import { describe, it, expect } from 'vitest'
import { regionGrips, dragRegionGrip, gripSpace, dimGrips, nearestIn } from './shapeGrips'
import { dimensionPrims } from '../views/plan'
import { spaceOf, PLAN } from '../views/space'
import type { Shape } from '../domain/shapes'

const shape = (geom: Shape['geom'], extra: Partial<Shape> = {}) => ({ type: 'shape', id: 'S', levelId: 'L', geom, ...extra }) as Shape
const rect = shape({ kind: 'rect', centre: { x: 200, y: 100 }, size: { x: 400, y: 200 } })   // 0,0 → 400,200

describe('region grips', () => {
	it('a rectangle: 4 corners then 4 edge middles', () => {
		expect(regionGrips(rect.geom)).toEqual([
			{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 200 }, { x: 0, y: 200 },
			{ x: 200, y: 0 }, { x: 400, y: 100 }, { x: 200, y: 200 }, { x: 0, y: 100 },
		])
	})
	it('a corner moves with the opposite corner fixed; Shift keeps it square', () => {
		expect(dragRegionGrip(rect, 2, { x: 600, y: 300 }, false).geom).toEqual({ kind: 'rect', centre: { x: 300, y: 150 }, size: { x: 600, y: 300 } })
		expect(dragRegionGrip(rect, 2, { x: 600, y: 300 }, true).geom).toMatchObject({ size: { x: 600, y: 600 } })
	})
	it('an edge middle moves that side only', () => {
		expect(dragRegionGrip(rect, 5, { x: 700, y: 999 }, false).geom).toEqual({ kind: 'rect', centre: { x: 350, y: 100 }, size: { x: 700, y: 200 } })   // the right edge out to x 700
		expect(dragRegionGrip(rect, 4, { x: 0, y: -100 }, false).geom).toEqual({ kind: 'rect', centre: { x: 200, y: 50 }, size: { x: 400, y: 300 } })    // the top edge up to y −100
	})
	it('a turned rectangle resizes along its own axes', () => {
		const turned = shape({ kind: 'rect', centre: { x: 0, y: 0 }, size: { x: 200, y: 100 }, rot: 90 })
		// its local +x edge middle sits at (0, 100) on the plan; pulled to (0, 300) the width grows to 400
		const g = dragRegionGrip(turned, 5, { x: 0, y: 300 }, false).geom as { size: { x: number; y: number }; centre: { x: number; y: number } }
		expect(g.size).toEqual({ x: 400, y: 100 })
		expect(g.centre.y).toBeCloseTo(100)
	})
	it('an ellipse\'s axis ends (Shift = a circle); a circle\'s radius; a polygon\'s corner', () => {
		const e = shape({ kind: 'ellipse', centre: { x: 0, y: 0 }, rx: 100, ry: 50 })
		expect(dragRegionGrip(e, 0, { x: 300, y: 10 }, false).geom).toMatchObject({ rx: 300, ry: 50 })
		expect(dragRegionGrip(e, 1, { x: 0, y: -80 }, true).geom).toEqual({ kind: 'circle', centre: { x: 0, y: 0 }, r: 80 })
		expect(dragRegionGrip(shape({ kind: 'circle', centre: { x: 0, y: 0 }, r: 10 }), 0, { x: 30, y: 40 }, false).geom).toMatchObject({ r: 50 })
		const tri = shape({ kind: 'polygon', pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 80 }] })
		expect((dragRegionGrip(tri, 2, { x: 50, y: 200 }, false).geom as { pts: unknown[] }).pts[2]).toEqual({ x: 50, y: 200 })
	})
	it('grips show on the plan for plan shapes, and only on the elevation a shape was drawn on', () => {
		expect(gripSpace(rect, spaceOf(PLAN), () => undefined)).not.toBeNull()
		const front = spaceOf({ kind: 'elevation', dir: 'front' }), right = spaceOf({ kind: 'elevation', dir: 'right' })
		const onFront = { ...rect, plane: { kind: 'vertical', frame: front.frame!, depth: 0 } } as Shape
		expect(gripSpace(onFront, front, () => undefined)!.to({ x: 10, y: 20 })).toEqual({ x: 10, y: -20 })   // (u, z) → (x, −y)
		expect(gripSpace(onFront, right, () => undefined)).toBeNull()
		expect(gripSpace(onFront, spaceOf(PLAN), () => undefined)).toBeNull()
	})
})

describe('note points (Dave, 2026-10-05: edit line and note end points)', () => {
	it('a leader: its points; the tip dragged off lets go of what it pointed at; Shift = 15° from the next point', () => {
		const l = shape({ kind: 'leader', pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }], text: 'A', attach: 'X' })
		expect(regionGrips(l.geom)).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }])
		const moved = dragRegionGrip(l, 0, { x: 10, y: 20 }, false).geom
		expect(moved).toEqual({ kind: 'leader', pts: [{ x: 10, y: 20 }, { x: 100, y: 0 }], text: 'A' })
		expect(dragRegionGrip(l, 1, { x: 200, y: 3 }, false).geom).toMatchObject({ attach: 'X' })   // the far end keeps it
		const snapped = dragRegionGrip(l, 1, { x: 100, y: 4 }, true).geom
		expect(snapped.kind === 'leader' && snapped.pts[1].y).toBe(0)
	})
	it('a dimension: its two points, and the middle of its line sets the offset', () => {
		const d = shape({ kind: 'dimension', a: { x: 0, y: 0 }, b: { x: 1000, y: 0 }, mode: 'aligned', offset: 200 })
		expect(regionGrips(d.geom)).toEqual([{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 500, y: 200 }])
		expect(dragRegionGrip(d, 2, { x: 300, y: -150 }, false).geom).toMatchObject({ offset: -150 })
		expect(dragRegionGrip(d, 1, { x: 1500, y: 10 }, false).geom).toMatchObject({ b: { x: 1500, y: 10 } })
	})
	it('a dimension’s text and extension-line grips: found where drawn; the text goes where dragged, a gap slides', () => {
		const d = shape({ kind: 'dimension', a: { x: 0, y: 0 }, b: { x: 1000, y: 0 }, mode: 'aligned', offset: 200 })
		const prims = dimensionPrims(d.geom as Parameters<typeof dimensionPrims>[0], 100, d.id)   // 1:100: a 100 mm gap, text 100 off
		const [text, extA, extB] = dimGrips(prims, d.id, { x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 200 }, { x: 1000, y: 200 })
		expect(extA).toEqual({ x: 0, y: 100 })
		expect(extB).toEqual({ x: 1000, y: 100 })
		expect(text.x).toBe(500)
		expect(dragRegionGrip(d, 3, { x: 800, y: 400 }, false).geom).toMatchObject({ textAt: { x: 800, y: 400 } })
		expect(dragRegionGrip(d, 4, { x: 30, y: 40 }, false).geom).toMatchObject({ gapA: 40 })
		expect(dragRegionGrip(d, 5, { x: 1000, y: 900 }, false).geom).toMatchObject({ gapB: 200 })   // no further than its line
		const moved = dimensionPrims({ ...(d.geom as Parameters<typeof dimensionPrims>[0]), gapA: 40, textAt: { x: 800, y: 400 } }, 100, d.id)
		expect(dimGrips(moved, d.id, { x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 200 }, { x: 1000, y: 200 }).slice(0, 2)).toEqual([{ x: 800, y: 400 }, { x: 0, y: 40 }])
		expect(nearestIn([{ x: 0, y: 0 }, { x: 3, y: 0 }], { x: 2.5, y: 0 }, 5)).toBe(1)
	})
	it('a cloud: its points', () => {
		const c = shape({ kind: 'cloud', pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] })
		expect(dragRegionGrip(c, 2, { x: 150, y: 120 }, false).geom).toMatchObject({ pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 150, y: 120 }] })
	})
})
