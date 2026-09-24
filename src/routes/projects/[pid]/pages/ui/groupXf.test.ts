import { describe, it, expect } from 'vitest'
import { barycentre, groupBox, rotateAbout, scaleAbout, cornerScale } from './groupXf'
import type { Ent, Pt } from './geometry'

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
})
