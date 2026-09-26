import { describe, it, expect } from 'vitest'
import { boxPoints, connPoints, attachNode, followConnections, cptUV, uvAt, wallPoints, conduitEnds } from './connect'
import type { Obj } from './types'

const box = (extra: Partial<Obj> = {}) => ({ type: 'prism', id: 'rk', x: 0, y: 0, z: 0, w: 600, d: 1000, h: 2000, edges: 4, ...extra }) as Obj
const run = () => ({ type: 'conduit', id: 'c', w: 100, h: 50, edges: 4, nodes: [{ id: 'a', x: 305, y: -2, z: 2600 }, { id: 'b', x: 300, y: -3000, z: 2600 }], segments: [{ id: 's', a: 'a', b: 'b' }] }) as Extract<Obj, { type: 'conduit' }>

describe('connection points (F6)', () => {
	it('a box offers centre + edge midpoints (rotating with it), or its own points', () => {
		expect(boxPoints(box()).map((p) => [p.conn.pt, p.x, p.y])).toEqual([['c', 300, 500], ['n', 300, 0], ['e', 600, 500], ['s', 300, 1000], ['w', 0, 500]])
		expect(boxPoints(box({ cpts: [{ id: 'top', dx: 100, dy: 0 }], rot: 90 })).map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([[300, 600]])
		expect(boxPoints(box({ open: 'door' }))).toEqual([])
	})
	it('points are ratios of the footprint (they survive a resize); a click maps back to a ratio', () => {
		expect(boxPoints(box({ cpts: [{ id: 'q', u: 0.25, v: 1 }] })).map((p) => [p.x, p.y])).toEqual([[150, 1000]])
		expect(boxPoints(box({ w: 1200, cpts: [{ id: 'q', u: 0.25, v: 1 }] })).map((p) => [p.x, p.y])).toEqual([[300, 1000]])
		expect(cptUV({ id: 'old', dx: 150, dy: -500 }, 600, 1000)).toEqual([0.75, 0])
		const pb = (extra: Partial<Obj> = {}) => box(extra) as Extract<Obj, { type: 'prism' }>
		expect(uvAt(pb(), 450, 250)).toEqual([0.75, 0.25])
		expect(uvAt(pb(), 9999, -50)).toEqual([1, 0])   // clamped onto the box
		const [u, v] = uvAt(pb({ rot: 90 }), 300 + 250, 500 + 150)   // rotation undone
		expect([u, v]).toEqual([0.75, 0.25])
	})
	it('a node snaps onto a nearby point (keeping its height) and follows the box when it moves', () => {
		const b = box(), c = run(), m = { objects: [b, c] as Obj[], shapes: [] }
		expect(attachNode(c.nodes[0], connPoints(m, 'c'), 20)).toBe(true)
		expect(c.nodes[0]).toMatchObject({ x: 300, y: 0, z: 2600, conn: { obj: 'rk', pt: 'n' } })
		;(b as { x: number }).x = 1000
		expect(followConnections(m)).toBe(1)
		expect(c.nodes[0]).toMatchObject({ x: 1300, y: 0 })
		expect(attachNode(c.nodes[1], connPoints(m, 'c'), 20)).toBe(false)   // nowhere near a point → stays free
	})
	it('an outlet is a point; a deleted box detaches its nodes', () => {
		const c = run(), m = { objects: [c] as Obj[], shapes: [{ id: 'o1', type: 'insert' as const, block: 'outlet-box', a: [300, -3010] as [number, number], attrs: { PORTS: '1' } }] }
		expect(attachNode(c.nodes[1], connPoints(m, 'c'), 20)).toBe(true)
		expect(c.nodes[1].conn).toEqual({ ent: 'o1' })
		const b = box(), m2 = { objects: [b, c] as Obj[], shapes: [] }
		attachNode(c.nodes[0], connPoints(m2, 'c'), 20)
		m2.objects.splice(0, 1)
		followConnections(m2)
		expect(c.nodes[0].conn).toBeUndefined()
	})
})

describe('stacked boxes (F6)', () => {
	it('a node attaches to the box at its own height', () => {
		const lo = box({ id: 'lo', z: 0, h: 3000 }), hi = box({ id: 'hi', z: 4000, h: 3000 }), c = run()
		c.nodes[0].z = 5000
		attachNode(c.nodes[0], connPoints({ objects: [lo, hi, c] as Obj[] }, 'c'), 20)
		expect(c.nodes[0].conn?.obj).toBe('hi')
		c.nodes[0].z = 2600
		attachNode(c.nodes[0], connPoints({ objects: [hi, lo, c] as Obj[] }, 'c'), 20)
		expect(c.nodes[0].conn?.obj).toBe('lo')
	})
})

describe('F6 more connection points', () => {
	it('a wall offers its nodes + segment midpoints; a conduit its free, unattached ends; self is left out', () => {
		const wall = { type: 'wall', id: 'w', h: 3000, thickness: 100, nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 1000, y: 0, z: 0 }], segments: [{ id: 's', a: 'a', b: 'b' }] } as Obj
		expect(wallPoints(wall).map((p) => [p.conn.pt, p.x])).toEqual([['a', 0], ['b', 1000], ['m:s', 500]])
		const run = { type: 'conduit', id: 'c', w: 50, h: 50, edges: 16, nodes: [{ id: 'p', x: 0, y: 0, z: 0 }, { id: 'q', x: 0, y: 500, z: 0 }, { id: 'r', x: 0, y: 900, z: 0, conn: { obj: 'w', pt: 'a' } }],
			segments: [{ id: 's1', a: 'p', b: 'q' }, { id: 's2', a: 'q', b: 'r' }] } as Obj
		expect(conduitEnds(run).map((p) => p.conn.pt)).toEqual(['p'])   // q is a corner, r is already attached
		const m = { objects: [wall, run] }
		expect(connPoints(m).some((p) => p.conn.obj === 'c')).toBe(true)
		expect(connPoints(m, 'c').some((p) => p.conn.obj === 'c')).toBe(false)
	})
})
