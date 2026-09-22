import { describe, it, expect } from 'vitest'
import {
	boxFootprint, prismRings, dominantAxis, isoR, isoDepthR, DEFAULT_YAW, DEFAULT_PITCH,
	objBounds, inClip, trimToClip, modelZRange, modelBounds, xyCenter, doorGeom, project, faces3d,
	posAlong, sizeAlong, roundObj, moveAlong,
} from './projection'
import type { Prism, Wall, Conduit, Clip } from './types'

const prism = (over: Partial<Prism> = {}): Prism => ({ type: 'prism', x: 100, y: 200, z: 0, w: 400, d: 300, h: 1000, edges: 4, ...over })
// Straight wall along +x from (0,0) to (1000,0), thickness 200, height 3000.
const wall = (over: Partial<Wall> = {}): Wall => ({
	type: 'wall', h: 3000, thickness: 200,
	nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 1000, y: 0, z: 0 }],
	segments: [{ id: 'ab', a: 'a', b: 'b' }], ...over,
})
// Straight rectangular conduit along +x, 100 wide (y) × 50 high (z), at z=500.
const conduit = (over: Partial<Conduit> = {}): Conduit => ({
	type: 'conduit', w: 100, h: 50, edges: 4,
	nodes: [{ id: 'a', x: 0, y: 0, z: 500 }, { id: 'b', x: 1000, y: 0, z: 500 }],
	segments: [{ id: 'ab', a: 'a', b: 'b' }], ...over,
})
const xs = (pts: { x: number }[]) => pts.map((p) => p.x), ys = (pts: { y: number }[]) => pts.map((p) => p.y), zs = (pts: { z: number }[]) => pts.map((p) => p.z)
const us = (pts: { u: number }[]) => pts.map((p) => p.u), vs = (pts: { v: number }[]) => pts.map((p) => p.v)
const span = (a: number[]) => [Math.min(...a), Math.max(...a)]
const near = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6))

describe('boxFootprint', () => {
	it('4 edges reproduce the w×d rectangle corners', () => {
		const pts = boxFootprint(100, 200, 400, 300, 4, 0)
		expect(pts).toHaveLength(4)
		near(span(xs(pts)), [100, 500]); near(span(ys(pts)), [200, 500])
		expect(pts.every((p) => (p.x === 100 || p.x === 500) && (p.y === 200 || p.y === 500) || Math.abs(p.x - 100) < 1e-9 || Math.abs(p.x - 500) < 1e-9)).toBe(true)
	})
	it('an even edge count fills the bounding box exactly (normalised n-gon)', () => {
		for (const n of [6, 8, 16, 24]) {
			const pts = boxFootprint(0, 0, 400, 300, n, 7)
			expect(pts).toHaveLength(n)
			near(span(xs(pts)), [0, 400]); near(span(ys(pts)), [0, 300])
			expect(pts.every((p) => p.z === 7)).toBe(true)
		}
	})
	it('B21 fixed: an odd edge count ALSO fills the bounding box exactly (min/max normalisation, not max|cos|/max|sin|)', () => {
		for (const n of [3, 5, 7, 9]) {
			const pts = boxFootprint(0, 0, 400, 300, n, 7)
			expect(pts).toHaveLength(n)
			near(span(xs(pts)), [0, 400]); near(span(ys(pts)), [0, 300])
		}
	})
	it('B21: an even edge count is numerically unchanged from the old max|cos|/max|sin| formula (byte-identical to floating-point precision)', () => {
		const oldBoxFootprint = (x: number, y: number, w: number, d: number, edges: number, z: number) => {
			const n = edges, cx = x + w / 2, cy = y + d / 2
			const angs = Array.from({ length: n }, (_, k) => Math.PI / n + (k * 2 * Math.PI) / n)
			const maxc = Math.max(...angs.map((a) => Math.abs(Math.cos(a)))), maxs = Math.max(...angs.map((a) => Math.abs(Math.sin(a))))
			return angs.map((a) => ({ x: cx + (w / 2) * (Math.cos(a) / maxc), y: cy + (d / 2) * (Math.sin(a) / maxs), z }))
		}
		for (const n of [4, 6, 8, 16, 24]) {
			const now = boxFootprint(10, 20, 400, 300, n, 7), old = oldBoxFootprint(10, 20, 400, 300, n, 7)
			now.forEach((p, i) => { expect(p.x).toBeCloseTo(old[i].x, 9); expect(p.y).toBeCloseTo(old[i].y, 9); expect(p.z).toBe(old[i].z) })
		}
	})
	it('clamps the edge count to 3..24', () => {
		expect(boxFootprint(0, 0, 1, 1, 1, 0)).toHaveLength(3)
		expect(boxFootprint(0, 0, 1, 1, 99, 0)).toHaveLength(24)
	})
	it('rot=90 swaps the w/d extents about the footprint centre', () => {
		const pts = boxFootprint(0, 0, 400, 300, 4, 0, 90)
		near(span(xs(pts)), [50, 350]); near(span(ys(pts)), [-50, 350])
	})
})

