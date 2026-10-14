// Object snaps on a plan.
import { describe, it, expect } from 'vitest'
import { snapAt } from './snap'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import type { Shape } from '../domain/shapes'

describe('object snaps', () => {
	it('a box’s corners and the middles of its edges (Dave 2026-10-14), turned ones too', () => {
		const top = { type: 'shape', id: 'TOP', levelId: 'L33', geom: { kind: 'rect', centre: { x: 20000, y: 20000 }, size: { x: 1200, y: 600 } }, extent: 50 } as Shape
		const ix = new ProjectIndex([...demoProject(), top])
		expect(snapAt(ix, 'L33', { x: 19403, y: 19704 }, 20)).toMatchObject({ p: { x: 19400, y: 19700 }, kind: 'node' })
		expect(snapAt(ix, 'L33', { x: 20004, y: 20296 }, 20)).toMatchObject({ p: { x: 20000, y: 20300 }, kind: 'mid' })
		const turned = new ProjectIndex([...demoProject(), { ...top, geom: { ...top.geom, rot: 90 } } as Shape])
		const c = snapAt(turned, 'L33', { x: 20302, y: 19402 }, 20)
		expect(c.kind).toBe('node')
		expect({ x: Math.round(c.p.x), y: Math.round(c.p.y) }).toEqual({ x: 20300, y: 19400 })
	})

	it('a riser drawn from another floor snaps where it lands on this floor, and only there', () => {
		const riser = {
			type: 'shape', id: 'RS', levelId: 'L34',
			geom: { kind: 'path', nodes: [{ id: 'a', x: 4170, y: -8120, z: 2950 }, { id: 'b', x: 4170, y: -8120, z: 0, levelId: 'L33' }], segs: [{ id: 's', a: 'a', b: 'b' }] },
		} as unknown as Shape
		const ix = new ProjectIndex([...demoProject(), riser])
		expect(snapAt(ix, 'L33', { x: 4130, y: -8080 }, 100)).toMatchObject({ p: { x: 4170, y: -8120 }, kind: 'node' })
		expect(snapAt(ix, 'L32', { x: 4130, y: -8080 }, 100).kind).toBe('grid')
		expect(snapAt(ix, 'L33', { x: 4130, y: -8080 }, 100, { skip: 'RS' }).kind).toBe('grid')
	})
})
