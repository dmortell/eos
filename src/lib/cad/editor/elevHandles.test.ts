// Drag top / bottom edges in elevations (Dave, 2026-10-05).
import { describe, it, expect } from 'vitest'
import { elevationHandles, roomLineHandles } from './elevHandles'
import { rackRowDisplayList } from '../views/rackRow'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import type { Entity } from '../domain/drawing'
import type { Space } from '../domain/types'
import { moveBy } from './behaviours'
import { spaceOf } from '../views/space'
import type { Shape } from '../domain/shapes'

// a wall along x (seen side-on from the front), 2700 high, with a door 900 wide, 2100 high from the floor
const wall = {
	type: 'shape', id: 'W', levelId: 'L', section: { w: 100, h: 2700 },
	role: { kind: 'wall', openings: [{ id: 'D', segId: 's', at: 1000, width: 900, z: 0, h: 2100 }] },
	geom: { kind: 'path', nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 4000, y: 0, z: 0 }], segs: [{ id: 's', a: 'a', b: 'b' }] },
} as unknown as Shape
const sp = spaceOf({ kind: 'elevation', dir: 'front' })

describe('elevation handles', () => {
	const hs = elevationHandles(wall, sp)
	it('a wall seen side-on: its top and bottom, and each opening\'s top and sill', () => {
		expect(hs.map((h) => h.label)).toEqual(['Wall height', 'Wall base', 'Opening height', 'Opening sill'])
		expect(-hs[0].at.y).toBe(2700)
		expect(-hs[2].at.y).toBe(2100)
	})
	it('dragging the top sets the height (to 10 mm); the base moves the wall\'s Z, its top stays', () => {
		const up = hs[0].drag!({ x: 0, y: -3004 }, false) as Shape
		expect(up.section?.h).toBe(3000)
		const raised = hs[1].drag!({ x: 0, y: -300 }, false) as Shape
		expect(raised.geom.kind === 'path' && raised.geom.nodes.map((n) => n.z)).toEqual([300, 300])
		expect(raised.section?.h).toBe(2400)
	})
	it('an opening: top = its height, sill = its Z with the top kept', () => {
		const taller = hs[2].drag!({ x: 0, y: -2400 }, false) as Shape
		expect(taller.role?.kind === 'wall' && taller.role.openings[0]).toMatchObject({ z: 0, h: 2400 })
		const window = hs[3].drag!({ x: 0, y: -900 }, false) as Shape
		expect(window.role?.kind === 'wall' && window.role.openings[0]).toMatchObject({ z: 900, h: 1200 })
	})
	it('seen end-on (from the side): nothing to grab; in a plan: none', () => {
		expect(elevationHandles(wall, spaceOf({ kind: 'elevation', dir: 'left' }))).toEqual([])
		expect(elevationHandles(wall, spaceOf({ kind: 'plan' }))).toEqual([])
	})
})

describe('boxes in elevations (Dave, 2026-10-05: a box couldn\'t be moved up / down or resized there)', () => {
	const box = { type: 'shape', id: 'B', levelId: 'L', extent: 750, geom: { kind: 'rect', centre: { x: 1000, y: 500 }, size: { x: 1200, y: 600 } } } as unknown as Shape
	it('its top square sets the height, its bottom the Z (the top stays)', () => {
		const [top, base] = elevationHandles(box, sp)
		expect(-top.at.y).toBe(750)
		expect((top.drag!({ x: 0, y: -1104 }, false) as Shape).extent).toBe(1100)
		const raised = base.drag!({ x: 0, y: -300 }, false) as Shape
		expect(raised).toMatchObject({ extent: 450, plane: { kind: 'plan', z: 300 } })
	})
	it('dragged up in an elevation, a box at Z 0 (no plane yet) rises', () => {
		expect(moveBy(box, { x: 100, y: 0, z: 400 })).toMatchObject({ plane: { kind: 'plan', z: 400 }, geom: { centre: { x: 1100, y: 500 } } })
	})
})

describe('box width in elevations', () => {
	const box = { type: 'shape', id: 'B', levelId: 'L', extent: 750, geom: { kind: 'rect', centre: { x: 1000, y: 500 }, size: { x: 1200, y: 600 } } } as unknown as Shape
	it('its sides as seen: one moves, the other stays', () => {
		const hs = elevationHandles(box, sp).filter((h) => h.label === 'Box width')
		expect(hs).toHaveLength(2)
		const [lo, hi] = [...hs].sort((a, b) => a.at.x - b.at.x)
		const wider = hi.drag!({ x: hi.at.x + 300, y: 0 }, false) as Shape
		const narrower = lo.drag!({ x: lo.at.x + 200, y: 0 }, false) as Shape
		const span = (s: Shape) => { const g = s.geom as { centre: { x: number }; size: { x: number } }; return [g.centre.x - g.size.x / 2, g.centre.x + g.size.x / 2] }
		const [a0, a1] = span(box)
		expect(span(wider)).toEqual([a0, a1 + 300])
		expect(span(narrower)).toEqual([a0 + 200, a1])
	})
})