describe('prismRings', () => {
	it('untilted: bottom ring at z, top ring at z+h', () => {
		const { bot, top } = prismRings(prism({ z: 50, h: 1000 }))
		expect(bot.every((p) => p.z === 50)).toBe(true)
		expect(top.every((p) => p.z === 1050)).toBe(true)
	})
	it('rotX=180 flips the rings through the box centre (bottom rises to z+h)', () => {
		const { bot, top } = prismRings(prism({ z: 0, h: 1000, rotX: 180 }))
		bot.forEach((p) => expect(p.z).toBeCloseTo(1000, 6))
		top.forEach((p) => expect(p.z).toBeCloseTo(0, 6))
	})
	it('a tilt keeps the box centre fixed', () => {
		const p = prism({ rotX: 30, rotY: -20 })
		const { bot, top } = prismRings(p)
		const all = [...bot, ...top]
		const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length
		expect(avg(xs(all))).toBeCloseTo(p.x + p.w / 2, 6)
		expect(avg(ys(all))).toBeCloseTo(p.y + p.d / 2, 6)
		expect(avg(zs(all))).toBeCloseTo(p.z + p.h / 2, 6)
	})
})

describe('dominantAxis', () => {
	it('picks the axis with the largest extent; ties go z, then y', () => {
		expect(dominantAxis({ x: 0, y: 0, z: 0 }, { x: 10, y: 2, z: 1 })).toBe('x')
		expect(dominantAxis({ x: 0, y: 0, z: 0 }, { x: 2, y: 10, z: 1 })).toBe('y')
		expect(dominantAxis({ x: 0, y: 0, z: 0 }, { x: 2, y: 3, z: 10 })).toBe('z')
		expect(dominantAxis({ x: 0, y: 0, z: 0 }, { x: 5, y: 5, z: 5 })).toBe('z')
		expect(dominantAxis({ x: 0, y: 0, z: 0 }, { x: 5, y: 5, z: 0 })).toBe('y')
	})
})

describe('iso camera (isoR / isoDepthR)', () => {
	it('the default view is the classic isometric: 45° yaw, atan(1/√2) pitch', () => {
		expect(DEFAULT_YAW).toBeCloseTo(Math.PI / 4, 12)
		expect(DEFAULT_PITCH).toBeCloseTo(Math.atan(1 / Math.SQRT2), 12)
	})
	it('the pivot projects to the origin and vertical stays vertical on screen', () => {
		expect(isoR({ x: 50, y: 50, z: 0 }, DEFAULT_YAW, DEFAULT_PITCH, 50, 50)).toEqual({ u: 0, v: 0 })
		const up = isoR({ x: 50, y: 50, z: 1000 }, DEFAULT_YAW, DEFAULT_PITCH, 50, 50)
		expect(up.u).toBeCloseTo(0, 9)
		expect(up.v).toBeCloseTo(1000 * Math.cos(DEFAULT_PITCH), 9)
	})
	it('plan-top (small y) is farther from the camera than plan-bottom (y-down plan convention)', () => {
		const back = isoDepthR({ x: 50, y: 0, z: 0 }, DEFAULT_YAW, DEFAULT_PITCH, 50, 50)
		const front = isoDepthR({ x: 50, y: 100, z: 0 }, DEFAULT_YAW, DEFAULT_PITCH, 50, 50)
		expect(back).toBeGreaterThan(front)
	})
	it('a higher point is nearer the camera (looks down onto it)', () => {
		const lo = isoDepthR({ x: 50, y: 50, z: 0 }, DEFAULT_YAW, DEFAULT_PITCH, 50, 50)
		const hi = isoDepthR({ x: 50, y: 50, z: 500 }, DEFAULT_YAW, DEFAULT_PITCH, 50, 50)
		expect(hi).toBeLessThan(lo)
	})
})

