// The work plane's grip (views/overlays.ts): where it sits, and what dragging it sets.
import { describe, it, expect } from 'vitest'
import { workPlaneGrip, workPlaneAt, outletPortCells, allRoutesOf } from './overlays'
import type { Route } from '../domain/routing'
import type { Entity } from '../domain/drawing'
import { rackRowDisplayList } from './rackRow'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { spaceOf } from './space'
import type { Prim } from './display'

const box: Prim[] = [{ k: 'line', pts: [{ x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 6000 }, { x: 0, y: 6000 }], closed: true, cls: 'shape' }]
const front = { kind: 'elevation', dir: 'front' } as const, plan = { kind: 'plan' } as const

describe('the work plane grip', () => {
	it('in the plan: on the front elevation’s depth line, where the drawing starts along it; dragging it sets the depth', () => {
		const g = workPlaneGrip(plan, front, box, 2000, 0)!
		expect(g.what).toBe('depth')
		expect(workPlaneAt(plan, front, g.at)).toBeCloseTo(2000)   // the grip is ON the line
		// along the view direction it starts at one end of the drawing
		const f = spaceOf(front).frame!, along = (p: { x: number; y: number }) => p.x * f.t.x + p.y * f.t.y
		expect(along(g.at)).toBeCloseTo(Math.min(along({ x: 0, y: 0 }), along({ x: 10000, y: 0 })))
		// moved 500 mm along the view's normal → 500 more
		expect(workPlaneAt(plan, front, { x: g.at.x + f.n.x * 500, y: g.at.y + f.n.y * 500 })).toBeCloseTo(2500)
	})
	it('in the elevation: at the left end of the plan’s Z line; dragging it up sets Z', () => {
		const g = workPlaneGrip(front, plan, box, 0, 1200)!
		expect(g).toEqual({ at: { x: 0, y: -1200 }, what: 'z' })
		expect(workPlaneAt(front, plan, { x: 300, y: -2900 })).toBe(2900)
	})
	it('no grip without a line (two elevations, an empty view)', () => {
		expect(workPlaneGrip(front, { kind: 'elevation', dir: 'left' }, box, 0, 0)).toBeNull()
		expect(workPlaneGrip(plan, front, [], 0, 0)).toBeNull()
	})
})

describe('the ports of outlets picked in the list', () => {
	it('selected outlets light up the panel ports they are linked to (rack view); other selections, nothing', () => {
		const ix = new ProjectIndex(demoProject()), prims = rackRowDisplayList(ix, { spaceId: 'SR-A', face: 'front' })
		const lit = (sel: string[]) => outletPortCells(ix, prims, sel).filter((p) => p.k === 'line').map((p) => p.cls)
		expect(lit(['O2'])).toEqual(['port-sel', 'port-sel'])   // O2's two ports: P1 3 and 4
		expect(lit(['O1', 'O2'])).toHaveLength(4)
		expect(lit(['P1'])).toEqual([])
	})
})

describe('all routes (the plan’s Routes toggle)', () => {
	it('every routed cable’s run segments, colored by its server room, each segment once per room', () => {
		const ix = new ProjectIndex(demoProject())
		// two cables (to the same room) along the run T1's first segment
		const t1 = ix.get('T1') as Extract<Entity, { type: 'shape' }>, seg = t1.geom.kind === 'path' ? t1.geom.segs[0].id : ''
		const routes = new Map(['K1', 'K2'].map((id) => [id, { linkId: id, segs: [{ shape: 'T1', seg }] } as unknown as Route]))
		const { prims, rooms } = allRoutesOf(ix, routes, 'L33')
		expect(rooms.map((r) => r.name)).toEqual(['IDF-A'])
		expect(prims).toHaveLength(1)                                     // one segment, one room: drawn once
		expect(prims.every((p) => p.k === 'line' && p.cls === 'all-route' && p.color === rooms[0].color)).toBe(true)
		const keys = prims.map((p) => JSON.stringify((p as { pts: unknown }).pts))
		expect(new Set(keys).size).toBe(keys.length)                       // no segment twice for one room
		expect(allRoutesOf(ix, routes, 'nowhere').prims).toEqual([])
	})
})
