import { describe, it, expect } from 'vitest'
import { type Ent, dist, segDist, translate, textBox, boxElev, boxElevSet, boxFaces, elevU, flatSpan, GROUND, DEFAULT_BOX_H } from './geometry'

const box = (over: Partial<Ent> = {}): Ent => ({ id: 'b', type: 'box', a: [100, 50], b: [200, 150], h: 40, z0: 0, ...over })

describe('dist / segDist', () => {
	it('dist is euclidean', () => {
		expect(dist([0, 0], [3, 4])).toBe(5)
	})
	it('segDist projects onto the segment and clamps to the ends', () => {
		expect(segDist([5, 5], [0, 0], [10, 0])).toBe(5)       // above the middle
		expect(segDist([-5, 0], [0, 0], [10, 0])).toBe(5)      // past the start → clamps to a
		expect(segDist([3, 0], [0, 0], [10, 0])).toBe(0)       // on the segment
	})
})

describe('translate', () => {
	it('moves a/b/c and every polyline point, leaving others untouched', () => {
		const e: Ent = { id: 'p', type: 'polyline', pts: [[0, 0], [10, 5]] }
		expect(translate(e, 3, -2).pts).toEqual([[3, -2], [13, 3]])
		const l: Ent = { id: 'l', type: 'line', a: [0, 0], b: [4, 4] }
		const t = translate(l, 1, 1)
		expect(t.a).toEqual([1, 1]); expect(t.b).toEqual([5, 5])
	})
})

describe('textBox', () => {
	it('grows with the longest line and the line count', () => {
		const one = textBox({ id: 't', type: 'text', a: [10, 20], text: 'AB' })
		const two = textBox({ id: 't', type: 'text', a: [10, 20], text: 'ABCDEFGH\nX' })
		expect(two[2]).toBeGreaterThan(one[2])   // wider (longer line)
		expect(two[3]).toBeGreaterThan(one[3])   // taller (2 lines)
		expect(one[0]).toBe(10)                  // left = anchor x
	})
})

describe('boxElev', () => {
	it('places the face by z0/height, independent of the footprint depth (y)', () => {
		const onGround = boxElev(box({ z0: 0, h: 40 }))
		expect(onGround.base).toBe(GROUND)          // z0=0 → stands on the ground line
		expect(onGround.top).toBe(GROUND - 40)      // top = base - height
		const raised = boxElev(box({ z0: 30, h: 40 }))
		expect(raised.base).toBe(GROUND - 30)       // raised by z0
		// moving the footprint in y must NOT change the elevation face
		const movedDepth = boxElev(box({ a: [100, 500], b: [200, 600], z0: 0, h: 40 }))
		expect(movedDepth.base).toBe(GROUND)
		expect(movedDepth.top).toBe(GROUND - 40)
	})
	it('defaults the height when h is missing', () => {
		expect(boxElev(box({ h: undefined })).top).toBe(GROUND - DEFAULT_BOX_H)
	})
})

describe('boxElevSet', () => {
	it('edits width/z0/height and clamps z0>=0 and h>=1, keeping plan depth', () => {
		const b = box({ a: [100, 50], b: [200, 150], z0: 0, h: 40 })
		const wider = boxElevSet(b, { x1: 260 })
		expect(Math.max(wider.a![0], wider.b![0])).toBe(260)
		expect(wider.a![1]).toBe(50); expect(wider.b![1]).toBe(150)   // depth (y) unchanged
		expect(boxElevSet(b, { z0: -10 }).z0).toBe(0)                 // clamped
		expect(boxElevSet(b, { h: -5 }).h).toBe(1)                    // clamped
	})
})

describe('elevU — per-direction horizontal projection (Kestrel/Sheets BASIS)', () => {
	it('front is identity, rear mirrors x, right/left use y (mirrored) about the plan centre', () => {
		expect(elevU('front', 100)).toBe(100)          // +x, centred at CX=200 → identity
		expect(elevU('rear', 100)).toBe(300)           // −x mirror about CX: 400-100
		expect(elevU('right', 50)).toBe(125)           // +y re-centred: 200 + (50-125)
		expect(elevU('left', 50)).toBe(275)            // −y mirror: 200 - (50-125)
		// mirror is symmetric: rear/left applied twice returns the original
		expect(elevU('rear', elevU('rear', 137))).toBe(137)
		expect(elevU('left', elevU('left', 88))).toBe(88)
	})
})

describe('boxElev per direction — front/rear use x-extent, left/right use y-extent', () => {
	const b = box({ a: [100, 50], b: [260, 120] })   // x-width 160, y-depth 70 (non-square)
	it('front projects the x-extent (width 160)', () => {
		const f = boxElev(b, 'front')
		expect(f.x1 - f.x0).toBe(160)
		expect([f.x0, f.x1]).toEqual([100, 260])
	})
	it('right projects the y-extent (width 70, ≠ front)', () => {
		const r = boxElev(b, 'right')
		expect(r.x1 - r.x0).toBe(70)                   // depth, not width → axis swap
	})
	it('rear mirrors front (same width, mirrored position)', () => {
		const r = boxElev(b, 'rear')
		expect(r.x1 - r.x0).toBe(160)
		expect([r.x0, r.x1]).toEqual([140, 300])       // [400-260, 400-100]
	})
})

describe('boxElevSet per direction — edits only the view axis, keeps the other', () => {
	it('right-view width edit changes y (depth), leaving x untouched', () => {
		const b = box({ a: [100, 50], b: [260, 120] })
		const r = boxElev(b, 'right')                  // x0..x1 in drawing space
		const widened = boxElevSet(b, { x1: r.x1 + 30 }, 'right')
		expect(widened.a![0]).toBe(100); expect(widened.b![0]).toBe(260)   // x (front width) unchanged
		expect(Math.max(widened.a![1], widened.b![1])).toBe(150)           // y-depth grew by 30 (120→150)
	})
})

describe('flatSpan — flat objects collapse to a ground line on the view axis', () => {
	it('a line spans its x in front and its y in right', () => {
		const line: Ent = { id: 'l', type: 'line', a: [120, 60], b: [180, 140] }
		expect(flatSpan(line, 'front')).toEqual([120, 180])          // x-extent
		expect(flatSpan(line, 'right')).toEqual([elevU('right', 60), elevU('right', 140)])   // y-extent
	})
})

describe('boxFaces', () => {
	it('offsets the top face up-right by h·ISO and returns three face point-strings', () => {
		const f = boxFaces(box({ a: [0, 0], b: [100, 100], h: 40 }))
		expect(f.top).toContain(' ')            // a polygon points string
		expect(f.top.split(' ')).toHaveLength(4)
		expect(f.right.split(' ')).toHaveLength(4)
		expect(f.back.split(' ')).toHaveLength(4)
	})
})
