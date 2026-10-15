// A block made from shapes drawn in an elevation (one drawing, User 2026-10-14), and stored blocks that still carry
// the dropped separate `front` drawing.
import { describe, it, expect } from 'vitest'
import { elevationProblem, elevationShapes, elevationBlock, oneDrawing, type Block } from './blocks'
import { ProjectIndex } from './project'
import { demoProject } from './fixtures'
import { spaceOf } from '../views/space'
import { elevationDisplayList } from '../views/elevation'
import type { Shape } from './shapes'

describe('a block made from shapes drawn in an elevation', () => {
	const sp = spaceOf({ kind: 'elevation', dir: 'front' })
	const plane = { kind: 'vertical' as const, frame: sp.frame!, depth: 3000 }
	// a 400 × 200 box whose middle is 1000 mm up and 500 mm along, and a label under it
	const box = { type: 'shape', id: 'B', levelId: 'L33', plane, geom: { kind: 'rect', centre: { x: 500, y: 1000 }, size: { x: 400, y: 200 } } } as Shape
	const note = { type: 'shape', id: 'T', levelId: 'L33', plane, geom: { kind: 'text', at: { x: 500, y: 800 }, text: 'PDU', sizeMm: 2.5 } } as Shape

	it('takes shapes drawn in ONE elevation', () => {
		expect(elevationProblem([box, note])).toBeNull()
		expect(elevationProblem([{ ...box, plane: undefined } as Shape])).toMatch(/drawn in an elevation/)
		const other = { ...box, plane: { ...plane, frame: spaceOf({ kind: 'elevation', dir: 'left' }).frame! } } as Shape
		expect(elevationProblem([box, other])).toMatch(/different elevations/)
		expect(elevationProblem([])).toMatch(/Select/)
	})
	it('its drawing is real mm, y down, centred on the middle of the shapes', () => {
		const f = elevationShapes([box, note])!
		const r = f.shapes[0].geom as { centre: { x: number; y: number }; size: { x: number } }
		const t = f.shapes[1].geom as { at: { y: number }; sizeMm: number }
		expect(r.size.x).toBe(400)
		expect(r.centre.y).toBeLessThan(t.at.y)   // y down: higher on the wall = smaller y
		expect(t.sizeMm).toBe(250)                // paper 2.5 mm × the plot scale 100
		expect(f.at.depth).toBe(3000)
	})
	it('one drawing: the shapes themselves, and one insert replaces them in that elevation at the same height', () => {
		const m = elevationBlock([box], 'Shelf')!
		expect(m.block).toMatchObject({ name: 'Shelf', scope: 'global' })
		expect(m.block.shapes[0].geom).toMatchObject({ kind: 'rect', size: { x: 400, y: 200 } })
		expect('front' in m.block).toBe(false)
		expect(m.insert.geom).toMatchObject({ kind: 'insert', blockId: m.block.id, z: 1000, inElevations: true })
		const prims = elevationDisplayList(new ProjectIndex([...demoProject(), m.insert]), 'L33', sp, { scale: 100, blocks: (id) => (id === m.block.id ? m.block : undefined) }).filter((p) => p.src === m.insert.id && p.k === 'line')
		expect(prims.length).toBeGreaterThan(0)
	})
	it('a stored block with a separate front drawing: the front becomes its only drawing, real mm', () => {
		const front = elevationShapes([box])!.shapes
		const old = { type: 'block', id: 'fb', name: 'FB', scope: 'global', annotative: true, shapes: [], front } as Block & { front: Block['shapes'] }
		const b = oneDrawing(old)
		expect(b.shapes).toBe(front)
		expect(b.annotative).toBe(false)
		expect('front' in b).toBe(false)
		const plain: Block = { type: 'block', id: 'p', name: 'P', scope: 'global', shapes: [] }
		expect(oneDrawing(plain)).toBe(plain)
	})
})
