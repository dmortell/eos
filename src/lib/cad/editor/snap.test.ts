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
})
