// Phase 1 of elevation-section-plan.md: the horizontal VIEW FRAME (geometry ElevFrame). The four ElevDirs become
// axis-aligned frames that must reproduce the pre-frame formulas (ELEV_BASIS / elevU / elevUInv, the 3dview BASIS
// table, the hidden-line depth x·n) EXACTLY — `toBe`, not close-to — so every existing view keeps its numbers.
// An oblique frame (30°) round-trips u / depth ↔ plan point.
import { describe, it, expect } from 'vitest'
import { type Pt, type ElevDir, type Ent, ELEV_BASIS, elevU, elevUInv, flatSpan, PLAN_CX, PLAN_CY, GROUND,
	frameOf, frameAt, frameAxis, frameU, frameDepth, frameInv, frameAlong, alongToU, uToAlong, frameSetU, frameStep, dotT, dotN, frameShift, frameSpan, rectPts } from './geometry'
import { viewMap, project } from '../3dview/projection'
import { BASIS, type Obj } from '../3dview/types'

const DIRS: ElevDir[] = ['front', 'rear', 'left', 'right']
// awkward values on purpose: fractions, negatives, far from the centre, the centre itself
const PTS: Pt[] = [[0, 0], [12345.678, 6789.01], [-3210.5, 20000.25], [PLAN_CX, PLAN_CY], [0.1, -0.3], [99999.9, -12345.6]]
const CENTRES: [number, number][] = [[PLAN_CX, PLAN_CY], [1234.5, -987.25]]
// each dir's depth (x·n, measured from the plan centre): n = (−t.y, t.x) = front +y, rear −y, right +x, left −x. Every
// view looks along −n, so a LARGER depth is NEARER the viewer (front's viewer is at the bottom of the sheet, right's at
// its right edge, left's at its left edge, rear's at the top).
const oldDepth = (d: ElevDir, p: Pt, cx: number, cy: number) => d === 'front' ? p[1] - cy : d === 'rear' ? cy - p[1] : d === 'right' ? p[0] - cx : cx - p[0]
const oldFar = (d: ElevDir, p: Pt) => d === 'front' ? p[1] : d === 'rear' ? -p[1] : d === 'right' ? p[0] : -p[0]

describe('frameOf(dir) reproduces the four axis-aligned views exactly', () => {
	it('frameU = elevU of the on-axis coord; uToAlong / alongToU = elevUInv / elevU; frameDepth = x·n from the centre (right +x, left −x)', () => {
		for (const [cx, cy] of CENTRES) for (const d of DIRS) {
			const f = frameOf(d, cx, cy), ax = ELEV_BASIS[d].axis
			expect(frameAxis(f)).toBe(ax)
			for (const p of PTS) {
				expect(frameU(f, p)).toBe(elevU(d, p[ax], cx, cy))
				expect(frameAlong(f, p)).toBe(p[ax])
				expect(alongToU(f, p[ax])).toBe(elevU(d, p[ax], cx, cy))
				expect(uToAlong(f, p[0])).toBe(elevUInv(d, p[0], cx, cy))
				expect(frameDepth(f, p) === oldDepth(d, p, cx, cy)).toBe(true)   // === (a −0 at the origin is fine)
			}
		}
	})
	it('frameInv: the on-axis coord is elevUInv; the depth lands on the other axis (along n: front +y, rear −y, right +x, left −x)', () => {
		for (const [cx, cy] of CENTRES) for (const d of DIRS) {
			const f = frameOf(d, cx, cy), ax = ELEV_BASIS[d].axis
			for (const p of PTS) {
				const q = frameInv(f, p[0], p[1])
				expect(q[ax]).toBe(elevUInv(d, p[0], cx, cy))
				expect(q[1 - ax]).toBeCloseTo((ax === 0 ? cy : cx) + (d === 'front' || d === 'right' ? 1 : -1) * p[1], 6)
				expect(frameDepth(f, q)).toBeCloseTo(p[1], 6)
			}
		}
	})
	it('frameSetU / frameStep touch only the on-axis coord (the off-axis one is copied, not recomputed)', () => {
		for (const d of DIRS) {
			const f = frameOf(d), ax = ELEV_BASIS[d].axis, sign = ELEV_BASIS[d].sign
			for (const p of PTS) {
				const q = frameSetU(f, p, 4321.5)
				expect(q[ax]).toBe(elevUInv(d, 4321.5)); expect(q[1 - ax]).toBe(p[1 - ax])
			}
			const s = frameStep(f, 37.5)
			expect(s[ax]).toBe(sign * 37.5); expect(s[1 - ax]).toBe(0)
		}
	})
	it('engine coords: dotT = the 3dview BASIS hs · p[h] (right −y, left +y), dotN = x·n (right +x, left −x), frameShift = viewMap’s centring', () => {
		for (const [cx, cy] of CENTRES) for (const d of DIRS) {
			const f = frameOf(d, cx, cy), b = BASIS[d]
			for (const p of PTS) {
				expect(dotT(f, p[0], p[1])).toBe(b.hs * (b.h === 'x' ? p[0] : p[1]))
				expect(dotN(f, p[0], p[1])).toBe(oldFar(d, p))
			}
			expect(frameShift(f)).toBe(cx - b.hs * (b.h === 'x' ? cx : cy))
		}
	})
	it('viewMap / project() keep the old engine formulas bit for bit (hs · p[h] + (cx − hs · centre), GROUND − z)', () => {
		const P = { x: 12345.678, y: 6789.01, z: 1500.5 }
		for (const d of DIRS) {
			const b = BASIS[d], along = b.h === 'x' ? P.x : P.y
			const [x, y] = viewMap(d, PLAN_CX, PLAN_CY, GROUND).toDraw(P)
			expect(x).toBe(b.hs * along + (PLAN_CX - b.hs * (b.h === 'x' ? PLAN_CX : PLAN_CY))); expect(y).toBe(GROUND - P.z)
			expect(x).toBeCloseTo(elevU(d, along), 9)   // = the entity projection (up to rounding, as before)
			const box = { type: 'prism', id: 'b', x: 1000.5, y: 2000.25, z: 300, w: 600, d: 900, h: 1200, edges: 4 } as Obj
			const us = project(box, d)[0].pts.map((q) => q.u)
			const lo = b.hs * (b.h === 'x' ? 1000.5 : 2000.25), hi = b.hs * (b.h === 'x' ? 1000.5 + 600 : 2000.25 + 900)
			expect(Math.min(...us)).toBe(Math.min(lo, hi)); expect(Math.max(...us)).toBe(Math.max(lo, hi))
		}
	})
	it('frameSpan / flatSpan = elevU of the min / max on-axis coord', () => {
		for (const d of DIRS) {
			const ax = ELEV_BASIS[d].axis, pts: Pt[] = rectPts(120.5, 60.25, 180, 140)
			const a = elevU(d, Math.min(...pts.map((p) => p[ax]))), b = elevU(d, Math.max(...pts.map((p) => p[ax])))
			expect(frameSpan(frameOf(d), pts)).toEqual([Math.min(a, b), Math.max(a, b)])
			const line: Ent = { id: 'l', type: 'polyline', pts: [[120.5, 60.25], [180, 140]] }
			expect(flatSpan(line, d)).toEqual([Math.min(a, b), Math.max(a, b)])
		}
	})
	it('the default-centre frames are shared constants (no allocation in render loops)', () => {
		expect(frameOf('front')).toBe(frameOf('front'))
		expect(frameOf('front', 1, 2)).not.toBe(frameOf('front'))
	})
})