describe('rack views: the room’s floor and ceiling lines drag', () => {
	const roomView = (room: Entity) => {
		const ix = new ProjectIndex([...demoProject().filter((e) => e.id !== 'SR-A'), room])
		return roomLineHandles(rackRowDisplayList(ix, { spaceId: 'SR-A', face: 'front' }), room)
	}
	const base = new ProjectIndex(demoProject()).get('SR-A') as Space
	it('FFL is the floor until the room has its own; the level ceiling until it has its own; 10 mm steps', () => {
		const hs = roomView(base as Entity)
		expect(hs.map((h) => [h.label, h.at.y])).toEqual([[`${base.name}: room floor`, 0], [`${base.name}: room ceiling`, -2700]])
		expect(hs[0].drag!({ x: 0, y: -153 }, false)).toMatchObject({ floorMm: 150 })
		expect(hs[0].drag!({ x: 0, y: -153 }, false, true)).toMatchObject({ floorMm: 150 })
		expect(hs[0].drag!({ x: 0, y: -153 }, true)).toMatchObject({ floorMm: 153 })
		expect(hs[1].drag!({ x: 0, y: -2404 }, false)).toMatchObject({ ceilingMm: 2400 })
	})
	it('the room’s own floor line drags; back to FFL drops it; the ceiling stays 300 above the floor', () => {
		const own = { ...base, floorMm: 150, ceilingMm: 2400 } as Space
		const [floor, ceil] = roomView(own as Entity).sort((a, b) => b.at.y - a.at.y)
		expect(floor.at.y).toBe(-150)
		expect('floorMm' in (floor.drag!({ x: 0, y: 2 }, false) as Space)).toBe(false)
		expect(floor.drag!({ x: 0, y: -3000 }, false)).toMatchObject({ floorMm: 2100 })
		expect(ceil.drag!({ x: 0, y: -100 }, false)).toMatchObject({ ceilingMm: 450 })
	})
})

describe('a room wall (one path, four sides): its base grip (Dave 2026-10-15)', () => {
	const room = {
		type: 'shape', id: 'R', levelId: 'L', section: { w: 100, h: 3300 }, role: { kind: 'wall', openings: [] },
		geom: { kind: 'path', nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 4000, y: 0, z: 0 }, { id: 'c', x: 4000, y: -3000, z: 0 }, { id: 'd', x: 0, y: -3000, z: 0 }],
			segs: [{ id: 's1', a: 'a', b: 'b' }, { id: 's2', a: 'b', b: 'c' }, { id: 's3', a: 'c', b: 'd' }, { id: 's4', a: 'd', b: 'a' }] },
	} as unknown as Shape
	it('dragged down to the slab: every corner goes down, every side gets taller — no top moves', () => {
		const base = elevationHandles(room, sp).find((h) => h.label === 'Wall base')!
		const next = base.drag!({ x: 2000, y: 300 }, false) as Shape   // view y = −z: z −300
		expect(next.geom.kind === 'path' && next.geom.nodes.map((n) => n.z)).toEqual([-300, -300, -300, -300])
		expect(next.section?.h).toBe(3600)
		// each corner's top: −300 + 3600 = 3300, where it was
	})
})

describe('top / base grips snap to the datum lines (Dave 2026-10-15)', () => {
	const heights = { slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2600, plenumMm: 700 }
	const hs = elevationHandles(wall, sp, { heights, tol: 60 })
	const top = hs.find((h) => h.label === 'Wall height')!, base = hs.find((h) => h.label === 'Wall base')!
	it('the top lands on CLG / CSL when near; else 10 mm steps; Alt: free', () => {
		expect((top.drag!({ x: 0, y: -3270 }, false) as Shape).section?.h).toBe(3300)   // CSL 2600 + 700
		expect((top.drag!({ x: 0, y: -2640 }, false) as Shape).section?.h).toBe(2600)   // CLG
		expect((top.drag!({ x: 0, y: -2900 }, false) as Shape).section?.h).toBe(2900)
		expect((top.drag!({ x: 0, y: -3271 }, true) as Shape).section?.h).toBe(3271)
	})
	it('the base lands on FSL (the floor slab, −300)', () => {
		const next = base.drag!({ x: 0, y: 260 }, false) as Shape
		expect(next.geom.kind === 'path' && next.geom.nodes.map((n) => n.z)).toEqual([-300, -300])
	})
})
