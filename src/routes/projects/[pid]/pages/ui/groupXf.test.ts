import { describe, it, expect } from 'vitest'
import { barycentre, groupBox, rotateAbout, scaleAbout, cornerScale, mirrorAbout, reflectPt } from './groupXf'
import { dimGeom, dimSetMode, type Ent, type Pt } from './geometry'
import { rotatePt } from './hit'

const box = (e: Ent): [number, number, number, number] => {
	const ps = e.pts ?? [e.a!, e.b ?? e.a!], xs = ps.map((p) => p[0]), ys = ps.map((p) => p[1])
	return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}
const ctr = (e: Ent): Pt => { const b = box(e); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] }
const r = (p?: Pt) => p?.map((v) => Math.round(v * 1000) / 1000)

describe('group transform (D13)', () => {
	const rect: Ent = { id: 'r', type: 'rect', a: [0, 0], b: [20, 10] }
	const line: Ent = { id: 'l', type: 'polyline', pts: [[100, 0], [120, 0]] }
	it('pivots on the mean of the shape centres; the box wraps rotated shapes', () => {
		expect(barycentre([rect, line], ctr)).toEqual([60, 2.5])
		expect(groupBox([{ ...rect, rot: 90 }], box)).toEqual([5, -5, 15, 15])
	})
	it('rotates a line by its points, other shapes by moving their centre and adding rot', () => {
		const c: Pt = [0, 0]
		expect(rotateAbout(line, c, 90, ctr(line)).pts!.map(r)).toEqual([[0, 100], [0, 120]])
		const rr = rotateAbout(rect, c, 90, ctr(rect))
		expect(rr.rot).toBe(90)
		expect(r(ctr(rr))).toEqual([-5, 10])   // the centre (10,5) turned 90° about the origin
		expect(rotateAbout({ ...rect, rot: 270 }, c, 90, ctr(rect)).rot).toBeUndefined()   // back to 0
	})
	it('scales points, text size and block scale about the pivot', () => {
		expect(scaleAbout(rect, [0, 0], 2)).toMatchObject({ a: [0, 0], b: [40, 20] })
		expect(scaleAbout({ id: 't', type: 'text', a: [10, 10], fontPt: 8 }, [0, 0], 1.5)).toMatchObject({ a: [15, 15], fontPt: 12 })
		expect(scaleAbout({ id: 'i', type: 'insert', block: 'x', a: [10, 0] }, [0, 0], 0.5)).toMatchObject({ a: [5, 0], scale: 0.5 })
		expect(cornerScale([0, 0], [10, 10], [20, 20])).toBe(2)
		expect(cornerScale([0, 0], [10, 10], [-5, -5])).toBe(0.02)
	})
	it('MIRROR: points reflect; a rect lands on its reflected centre with a mirrored rotation; a block flips', () => {
		const V: [Pt, Pt] = [[50, 0], [50, 10]]   // the vertical line x = 50
		expect(mirrorAbout(line, ...V, ctr).pts).toEqual([[0, 0], [-20, 0]])
		const m = mirrorAbout({ ...rect, rot: 30 }, ...V, ctr)
		expect(ctr(m)).toEqual([90, 5]); expect(m.rot).toBe(150)   // 2·90 − 30
		const b = mirrorAbout({ id: 'i', type: 'insert', block: 'x', a: [10, 0] }, ...V, ctr)
		expect(b.mirror).toBe(true); expect(r(b.a)).toEqual([90, 0]); expect(b.rot).toBeUndefined()   // 2·90 − 0 + 180 = 360 → 0
		expect(reflectPt([0, 5], [0, 0], [10, 10])).toEqual([5, 0])
	})
})

describe('dimensions under rotate / mirror / scale', () => {
	const h: Ent = { id: 'd', type: 'dim', a: [0, 0], b: [300, 100], dimMode: 'h', dimExt: 50, dimTextOff: 3 }
	it('a quarter turn keeps a linear dim linear (H ↔ V), measuring the same points; another angle makes it ROTATED, same figure', () => {
		const q = rotateAbout(h, [0, 0], 90, ctr(h))
		expect(q.dimMode).toBe('v'); expect(r(q.a)).toEqual([0, 0]); expect(r(q.b)).toEqual([-100, 300])
		expect(dimGeom(q).len).toBeCloseTo(300)
		expect(rotateAbout(h, [0, 0], 180, ctr(h)).dimMode).toBe('h')
		const t = rotateAbout(h, [0, 0], 30, ctr(h))
		expect(t.dimMode).toBe('r'); expect(t.dimAng).toBeCloseTo(30); expect(dimGeom(t).len).toBeCloseTo(300)   // still measures the (turned) Δx
		const g0 = dimGeom(h), g1 = dimGeom(t)   // the whole dim turned: its dim line too, at the same offset
		expect(r(g1.A)).toEqual(r(rotatePt(g0.A, [0, 0], 30))); expect(r(g1.B)).toEqual(r(rotatePt(g0.B, [0, 0], 30)))
		const back = rotateAbout(t, [0, 0], -30, ctr(t))   // and turned back: H again
		expect(back.dimMode).toBe('h'); expect(back.dimAng).toBeUndefined()
	})
	it('a mirror keeps the text / measured points on the mirrored side (aligned too) and a linear dim linear', () => {
		const m = mirrorAbout(h, [0, 500], [10, 500], ctr)   // across a horizontal line
		expect(m.dimMode).toBe('h'); expect(m.dimExt).toBe(-50); expect(m.dimTextOff).toBe(-3)
		const g0 = dimGeom(h), g1 = dimGeom(m)
		expect(r(g1.A)).toEqual(r(reflectPt(g0.A, [0, 500], [10, 500])))   // the dim line reflects with the points
		const al: Ent = { id: 'a', type: 'dim', a: [0, 0], b: [1000, 0], dimExt: 200 }
		const ma = mirrorAbout(al, [0, 500], [10, 500], ctr)
		expect(r(dimGeom(ma).M1)).toEqual(r(reflectPt(dimGeom(al).M1, [0, 500], [10, 500])))
		expect(mirrorAbout(h, [0, 0], [10, 10], ctr).dimMode).toBe('v')   // across 45°: H ↔ V
		const m30 = mirrorAbout(h, [0, 0], [Math.cos(Math.PI / 12), Math.sin(Math.PI / 12)], ctr)   // across 15°: rotated to 30°
		expect(m30.dimMode).toBe('r'); expect(m30.dimAng).toBeCloseTo(30); expect(dimGeom(m30).len).toBeCloseTo(300)
	})
	it('ROTATED mode from Properties: along a set angle, keeping the measured points', () => {
		const al: Ent = { id: 'a', type: 'dim', a: [0, 0], b: [1000, 1000] }
		const rr = dimSetMode(al, 'r', 0)   // 0° is horizontal → stored as H
		expect(rr.dimMode).toBe('h'); expect(dimGeom(rr).len).toBeCloseTo(1000)
		const r45 = dimSetMode(al, 'r', 45)
		expect(r45.dimMode).toBe('r'); expect(dimGeom(r45).len).toBeCloseTo(Math.hypot(1000, 1000))
		expect(r(dimGeom(r45).M1)).toEqual([0, 0]); expect(r(dimGeom(r45).M2)).toEqual([1000, 1000])
	})
	it('scale: dimExt scales with the points, the paper-mm text offset stays', () => {
		const s = scaleAbout(h, [0, 0], 2)
		expect(s.dimExt).toBe(100); expect(s.dimTextOff).toBe(3)
	})
})
