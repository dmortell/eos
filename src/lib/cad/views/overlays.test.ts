// The work plane's grip (views/overlays.ts): where it sits, and what dragging it sets.
import { describe, it, expect } from 'vitest'
import { workPlaneGrip, workPlaneAt } from './overlays'
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