describe('bounds: objBounds / modelBounds / modelZRange / xyCenter', () => {
	it('prism bounds are its box; wall bounds add h to the top; conduit bounds are its nodes', () => {
		expect(objBounds(prism())).toEqual({ x0: 100, x1: 500, y0: 200, y1: 500, z0: 0, z1: 1000 })
		expect(objBounds(wall())).toEqual({ x0: 0, x1: 1000, y0: 0, y1: 0, z0: 0, z1: 3000 })
		expect(objBounds(conduit())).toEqual({ x0: 0, x1: 1000, y0: 0, y1: 0, z0: 500, z1: 500 })
	})
	it('modelBounds unions objects and is null when empty', () => {
		expect(modelBounds([])).toBeNull()
		expect(modelBounds([prism(), wall()])).toEqual({ x0: 0, x1: 1000, y0: 0, y1: 500, z0: 0, z1: 3000 })
	})
	it('modelZRange defaults to 0..1000 when empty', () => {
		expect(modelZRange([])).toEqual({ z0: 0, z1: 1000 })
		expect(modelZRange([conduit()])).toEqual({ z0: 500, z1: 500 })
	})
	it('xyCenter is the centre of the x-y bounding box (0,0 when empty)', () => {
		expect(xyCenter([])).toEqual({ cx: 0, cy: 0 })
		expect(xyCenter([prism(), wall()])).toEqual({ cx: 500, cy: 250 })
	})
})

describe('inClip / trimToClip', () => {
	const box: Clip = { x0: 400, x1: 600, y0: -100, y1: 100, z0: 0, z1: 4000 }
	it('inClip overlaps on all three axes and is order-independent per axis', () => {
		expect(inClip(prism(), box)).toBe(false)               // prism y 200..500 misses y −100..100
		expect(inClip(wall(), box)).toBe(true)
		expect(inClip(wall(), { ...box, x0: 600, x1: 400 })).toBe(true)   // swapped x still overlaps
		expect(inClip(wall(), { ...box, z0: 3500, z1: 4000 })).toBe(false)  // above the wall top
	})
	it('a prism passes through whole or is dropped', () => {
		expect(trimToClip(prism(), box)).toBeNull()
		const p = prism({ y: -50 })
		expect(trimToClip(p, box)).toBe(p)
	})
	it('a wall keeps only the segments that cross the box, plus the nodes they use', () => {
		const w = wall({
			nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 1000, y: 0, z: 0 }, { id: 'c', x: 1000, y: 2000, z: 0 }],
			segments: [{ id: 'ab', a: 'a', b: 'b' }, { id: 'bc', a: 'b', b: 'c' }],
		})
		const t = trimToClip(w, box) as Wall
		expect(t.segments.map((s) => s.id)).toEqual(['ab'])
		expect(t.nodes.map((n) => n.id).sort()).toEqual(['a', 'b'])
		expect(trimToClip(w, { ...box, x0: 5000, x1: 6000 })).toBeNull()
	})
	it('a clip box touching only the base line or only the top line of a wall still catches it', () => {
		const low: Clip = { ...box, z0: -100, z1: 200 }       // crosses the base (z=0) only
		const high: Clip = { ...box, z0: 2800, z1: 3200 }     // crosses the top (z=3000) only
		expect(trimToClip(wall(), low)).not.toBeNull()
		expect(trimToClip(wall(), high)).not.toBeNull()
		expect(trimToClip(conduit(), high)).toBeNull()        // a conduit has no height extent
	})
	it('B20 fixed: a clip box strictly between a wall base and top still catches the wall', () => {
		const mid: Clip = { ...box, z0: 1000, z1: 2000 }
		expect(trimToClip(wall(), mid)).not.toBeNull()
	})
	it('B20: the z-band test is exact, not just "any overlap of the wall\'s full height" — a clip box entirely above the wall top, or entirely below its base, still misses', () => {
		expect(trimToClip(wall(), { ...box, z0: 3001, z1: 5000 })).toBeNull()   // just above the 3000 top
		expect(trimToClip(wall(), { ...box, z0: -500, z1: -1 })).toBeNull()     // just below the 0 base
	})
	it('B20: the XY half still gates correctly — a mid-height clip box off to the side of the wall misses', () => {
		const midBox: Clip = { x0: 5000, x1: 6000, y0: -100, y1: 100, z0: 1000, z1: 2000 }
		expect(trimToClip(wall(), midBox)).toBeNull()
	})
	it('B20 does not change conduit precision: a diagonal-in-z conduit whose XY and Z ranges both overlap the box, but whose true 3D line does not, still misses', () => {
		// The segment runs from (0,0,0) to (1000,0,1000) — its XY footprint (y=0, x 0..1000) crosses the
		// box's x/y rect, and its z-range (0..1000) overlaps the box's z-range (0..100), but the actual 3D
		// line is only within z 0..100 for x in 0..100 — nowhere near the box's x 400..600.
		const diag = conduit({ nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 1000, y: 0, z: 1000 }] })
		const lowSlab: Clip = { x0: 400, x1: 600, y0: -100, y1: 100, z0: 0, z1: 100 }
		expect(trimToClip(diag, lowSlab)).toBeNull()
	})
})

