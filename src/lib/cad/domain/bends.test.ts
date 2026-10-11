// Bends (backlog "Bend radius"): a run's corners as arcs, the radius fitted, segments trimmed to the tangent points.
import { describe, it, expect } from 'vitest'
import { corners, trimmedEnds } from './bends'
import { makeRun } from './make'
import { bendHandles } from '../editor/handles'
import type { Shape, PathNode } from './shapes'

const L = (bendRadius?: number) => {
	const s = makeRun('L', [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 2000 }], { w: 25, h: 25, round: true }, { tier: 'low', form: 'conduit' })
	return { ...s, role: { ...(s.role as Extract<Shape['role'], { kind: 'containment' }>), ...(bendRadius ? { bendRadius } : {}) } } as Shape
}
const nodes = (s: Shape) => (s.geom.kind === 'path' ? s.geom.nodes : [])
const near = (p: { x: number; y: number }, x: number, y: number) => Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01

describe('bends', () => {
	it('a right-angle corner with the run\'s radius: tangent points r back along each segment, a quarter arc between', () => {
		const s = L(300), b = corners(s).get(nodes(s)[1].id)!
		expect(b.r).toBe(300)
		expect(near(b.t1, 1700, 0) && near(b.t2, 2000, 300)).toBe(true)
		expect(near(b.arc[0], 1700, 0) && near(b.arc.at(-1)!, 2000, 300)).toBe(true)
		const mid = b.arc[Math.floor(b.arc.length / 2)]
		expect(Math.hypot(mid.x - 1700, mid.y - 300)).toBeCloseTo(300)   // on the circle about (1700, 300)
	})
	it('a node\'s own radius wins (0 = sharp); too big is cut to what fits (half the shorter segment)', () => {
		const s = L(300), [a, n, c] = nodes(s)
		const own = (r: number): Shape => ({ ...s, geom: { ...(s.geom as { kind: 'path'; nodes: PathNode[]; segs: never[] }), nodes: [a, { ...n, radius: r }, c] } } as Shape)
		expect(corners(own(0)).get(n.id)!.r).toBe(0)
		expect(corners(own(5000)).get(n.id)!.r).toBeCloseTo(1000)
		const plain = L()
		expect(corners(plain).get(nodes(plain)[1].id)!.r).toBe(0)   // no default: sharp
	})
	it('segments are drawn to the tangent points; the run\'s ends stay', () => {
		const s = L(300), bs = corners(s), [a, n, c] = nodes(s), g = s.geom.kind === 'path' ? s.geom.segs : []
		const s1 = g.find((x) => [x.a, x.b].includes(a.id))!, s2 = g.find((x) => [x.a, x.b].includes(c.id))!
		const e1 = trimmedEnds(bs, s1.id, s1.a === a.id ? a : n, s1.a === a.id ? n : a)
		expect(e1.some((p) => near(p, 0, 0)) && e1.some((p) => near(p, 1700, 0))).toBe(true)
		const e2 = trimmedEnds(bs, s2.id, s2.a === c.id ? c : n, s2.a === c.id ? n : c)
		expect(e2.some((p) => near(p, 2000, 2000)) && e2.some((p) => near(p, 2000, 300))).toBe(true)
	})
	it('the corner\'s round grip: dragged in along the bisector sets that node\'s radius (10 mm steps), the default drops it', () => {
		const s = L(300), [h] = bendHandles(s, 50), n = nodes(s)[1]
		// bisector of the corner at (2000, 0) points to (−1, +1)/√2; k − 1 = √2 − 1
		const at = (r: number) => { const d = r * (Math.SQRT2 - 1) + 50; return { x: 2000 - d / Math.SQRT2, y: d / Math.SQRT2 } }
		expect(near(h.at, at(300).x, at(300).y)).toBe(true)
		const moved = h.drag!(at(500), false) as Shape
		expect(nodes(moved)[1]).toMatchObject({ id: n.id, radius: 500 })
		expect(nodes(h.drag!(at(300), false) as Shape)[1].radius).toBeUndefined()   // = the run's: no own radius
		expect(nodes(h.drag!({ x: 2000, y: 0 }, false) as Shape)[1].radius).toBe(0)   // to the corner: sharp
		expect(nodes(h.drag!({ x: 0, y: 3000 }, false) as Shape)[1].radius).toBe(1000)   // far in: what fits (half a 2 m side)
	})
})
