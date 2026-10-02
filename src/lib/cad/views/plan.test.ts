// What the plan draws, and in what order (later = on top).
import { describe, it, expect } from 'vitest'
import { planDisplayList } from './plan'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import type { Entity } from '../domain/drawing'
import type { Shape } from '../domain/shapes'
import type { Rack } from '../domain/types'

describe('plan draw order', () => {
	it('a riser standing on a rack is drawn over the rack; a horizontal run goes under it', () => {
		const rack: Rack = { type: 'rack', id: 'RK', levelId: 'L33', spaceId: 'SR-A', order: 5, name: 'P3C', kind: 'cabinet', heightU: 45, widthMm: 700, depthMm: 584, at: { x: 0, y: 0 } }
		const riser: Shape = {
			type: 'shape', id: 'RS', levelId: 'L33', role: { kind: 'containment', form: 'trunk', tier: 'high' }, section: { w: 150, h: 150 },
			geom: { kind: 'path', nodes: [{ id: 'a', x: -275, y: 217, z: 2105 }, { id: 'b', x: -275, y: 217, z: 2600 }], segs: [{ id: 's', a: 'a', b: 'b' }] },
		}
		const run: Shape = {
			type: 'shape', id: 'RN', levelId: 'L33', role: { kind: 'containment', form: 'trunk', tier: 'low' }, section: { w: 300, h: 100 },
			geom: { kind: 'path', nodes: [{ id: 'c', x: 0, y: 0, z: -300 }, { id: 'd', x: 3000, y: 0, z: -300 }], segs: [{ id: 't', a: 'c', b: 'd' }] },
		}
		const high: Shape = { ...run, id: 'HI', role: { kind: 'containment', form: 'tray', tier: 'high' }, geom: { kind: 'path', nodes: [{ id: 'e', x: 0, y: 0, z: 2900 }, { id: 'f', x: 3000, y: 0, z: 2900 }], segs: [{ id: 'u', a: 'e', b: 'f' }] } }
		const prims = planDisplayList(new ProjectIndex([...demoProject(), rack, riser, run, high] as Entity[]), 'L33', { scale: 100 })
		const first = (src: string) => prims.findIndex((p) => p.src === src)
		expect(first('RS')).toBeGreaterThan(first('RK'))
		expect(first('RN')).toBeLessThan(first('RK'))     // under-floor run: under the rack
		expect(first('HI')).toBeGreaterThan(first('RK'))  // ceiling tray: over it
	})
})
