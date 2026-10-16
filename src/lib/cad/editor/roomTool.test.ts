// The Room tool (W30): an outline closed into a named Space — an EPS when a riser stands inside — and the plan draws it.
import { describe, it, expect } from 'vitest'
import { EntityStore } from '../store/store'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { RoomTool, riserInside, serverRoomInside } from './roomTool'
import { spaceOf, PLAN } from '../views/space'
import { planDisplayList } from '../views/plan'
import { defaultLayer } from '../domain/layers'
import type { ToolCtx } from './tools'
import type { Entity } from '../domain/drawing'
import type { Space } from '../domain/types'
import type { Shape } from '../domain/shapes'

const L34 = { type: 'level', id: 'L34', buildingId: 'B', number: 34, name: '34F', order: 34, elevationMm: 136000 } as Entity
const riser = { type: 'shape', id: 'RS', levelId: 'L33', role: { kind: 'containment', form: 'trunk', tier: 'high' }, section: { w: 100, h: 50 },
	geom: { kind: 'path', nodes: [{ id: 'n0', x: 500, y: 500, z: 2900 }, { id: 'n1', x: 500, y: 500, z: 0, levelId: 'L34' }], segs: [{ id: 's0', a: 'n0', b: 'n1' }] } } as Shape

function harness(extra: Entity[] = []) {
	const store = new EntityStore()
	store.load([...demoProject(), L34, ...extra])
	let sel: string[] = []
	let asked: ((t: string) => void) | null = null, label = ''
	const ctx = (): ToolCtx => ({
		store, index: new ProjectIndex(store.all()), levelId: 'L33', opts: { z: 0, w: 100, h: 50 }, space: spaceOf(PLAN), work: { z: 0, depth: 0 },
		prims: () => [], tol: () => 10, snap: (p) => ({ p, kind: 'grid' }), selection: sel, select: (ids) => { sel = ids }, setMarquee: () => {}, ask: () => {},
		askText: (l, _v, apply) => { label = l; asked = apply },
	})
	return { store, ctx, sel: () => sel, answer: (t: string) => asked?.(t), label: () => label }
}
const at = (x: number, y: number) => ({ p: { x, y }, shift: false, ctrl: false, alt: false })
const key = (k: string) => ({ key: k }) as KeyboardEvent

describe('the Room tool', () => {
	it('corners, then a click on the first one closes it; the name asked is used; nothing written before it', () => {
		const h = harness(), t = new RoomTool()
		for (const [x, y] of [[0, 0], [3000, 0], [3000, 2000], [2, 3]]) t.down(at(x, y), h.ctx())
		expect(h.store.ofType('space').filter((s) => s.boundary)).toHaveLength(0)
		expect(h.label()).toBe('Room name')
		h.answer('Meeting 1')
		const r = h.store.get(h.sel()[0]) as Space
		expect(r).toMatchObject({ type: 'space', kind: 'room', name: 'Meeting 1', levelId: 'L33', boundary: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 2000 }] })
		expect(defaultLayer(r)).toBe('sys:rooms')
	})
	it('round a riser it is an EPS, named on ("EPS 1"); Enter closes; an empty name keeps the default', () => {
		const h = harness([riser]), t = new RoomTool()
		for (const [x, y] of [[0, 0], [1000, 0], [1000, 1000], [0, 1000]]) t.down(at(x, y), h.ctx())
		t.key(key('Enter'), h.ctx())
		expect(h.label()).toMatch(/EPS name/)
		h.answer('  ')
		expect(h.store.get(h.sel()[0])).toMatchObject({ kind: 'eps', name: 'EPS 1' })
	})
	it('a riser counts only on its own floors and inside the outline', () => {
		const sq = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }]
		expect(riserInside([riser], 'L33', sq)).toBe(true)
		expect(riserInside([riser], 'L34', sq)).toBe(true)
		expect(riserInside([riser], 'L35', sq)).toBe(false)
		expect(riserInside([riser], 'L33', sq.map((p) => ({ x: p.x + 2000, y: p.y })))).toBe(false)
	})
	it('the plan draws a room: a dashed outline and its name, picked as the room', () => {
		const room: Space = { type: 'space', id: 'RM', levelId: 'L33', kind: 'eps', name: 'EPS 3', order: 9, boundary: [{ x: 0, y: 0 }, { x: 900, y: 0 }, { x: 900, y: 600 }] }
		const ps = planDisplayList(new ProjectIndex([...demoProject(), room]), 'L33', { scale: 100 }).filter((p) => p.src === 'RM')
		expect(ps.map((p) => p.k)).toEqual(['line', 'text'])
		expect(ps[0]).toMatchObject({ closed: true, dash: 'dashed' })
		expect(ps[1]).toMatchObject({ text: 'EPS 3', at: { x: 600, y: 200 } })
	})
})

describe('a room drawn round a server room’s racks (R7-28)', () => {
	it('is offered as that server room’s outline when it has none', () => {
		const sr = { type: 'space', id: 'SRX', levelId: 'L33', kind: 'server room', name: 'IDF 9', order: 9 } as Entity
		const rack = (id: string, x: number) => ({ type: 'rack', id, levelId: 'L33', spaceId: 'SRX', name: id, at: { x, y: 90000 }, widthMm: 600, depthMm: 1000, heightU: 42 }) as unknown as Entity
		const ix = new ProjectIndex([...demoProject(), sr, rack('RX1', 90000), rack('RX2', 90600)])
		const poly = [{ x: 89000, y: 89000 }, { x: 92000, y: 89000 }, { x: 92000, y: 91000 }, { x: 89000, y: 91000 }]
		expect(serverRoomInside({ index: ix, levelId: 'L33' }, poly)?.id).toBe('SRX')
		expect(serverRoomInside({ index: ix, levelId: 'L33' }, poly.map((p) => ({ x: p.x + 1e6, y: p.y })))).toBeUndefined()   // racks outside
		const outlined = new ProjectIndex([...demoProject(), { ...sr, boundary: poly } as Entity, rack('RX1', 90000)])
		expect(serverRoomInside({ index: outlined, levelId: 'L33' }, poly)).toBeUndefined()                                 // it has one already
	})
})
