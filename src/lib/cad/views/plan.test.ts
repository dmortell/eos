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

describe('rack doors on the plan', async () => {
	const { rackDoorPrims } = await import('./plan')
	const p = (x: number, y: number) => ({ x, y })   // not rotated, at 0,0
	const rack = (doors: object) => ({ type: 'rack', id: 'R', levelId: 'L', spaceId: 'S', order: 1, name: 'R', kind: 'cabinet', heightU: 42, widthMm: 600, depthMm: 1000, at: { x: 0, y: 0 }, doors }) as never
	it('a single front door hinged left (as seen facing the front) opens outward to +y; split = two leaves', () => {
		const [leaf, arc] = rackDoorPrims(rack({ front: 'single' }), p, 300, 500)
		expect(leaf.k === 'line' && leaf.pts).toEqual([{ x: -300, y: 500 }, { x: -300, y: 1100 }])
		expect(arc.k === 'line' && arc.pts.at(-1)!.x).toBeCloseTo(300)   // swings back to the closed position across the face
		expect(rackDoorPrims(rack({ front: 'split' }), p, 300, 500)).toHaveLength(4)
		const [rear] = rackDoorPrims(rack({ rear: 'single' }), p, 300, 500)
		expect(rear.k === 'line' && rear.pts).toEqual([{ x: 300, y: -500 }, { x: 300, y: -1100 }])   // the rear's left is +x
		expect(rackDoorPrims(rack({}), p, 300, 500)).toEqual([])
	})
})

describe('labels that collide (UX review L3)', () => {
	it('a riser / run label moves down clear of the labels already there; rack and outlet labels stay', async () => {
		const { declutter } = await import('./plan')
		const t = (text: string, x: number, y: number, cls: string) => ({ k: 'text' as const, at: { x, y }, text, size: 100, cls })
		const out = declutter([t('R311', 0, 0, 'label'), t('+2105', 0, 0, 'riser-label'), t('+2600', 0, 0, 'riser-label'), t('TR1', 0, 0, 'label run-label')])
		const ys = out.map((p) => (p.k === 'text' ? p.at.y : 0))
		expect(ys[0]).toBe(0)                       // the rack's label stays
		expect(new Set(ys).size).toBe(4)            // the others each moved to their own line
		expect(Math.min(...ys.slice(1))).toBeGreaterThan(0)
	})
})
