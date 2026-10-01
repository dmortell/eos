// Phase 6 (elevation-section-plan.md): hidden lines in elevations / sections — a box behind a wall is hidden, except
// through the wall's opening; seams between a wall's panels don't draw; an oblique (30°) view too.
import { describe, it, expect } from 'vitest'
import { hiddenLines, type HLSeg } from './hiddenLines'
import { openingCuts } from './projection'
import { frameOf, frameAt, dotT, dotN, PLAN_CX, PLAN_CY } from '../ui/geometry'
import type { Obj } from './types'
type Prism = Extract<Obj, { type: 'prism' }>
type Wall = Extract<Obj, { type: 'wall' }>

const box = (over: Partial<Prism> = {}): Prism => ({ type: 'prism', id: 'b', x: 1000, y: 1000, z: 0, w: 600, d: 400, h: 1200, edges: 4, ...over })
const wall: Wall = { type: 'wall', id: 'w', h: 2700, thickness: 100, nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 4000, y: 0, z: 0 }], segments: [{ id: 'ab', a: 'a', b: 'b' }] }
const door = box({ id: 'd', x: 900, y: -100, w: 1000, d: 200, z: 0, h: 2100, open: 'door' })
const cuts = openingCuts([door], () => true)
const len = (ss: HLSeg[]) => ss.reduce((t, s) => t + Math.hypot(s[2] - s[0], s[3] - s[1]), 0)
const front = frameOf('front')   // u = x, v = z, n = +y; the viewer looks along −n (from the bottom of the sheet): larger y = nearer

describe('hiddenLines — front view', () => {
	it('a lone box draws its outline once (the back edges sit behind the front face)', () => {
		const [r] = hiddenLines([box()], front)
		expect(len(r.segs)).toBeCloseTo(2 * 600 + 2 * 1200, 6)
		expect(r.segs).toHaveLength(4)
		expect(r.fills.length).toBeGreaterThan(0)
	})
	it('a wall with a door: its outline + the hole (jambs, head) — no seams between its panels', () => {
		const [r] = hiddenLines([wall], front, cuts)
		// bottom (0..900, 1900..4000), top 0..4000, the two ends, the two jambs to 2100, the head 900..1900
		expect(len(r.segs)).toBeCloseTo(3000 + 4000 + 2 * 2700 + 2 * 2100 + 1000, 6)
		const top = r.segs.filter((s) => s[1] === 2700 && s[3] === 2700)
		expect(top).toHaveLength(1); expect(Math.abs(top[0][2] - top[0][0])).toBeCloseTo(4000, 6)   // one line across the jambs + head
	})
	it('every view looks along −n: the front view’s viewer is at the BOTTOM of the sheet (larger y = nearer); the rear’s at the top', () => {
		// front: n = +y, looking −y (up the sheet) — the box at y = 1000 is in FRONT of the wall (y = 0), the one at y = −1000 behind it
		expect(len(hiddenLines([wall, box()], front)[1].segs)).toBeCloseTo(3600, 6)
		expect(hiddenLines([wall, box({ y: -1000 })], front)[1].segs).toHaveLength(0)
		// rear: n = −y, looking +y (down the sheet) — the other way round
		const rear = frameOf('rear')
		expect(hiddenLines([wall, box()], rear)[1].segs).toHaveLength(0)
		expect(len(hiddenLines([wall, box({ y: -1000 })], rear)[1].segs)).toBeCloseTo(3600, 6)
		// right (n = +x, seen from the right) / left (n = −x, seen from the left): a box at larger x is nearer the right view
		const xw: Wall = { ...wall, nodes: [{ id: 'a', x: 0, y: -2000, z: 0 }, { id: 'b', x: 0, y: 2000, z: 0 }] }   // a wall along y at x = 0
		const east = box({ x: 1000, y: -200 }), west = box({ x: -1600, y: -200 })
		expect(len(hiddenLines([xw, east], frameOf('right'))[1].segs)).toBeCloseTo(2 * 400 + 2 * 1200, 6)
		expect(hiddenLines([xw, west], frameOf('right'))[1].segs).toHaveLength(0)
		expect(hiddenLines([xw, east], frameOf('left'))[1].segs).toHaveLength(0)
		expect(len(hiddenLines([xw, west], frameOf('left'))[1].segs)).toBeCloseTo(2 * 400 + 2 * 1200, 6)
	})
	it('a box BEHIND the wall (smaller y, away from the viewer at the bottom of the sheet) is hidden', () => {
		const [, b] = hiddenLines([wall, box({ y: -1000 })], front)
		expect(b.segs).toHaveLength(0)
		const [, b2] = hiddenLines([wall, box()], front)   // y 1000..1400 — in FRONT of it: all there
		expect(len(b2.segs)).toBeCloseTo(3600, 6)
	})
	it('…but seen through the door (the part behind the jamb stays hidden)', () => {
		const [, b] = hiddenLines([wall, box({ y: -1000 })], front, cuts)   // x 1000..1600 inside the 900..1900 hole, below its 2100 head
		expect(len(b.segs)).toBeCloseTo(3600, 6)
		const [, p] = hiddenLines([wall, box({ y: -1000, x: 500, w: 1100 })], front, cuts)   // x 500..1600: 500..900 behind the jamb
		expect(Math.abs(len(p.segs) - (700 + 700 + 1200))).toBeLessThan(2)   // bottom + top from 900 (± the ½ mm outline tolerance), the right side; the left side hidden
		const [, t] = hiddenLines([wall, box({ y: -1000, h: 2500 })], front, cuts)   // taller than the door: its top behind the head
		expect(Math.abs(len(t.segs) - (600 + 2 * 2100))).toBeLessThan(2)
	})
})