describe('doorGeom', () => {
	it('a door along x hinges at the left jamb and swings toward −y; flip moves the hinge to the right jamb', () => {
		expect(doorGeom(prism({ w: 900, d: 100 }))).toEqual({ hx: 100, hy: 250, ux: 1, uy: 0, vx: 0, vy: -1, L: 900 })
		expect(doorGeom(prism({ w: 900, d: 100, flip: true }))).toEqual({ hx: 1000, hy: 250, ux: -1, uy: 0, vx: 0, vy: -1, L: 900 })
	})
	it('a door along y hinges at the near jamb and swings toward −x', () => {
		expect(doorGeom(prism({ w: 100, d: 900 }))).toEqual({ hx: 150, hy: 200, ux: 0, uy: 1, vx: -1, vy: 0, L: 900 })
		expect(doorGeom(prism({ w: 100, d: 900, flip: true })).hy).toBe(1100)
	})
})

describe('project — orthographic outlines', () => {
	it('prism plan = its footprint; front = an upright rectangle x × z; rear mirrors x; right uses y', () => {
		const p = prism()
		const [plan] = project(p, 'plan')
		expect(plan.closed).toBe(true); near(span(us(plan.pts)), [100, 500]); near(span(vs(plan.pts)), [200, 500])
		const [front] = project(p, 'front')
		expect(front.pts).toHaveLength(4); near(span(us(front.pts)), [100, 500]); near(span(vs(front.pts)), [0, 1000])
		const [rear] = project(p, 'rear')
		near(span(us(rear.pts)), [-500, -100])
		const [right] = project(p, 'right')
		near(span(us(right.pts)), [200, 500]); near(span(vs(right.pts)), [0, 1000])
	})
	it('a tilted prism projects as the convex hull of its corners (wider than the upright box)', () => {
		const [tilted] = project(prism({ rotY: 45 }), 'front')
		const [w0, w1] = span(us(tilted.pts))
		expect(w1 - w0).toBeGreaterThan(400)
		expect(tilted.closed).toBe(true)
	})
	it('a straight wall is one thick box per segment in plan and a rectangle in elevation', () => {
		const [plan] = project(wall(), 'plan')
		expect(plan.pts).toHaveLength(4)
		near(span(us(plan.pts)), [0, 1000]); near(span(vs(plan.pts)), [-100, 100])
		const [front] = project(wall(), 'front')
		near(span(us(front.pts)), [0, 1000]); near(span(vs(front.pts)), [0, 3000])
	})
	it('a closed square wall mitres its corners so the outer footprint grows by half the thickness', () => {
		const sq = wall({
			nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 1000, y: 0, z: 0 }, { id: 'c', x: 1000, y: 1000, z: 0 }, { id: 'd', x: 0, y: 1000, z: 0 }],
			segments: [{ id: 'ab', a: 'a', b: 'b' }, { id: 'bc', a: 'b', b: 'c' }, { id: 'cd', a: 'c', b: 'd' }, { id: 'da', a: 'd', b: 'a' }],
		})
		const shapes = project(sq, 'plan')
		expect(shapes).toHaveLength(4)
		const all = shapes.flatMap((s) => s.pts)
		near(span(us(all)), [-100, 1100]); near(span(vs(all)), [-100, 1100])
		// the corner at the origin has both an outer (−100,−100) and an inner (100,100) mitre point
		expect(all.some((p) => Math.abs(p.u + 100) < 1e-6 && Math.abs(p.v + 100) < 1e-6)).toBe(true)
		expect(all.some((p) => Math.abs(p.u - 100) < 1e-6 && Math.abs(p.v - 100) < 1e-6)).toBe(true)
	})
	it('a straight conduit is one hull per segment: w wide in plan, h tall in elevation', () => {
		const [plan] = project(conduit(), 'plan')
		near(span(us(plan.pts)), [0, 1000]); near(span(vs(plan.pts)), [-50, 50])
		const [front] = project(conduit(), 'front')
		near(span(us(front.pts)), [0, 1000]); near(span(vs(front.pts)), [475, 525])
	})
	it('iso returns wireframe edges: 12 open two-point shapes for a 4-edge prism', () => {
		const edges = project(prism(), 'iso')
		expect(edges).toHaveLength(12)
		expect(edges.every((e) => !e.closed && e.pts.length === 2)).toBe(true)
	})
})