describe('an oblique frame (30°)', () => {
	const o: Pt = [5000, 3000], f = frameAt(o, 30)
	it('is a unit, right-handed pair, n at 30° (the view looks along −n)', () => {
		expect(frameAxis(f)).toBe(null)
		expect(Math.hypot(...f.t)).toBeCloseTo(1, 12); expect(f.t[0] * f.n[0] + f.t[1] * f.n[1]).toBeCloseTo(0, 12)
		expect(f.n[0]).toBeCloseTo(Math.cos(Math.PI / 6), 12); expect(f.n[1]).toBeCloseTo(0.5, 12)
		expect(f.n).toEqual([-f.t[1], f.t[0]])
	})
	it('projects a known point: u along t (+ the origin’s x), depth along n', () => {
		const p: Pt = [o[0] + 1000, o[1]]   // 1000 mm along +x from the origin
		expect(frameU(f, p)).toBeCloseTo(o[0] + 500, 9)                         // x·t = 1000 · sin 30°
		expect(frameDepth(f, p)).toBeCloseTo(1000 * Math.cos(Math.PI / 6), 9)    // x·n = 1000 · cos 30°
		const q: Pt = [o[0], o[1] + 1000]
		expect(frameU(f, q)).toBeCloseTo(o[0] - 1000 * Math.cos(Math.PI / 6), 9); expect(frameDepth(f, q)).toBeCloseTo(500, 9)
	})
	it('round-trips u / depth → plan point → u / depth', () => {
		for (const [u, dp] of [[0, 0], [1234.5, -678.9], [-40000, 25000], [o[0], 1]] as [number, number][]) {
			const p = frameInv(f, u, dp)
			expect(frameU(f, p)).toBeCloseTo(u, 6); expect(frameDepth(f, p)).toBeCloseTo(dp, 6)
		}
		for (const p of PTS) { const q = frameInv(f, frameU(f, p), frameDepth(f, p)); expect(q[0]).toBeCloseTo(p[0], 6); expect(q[1]).toBeCloseTo(p[1], 6) }
	})
	it('along / setU / engine coords stay consistent', () => {
		for (const p of PTS) {
			expect(alongToU(f, frameAlong(f, p))).toBeCloseTo(frameU(f, p), 6)
			expect(uToAlong(f, alongToU(f, 777))).toBeCloseTo(777, 9)
			const s = frameSetU(f, p, 4321)
			expect(frameU(f, s)).toBeCloseTo(4321, 6); expect(frameDepth(f, s)).toBeCloseTo(frameDepth(f, p), 6)   // slid along t, same depth
			expect(dotT(f, p[0], p[1]) + frameShift(f)).toBeCloseTo(frameU(f, p), 6)
			expect(dotN(f, p[0], p[1]) - dotN(f, o[0], o[1])).toBeCloseTo(frameDepth(f, p), 6)
		}
	})
	it('multiples of 90° come out exactly axis-aligned (90° = front, 0° = right, 180° = left, 270° = rear)', () => {
		const c: Pt = [PLAN_CX, PLAN_CY]
		expect(frameAt(c, 90)).toEqual(frameOf('front'))
		expect(frameAt(c, 0)).toEqual(frameOf('right'))    // t = (0, −1): up the sheet, seen from the right
		expect(frameAt(c, 180)).toEqual(frameOf('left'))   // t = (0, +1): down the sheet, seen from the left
		expect(frameAt(c, 270)).toEqual(frameOf('rear'))
	})
})
