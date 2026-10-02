// Openings in walls: placement on the nearest segment, wall pieces around holes, jambs, door swing, elevation corners.
import { describe, it, expect } from 'vitest'
import { placeOpening, wallPieces, planOpenings, openingCorners, makeOpening } from './openings'
import { makeWall } from './make'
import type { Shape } from './shapes'

const wall = makeWall('L', [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }], 100, 2700)
const segs = wall.geom.kind === 'path' ? wall.geom.segs : []
const withOps = (...ops: ReturnType<typeof makeOpening>[]): Shape => ({ ...wall, role: { kind: 'wall', openings: ops } })

describe('openings', () => {
	it('a click on a wall places the opening on the nearest segment, kept inside it', () => {
		expect(placeOpening(wall, { x: 1500, y: 30 }, 900, 50)).toEqual({ segId: segs[0].id, at: 1500 })
		expect(placeOpening(wall, { x: 200, y: 0 }, 900, 50)).toEqual({ segId: segs[0].id, at: 450 })   // not past the end
		expect(placeOpening(wall, { x: 4010, y: 1000 }, 900, 50)?.segId).toBe(segs[1].id)
		expect(placeOpening(wall, { x: 1500, y: 400 }, 900, 50)).toBeNull()   // too far from the wall
		expect(placeOpening(wall, { x: 1500, y: 0 }, 5000, 50)).toBeNull()    // wider than the segment
	})
	it('the wall is solid around its holes', () => {
		expect(wallPieces(4000, [makeOpening('s', 1500, { width: 900, z: 0, h: 2100 }), makeOpening('s', 3000, { width: 600, z: 900, h: 1200 })]))
			.toEqual([[0, 1050], [1950, 2700], [3300, 4000]])
		expect(wallPieces(4000, [makeOpening('s', 450, { width: 900, z: 0, h: 2100 })])).toEqual([[900, 4000]])
	})
	it('a door draws jambs, its leaf at 90° from the hinge and an arc back to the far jamb; a window (no swing) just jambs', () => {
		const door = makeOpening(segs[0].id, 1500, { width: 900, z: 0, h: 2100, swing: 'left' })
		const p = planOpenings(withOps(door), segs[0].id, 100)
		expect(p.pieces).toHaveLength(2)
		expect(p.jambs).toEqual([[{ x: 1050, y: -50 }, { x: 1050, y: 50 }], [{ x: 1950, y: -50 }, { x: 1950, y: 50 }]])
		const [leaf, arc] = p.swings
		expect(leaf).toEqual([{ x: 1050, y: 50 }, { x: 1050, y: 950 }])   // hinge on the left jamb, opens to the +n face
		expect(arc[0].x).toBeCloseTo(1050); expect(arc[0].y).toBeCloseTo(950)
		expect(arc.at(-1)!.x).toBeCloseTo(1950); expect(arc.at(-1)!.y).toBeCloseTo(50)
		expect(planOpenings(withOps({ ...door, flip: true }), segs[0].id, 100).swings[0][1]).toEqual({ x: 1050, y: -950 })
		expect(planOpenings(withOps({ ...door, swing: undefined }), segs[0].id, 100).swings).toEqual([])
	})
	it('elevation corners: width along the wall, Z to Z + H', () => {
		expect(openingCorners(wall, makeOpening(segs[1].id, 1000, { width: 600, z: 900, h: 1200 }))).toEqual([
			{ x: 4000, y: 700, z: 900 }, { x: 4000, y: 1300, z: 900 }, { x: 4000, y: 1300, z: 2100 }, { x: 4000, y: 700, z: 2100 }])
	})
})