describe('faces3d', () => {
	it('a box prism has 6 faces (bottom, top, 4 sides)', () => {
		expect(faces3d(prism())).toHaveLength(6)
	})
	it('a straight rectangular conduit has 4 side faces + 2 end caps, with perpendicular caps at the ends', () => {
		const f = faces3d(conduit())
		expect(f).toHaveLength(6)
		const caps = f.slice(-2)
		expect(caps[0].pts.every((p) => p.x === 0)).toBe(true)
		expect(caps[1].pts.every((p) => p.x === 1000)).toBe(true)
		near(span(ys(caps[0].pts)), [-50, 50]); near(span(zs(caps[0].pts)), [475, 525])
	})
	it('an L-bend conduit shares a mitred ring at the corner (3 rings → 8 sides + 2 caps)', () => {
		const L = conduit({
			nodes: [{ id: 'a', x: 0, y: 0, z: 500 }, { id: 'b', x: 1000, y: 0, z: 500 }, { id: 'c', x: 1000, y: 1000, z: 500 }],
			segments: [{ id: 'ab', a: 'a', b: 'b' }, { id: 'bc', a: 'b', b: 'c' }],
		})
		expect(faces3d(L)).toHaveLength(10)
	})
	it('a wall face set is one box (6 faces) per segment', () => {
		expect(faces3d(wall())).toHaveLength(6)
	})
})

describe('axis accessors / mutators', () => {
	it('posAlong / sizeAlong read a prism box; walls report z only; conduits their first node', () => {
		expect(posAlong(prism(), 'y')).toBe(200); expect(sizeAlong(prism(), 'y')).toBe(300)
		expect(posAlong(wall({ nodes: [{ id: 'a', x: 5, y: 6, z: 70 }] }), 'z')).toBe(70)
		expect(posAlong(wall(), 'x')).toBe(0)
		expect(posAlong(conduit(), 'z')).toBe(500); expect(sizeAlong(conduit(), 'z')).toBe(0)
	})
	it('moveAlong shifts a prism origin or every graph node', () => {
		const p = prism(); moveAlong(p, 'x', 25); expect(p.x).toBe(125)
		const w = wall(); moveAlong(w, 'z', 100); expect(w.nodes.map((n) => n.z)).toEqual([100, 100])
	})
	it('roundObj snaps every coordinate and size to whole mm', () => {
		const p = prism({ x: 1.4, w: 2.6, h: 9.5 }); roundObj(p); expect([p.x, p.w, p.h]).toEqual([1, 3, 10])
		const c = conduit({ w: 99.6, nodes: [{ id: 'a', x: 0.2, y: 0.7, z: 1.5 }] }); roundObj(c)
		expect(c.w).toBe(100); expect(c.nodes[0]).toMatchObject({ x: 0, y: 1, z: 2 })
	})
})