describe('hiddenLines — an oblique (30°) view', () => {
	const f = frameAt([PLAN_CX, PLAN_CY], 30)   // t = (½, −√3/2), n = (√3/2, ½); the viewer looks along −n
	it('a box: its drawn outline + the NEAR vertical corner (the LARGEST x·n — two faces seen)', () => {
		const b = box(), [r] = hiddenLines([b], f)
		const cs: [number, number][] = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.d], [b.x, b.y + b.d]]
		const us = cs.map(([x, y]) => dotT(f, x, y)), W = Math.max(...us) - Math.min(...us)
		expect(W).toBeCloseTo(600 * 0.5 + 400 * Math.cos(Math.PI / 6), 9)
		expect(len(r.segs)).toBeCloseTo(2 * W + 3 * 1200, 3)
		const near = cs.reduce((a, c) => (dotN(f, c[0], c[1]) > dotN(f, a[0], a[1]) ? c : a)), un = dotT(f, near[0], near[1])
		const far = cs.reduce((a, c) => (dotN(f, c[0], c[1]) < dotN(f, a[0], a[1]) ? c : a)), uf = dotT(f, far[0], far[1])
		const vert = (u: number) => r.segs.some((s) => Math.abs(s[0] - u) < 1e-6 && Math.abs(s[2] - u) < 1e-6 && Math.abs(Math.abs(s[3] - s[1]) - 1200) < 1e-6)
		expect(vert(un)).toBe(true)
		expect(vert(uf)).toBe(false)   // the far corner sits behind the box
	})
	it('a box behind a wall is hidden — except through its opening', () => {
		// looking 30° off the wall's normal from its +y side: a box straight behind the door
		const g = frameAt([PLAN_CX, PLAN_CY], 60)   // n = (½, √3/2), looking along −n: −y is away from the viewer
		const b = box({ x: 1200, y: -600, w: 300, d: 300, h: 1000 })
		expect(hiddenLines([wall, b], g)[1].segs).toHaveLength(0)
		const seen = len(hiddenLines([wall, b], g, cuts)[1].segs)
		expect(seen).toBeGreaterThan(0)
		expect(seen).toBeLessThanOrEqual(len(hiddenLines([b], g)[0].segs) + 1e-6)   // never more than the box alone
	})
})
