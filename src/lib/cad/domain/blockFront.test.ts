// A block's FRONT drawing, made from shapes drawn in an elevation (backlog "Blocks: front drawings").
import { describe, it, expect } from 'vitest'
import { BUILTIN_BLOCKS, frontProblem, frontFromShapes, frontBlock, type Block } from './blocks'
import { ProjectIndex } from './project'
import { demoProject } from './fixtures'
import { spaceOf } from '../views/space'
import { elevationDisplayList } from '../views/elevation'
import type { Shape } from './shapes'

describe('a block’s front drawing, made from shapes drawn in an elevation', () => {
	const sp = spaceOf({ kind: 'elevation', dir: 'front' })
	const plane = { kind: 'vertical' as const, frame: sp.frame!, depth: 3000 }
	// a 400 × 200 box whose middle is 1000 mm up and 500 mm along, and a label under it
	const box = { type: 'shape', id: 'B', levelId: 'L33', plane, geom: { kind: 'rect', centre: { x: 500, y: 1000 }, size: { x: 400, y: 200 } } } as Shape
	const note = { type: 'shape', id: 'T', levelId: 'L33', plane, geom: { kind: 'text', at: { x: 500, y: 800 }, text: 'PDU', sizeMm: 2.5 } } as Shape

	it('only shapes drawn in ONE elevation can be a front', () => {
		expect(frontProblem([box, note])).toBeNull()
		expect(frontProblem([{ ...box, plane: undefined } as Shape])).toMatch(/drawn in an elevation/)
		const other = { ...box, plane: { ...plane, frame: spaceOf({ kind: 'elevation', dir: 'left' }).frame! } } as Shape
		expect(frontProblem([box, other])).toMatch(/different elevations/)
		expect(frontProblem([])).toMatch(/Select/)
	})
	it('the front is real mm, y down, centred on the middle of the shapes', () => {
		const f = frontFromShapes([box, note])!
		const r = f.front[0].geom as { centre: { x: number; y: number }; size: { x: number } }
		const t = f.front[1].geom as { at: { y: number }; sizeMm: number }
		expect(r.size.x).toBe(400)
		expect(r.centre.y).toBeLessThan(t.at.y)   // y down: higher on the wall = smaller y
		expect(t.sizeMm).toBe(250)                // paper 2.5 mm × the plot scale 100
		expect(f.at.depth).toBe(3000)
	})
	it('a NEW block gets a plain box for its plan symbol, and one insert replaces the shapes, in that elevation at the same height', () => {
		const m = frontBlock([box], { name: 'Shelf' })!
		const b = m.write as Block
		expect(b).toMatchObject({ name: 'Shelf', scope: 'global' })
		expect(b.front).toHaveLength(1)
		expect(b.shapes[0].geom).toMatchObject({ kind: 'rect', size: { x: 400, y: 50 } })
		expect(m.insert.geom).toMatchObject({ kind: 'insert', blockId: b.id, z: 1000, inElevations: true })
	})
	it('your own block takes the front; a built-in does not', () => {
		const mine: Block = { type: 'block', id: 'mine', name: 'Mine', scope: 'global', shapes: [] }
		expect(frontBlock([box], { blockId: 'mine' }, mine)!.write).toMatchObject({ id: 'mine' })
		const builtin = BUILTIN_BLOCKS[0]
		expect(frontBlock([box], { blockId: builtin.id }, builtin)).toBeNull()
	})
	it('a block with a front, placed from the plan, shows its front in the elevation at its height', () => {
		const b: Block = { type: 'block', id: 'fb', name: 'FB', scope: 'global', shapes: [], front: frontFromShapes([box])!.front }
		const ins = { type: 'shape', id: 'I', levelId: 'L33', geom: { kind: 'insert', blockId: 'fb', at: { x: 0, y: 0 }, z: 1500, inElevations: true } } as Shape
		const prims = elevationDisplayList(new ProjectIndex([...demoProject(), ins]), 'L33', sp, { scale: 100, blocks: (id) => (id === 'fb' ? b : undefined) }).filter((p) => p.src === 'I' && p.k === 'line')
		expect(prims.length).toBeGreaterThan(0)
	})
})
