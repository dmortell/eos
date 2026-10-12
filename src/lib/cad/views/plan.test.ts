// What the plan draws, and in what order (later = on top).
import { describe, it, expect } from 'vitest'
import { planDisplayList, shapePrims, rackDoorPrims, declutter } from './plan'
import { parsePictureRef } from '../domain/issue'
import { regionGrips, dragRegionGrip } from '../editor/shapeGrips'
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

describe('rack doors on the plan', () => {
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
		const t = (text: string, x: number, y: number, cls: string) => ({ k: 'text' as const, at: { x, y }, text, size: 100, cls })
		const out = declutter([t('R311', 0, 0, 'label'), t('+2105', 0, 0, 'riser-label'), t('+2600', 0, 0, 'riser-label'), t('TR1', 0, 0, 'label run-label')])
		const ys = out.map((p) => (p.k === 'text' ? p.at.y : 0))
		expect(ys[0]).toBe(0)                       // the rack's label stays
		expect(new Set(ys).size).toBe(4)            // the others each moved to their own line
		expect(Math.min(...ys.slice(1))).toBeGreaterThan(0)
	})
})

describe('line end marks (Markup kinds part 2)', () => {
	it('an arrow at the first point, a tick or dot at the other loose ends, pointing out along the last segment; none on runs', () => {
		const nodes = [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 1000, y: 0, z: 0 }, { id: 'c', x: 1000, y: 500, z: 0 }]
		const line = { type: 'shape', id: 'L', levelId: 'L1', geom: { kind: 'path', nodes, segs: [{ id: 's0', a: 'a', b: 'b' }, { id: 's1', a: 'b', b: 'c' }] }, style: { ends: { a: 'arrow', b: 'dot' } } } as Shape
		const ps = shapePrims(line, 100)
		const head = ps.find((p) => p.k === 'line' && p.cls.includes('line-head')) as { pts: { x: number; y: number }[]; fill?: boolean }
		expect(head.pts[0]).toEqual({ x: 0, y: 0 })                              // the tip on the first point
		expect(head.pts[1].x).toBeCloseTo(300)                                   // 3 paper mm × 1:100 back along the line
		expect(ps.find((p) => p.k === 'circle')).toMatchObject({ c: { x: 1000, y: 500 }, r: 80, fill: true })
		const tick = shapePrims({ ...line, style: { ends: { b: 'tick' } } } as Shape, 100).filter((p) => p.k === 'line' && p.cls.includes('line-tick'))
		expect(tick).toHaveLength(1)
		expect(shapePrims({ ...line, role: { kind: 'containment', form: 'trunk', tier: 'low' }, section: { w: 100, h: 50 } } as Shape, 100).some((p) => 'cls' in p && p.cls.includes('line-'))).toBe(false)
	})
})

describe('images (Markup kinds part 4)', () => {
	it('a picture reference fitted in its box, and an unseen frame for clicks; resized by its grips like a box', () => {
		const img = { type: 'shape', id: 'I', sheetId: 'S', geom: { kind: 'image', fileId: 'plan.pdf', page: 2, centre: { x: 100, y: 50 }, size: { x: 80, y: 40 } } } as Shape
		const [pic, frame] = shapePrims(img, 1)
		expect(pic).toMatchObject({ k: 'image', url: 'picture:plan.pdf#2', x: 60, y: 30, w: 80, h: 40, fit: 'centre', src: 'I' })
		expect(frame).toMatchObject({ k: 'line', closed: true, fill: true, cls: 'image-frame', src: 'I' })
		expect(parsePictureRef('picture:plan.pdf#2')).toEqual({ fileId: 'plan.pdf', page: 2 })
		expect(regionGrips(img.geom)).toHaveLength(8)
		const g = dragRegionGrip(img, 2, { x: 160, y: 90 }, false).geom   // the bottom-right corner out: top-left stays
		expect(g).toMatchObject({ kind: 'image', centre: { x: 110, y: 60 }, size: { x: 100, y: 60 } })
	})
})

describe('runs as one outline (backlog "Trunk drawing style")', () => {
	const run = (id: string, pts: { x: number; y: number }[], extra: Partial<Shape> = {}): Shape => ({
		type: 'shape', id, levelId: 'L33', geom: { kind: 'path', nodes: pts.map((p, i) => ({ id: `${id}${i}`, ...p, z: -200 })), segs: pts.slice(1).map((_, i) => ({ id: `${id}s${i}`, a: `${id}${i}`, b: `${id}${i + 1}` })) },
		section: { w: 200, h: 50 }, role: { kind: 'containment', form: 'trunk', tier: 'low' }, ...extra,
	} as Shape)
	const bodies = (extra: Entity[]) => planDisplayList(new ProjectIndex([...demoProject(), ...extra]), 'L33', { scale: 100 }).filter((p) => p.k === 'line' && p.cls.startsWith('run-body'))
	it('two runs that meet join into one filled outline (on their layer, no source); their own bands only pick', () => {
		const a = run('A', [{ x: 0, y: 0 }, { x: 2000, y: 0 }]), b = run('B', [{ x: 2000, y: 0 }, { x: 2000, y: 2000 }])
		const bs = bodies([a, b]).filter((p) => p.k === 'line' && p.cls === 'run-body')   // (the fixture's own trunk is high)
		expect(bs).toHaveLength(1)
		expect(bs[0]).toMatchObject({ closed: true, fill: true, cls: 'run-body', layer: 'sys:cont-low' })
		expect(bs[0].src).toBeUndefined()
		const bands = planDisplayList(new ProjectIndex([...demoProject(), a, b]), 'L33', { scale: 100 }).filter((p) => p.src === 'A' && p.k === 'line')
		expect(bands.every((p) => p.k === 'line' && p.cls.includes('run-hit'))).toBe(true)
	})
	it('a high run: dashed (ceiling); a primary run: stronger; a run of another color: its own outline', () => {
		const hi = run('H', [{ x: 0, y: 5000 }, { x: 2000, y: 5000 }], { role: { kind: 'containment', form: 'trunk', tier: 'high', primary: true } } as Partial<Shape>)
		const red = run('R', [{ x: 2000, y: 0 }, { x: 4000, y: 0 }], { style: { stroke: '#ff0000' } } as Partial<Shape>)
		const cls = bodies([hi, run('A', [{ x: 0, y: 0 }, { x: 2000, y: 0 }]), red]).map((p) => (p.k === 'line' ? `${p.cls}${p.color ? ` ${p.color}` : ''}` : ''))
		expect(cls).toEqual(expect.arrayContaining(['run-body run-high run-ceiling run-primary', 'run-body', 'run-body #ff0000']))
	})
})
