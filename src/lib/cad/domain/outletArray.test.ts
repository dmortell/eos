// Outlets per desk / array (W13): copies numbered on, ports following; outlets onto desks turned with each desk.
import { describe, it, expect } from 'vitest'
import { numberOn, arrayCopies, outletsOntoDesks } from './outletArray'
import { ProjectIndex } from './project'
import { demoProject } from './fixtures'
import type { Entity } from './drawing'
import type { Outlet } from './types'
import type { Shape } from './shapes'

const L34 = { type: 'level', id: 'L34', buildingId: 'B', number: 34, name: '34F', order: 34, elevationMm: 136000 } as Entity
const out = (id: string, label: string, at: { x: number; y: number }, usage = 'desk', rot?: number): Outlet => ({
	type: 'outlet', id, levelId: 'L34', label, tier: 'low', usage, mount: 'floor', at, ...(rot ? { rot } : {}),
	ports: [{ port: 1, label: `${label}.A`, cableType: 'cat6a' }, { port: 2, label: `${label}.B`, cableType: 'cat6a' }],
})
const desk = (id: string, at: { x: number; y: number }, rot?: number, blockId = 'DESK') =>
	({ type: 'shape', id, levelId: 'L34', geom: { kind: 'insert', blockId, at, ...(rot ? { rot } : {}) } }) as Shape
const ix = (extra: Entity[]) => new ProjectIndex([...demoProject(), L34, ...extra])
const outlets = (es: Entity[]) => es.filter((e): e is Outlet => e.type === 'outlet')

describe('numberOn', () => {
	it('each copy continues its usage’s series on the level; ports follow; labels already there are skipped', () => {
		const i = ix([out('A', '34-001', { x: 0, y: 0 }), out('B', '34-002', { x: 0, y: 0 }), out('C', '34-004', { x: 0, y: 0 }), out('W', 'AP 34-01', { x: 0, y: 0 }, 'ap')])
		const got = outlets(numberOn([{ ...out('n1', '34-001', { x: 0, y: 0 }) }, out('n2', 'AP 34-01', { x: 0, y: 0 }, 'ap'), out('n3', '34-002', { x: 0, y: 0 })], i))
		expect(got.map((o) => o.label)).toEqual(['34-005', 'AP 34-02', '34-006'])
		expect(got[0].ports.map((p) => p.label)).toEqual(['34-005.A', '34-005.B'])
	})
})

describe('arrayCopies', () => {
	it('n copies a step apart, numbered on in copy order', () => {
		const i = ix([out('A', '34-001', { x: 0, y: 0 }), out('B', '34-002', { x: 600, y: 0 })])
		const r = arrayCopies(i, ['A', 'B'], { x: 0, y: 1500 }, 2)!
		const got = outlets(r.put)
		expect(got.map((o) => [o.label, o.at])).toEqual([
			['34-003', { x: 0, y: 1500 }], ['34-004', { x: 600, y: 1500 }],
			['34-005', { x: 0, y: 3000 }], ['34-006', { x: 600, y: 3000 }],
		])
		expect(r.select).toHaveLength(4)
	})
})

describe('outletsOntoDesks', () => {
	it('the outlets on one desk onto the others of its block: same place on each, turned with the desk, desks in reading order', () => {
		// template desk at 0,0 with two outlets 400 to its right; a desk to the right, a turned one below, another block
		const i = ix([out('A', '34-001', { x: 400, y: -100 }), out('B', '34-002', { x: 400, y: 100 }),
			desk('D0', { x: 0, y: 0 }), desk('D1', { x: 2000, y: 0 }), desk('D2', { x: 0, y: 3000 }, 180), desk('X', { x: 5000, y: 0 }, 0, 'CHAIR')])
		const r = outletsOntoDesks(i, ['A', 'B', 'D0', 'D1', 'D2', 'X'])
		if ('problem' in r) throw new Error(r.problem)
		expect(r.desks).toBe(2)
		expect(outlets(r.put).map((o) => [o.label, o.at, o.rot])).toEqual([
			['34-003', { x: 2400, y: -100 }, undefined], ['34-004', { x: 2400, y: 100 }, undefined],
			['34-005', { x: -400, y: 3100 }, 180], ['34-006', { x: -400, y: 2900 }, 180],
		])
	})
	it('says what to select when it can’t', () => {
		const i = ix([out('A', '34-001', { x: 0, y: 0 }), desk('D0', { x: 0, y: 0 }), desk('X', { x: 900, y: 0 }, 0, 'CHAIR')])
		expect(outletsOntoDesks(i, ['A', 'D0'])).toHaveProperty('problem')
		expect(outletsOntoDesks(i, ['A', 'D0', 'X'])).toHaveProperty('problem')
	})
})
