import { describe, it, expect } from 'vitest'
import { BUILTIN_BLOCKS, defaultOutletBlock, fillAttrs, blockFromShapes, explodeInsert, type Block } from './blocks'
import { blockPrims } from '../views/blocks'
import { planDisplayList } from '../views/plan'
import { ProjectIndex } from './project'
import { demoProject } from './fixtures'
import { makePath, makeBox } from './make'
import { validateShape } from './validate'
import type { Shape } from './shapes'

const lib = new Map<string, Block>(BUILTIN_BLOCKS.map((b) => [b.id, b]))

describe('outlet symbols', () => {
	it('the default symbol follows usage, then tier, then mount', () => {
		expect(defaultOutletBlock({ usage: 'AP', tier: 'high', mount: 'ceiling' })).toBe('builtin:ap')
		expect(defaultOutletBlock({ usage: 'desk', tier: 'high', mount: 'floor' })).toBe('builtin:outlet-ceiling')
		expect(defaultOutletBlock({ usage: 'desk', tier: 'low', mount: 'wall' })).toBe('builtin:outlet-wall')
		expect(defaultOutletBlock({ usage: 'desk', tier: 'low', mount: 'floor' })).toBe('builtin:outlet-floor')
	})
	it('{LABEL} is filled from the outlet; unknown tags stay', () => {
		expect(fillAttrs('{LABEL} / {X}', { LABEL: '33-001' })).toBe('33-001 / {X}')
	})
	it('on the plan an outlet is drawn by its block, at a constant paper size, with its label', () => {
		const prims = planDisplayList(new ProjectIndex(demoProject()), 'L33', { scale: 100, blocks: (id) => lib.get(id) }).filter((p) => p.src === 'O1')
		const box = prims.find((p) => p.k === 'line' && p.closed)! as { pts: { x: number }[] }
		expect(Math.max(...box.pts.map((p) => p.x)) - Math.min(...box.pts.map((p) => p.x))).toBeCloseTo(300)   // 3 paper mm × 100
		expect(prims.some((p) => p.k === 'text' && p.text === '33-001')).toBe(true)
	})
	it('an annotative block scales with the drawing; a model block does not', () => {
		const b = lib.get('builtin:outlet-box')!
		const r = (k: number, annotative: boolean) => (blockPrims({ ...b, annotative }, { at: { x: 0, y: 0 } }, k, {}, 's', 'x').find((p) => p.k === 'circle') as { r: number }).r
		expect(r(200, true)).toBe(2 * r(100, true))
		expect(r(200, false)).toBe(r(100, false))
	})
})

describe('make block / explode', () => {
	it('shapes become a block around their middle, and one insert takes their place', () => {
		const a = makeBox('L', { x: 1000, y: 1000 }, 600, 400, 0, 720)
		const b = makePath({ levelId: 'L' }, [{ x: 800, y: 1200 }, { x: 1200, y: 1200 }])
		const { block, insert } = blockFromShapes([a, b], 'Desk')
		expect(insert.geom).toMatchObject({ kind: 'insert', blockId: block.id, at: { x: 1000, y: 1000 } })
		expect(block.shapes[0].geom).toMatchObject({ kind: 'rect', centre: { x: 0, y: 0 } })
		expect(validateShape(insert)).toEqual([])
	})
	it('exploding puts the same shapes back where they were (new ids, same geometry)', () => {
		const a = makeBox('L', { x: 1000, y: 1000 }, 600, 400, 0, 720)
		const { block, insert } = blockFromShapes([a], 'Desk')
		const [back] = explodeInsert(insert, block) as Shape[]
		expect(back.geom).toEqual(a.geom)
		expect(back.id).not.toBe(a.id)
		expect(back.extent).toBe(720)
	})
})
