import { describe, it, expect } from 'vitest'
import { BUILTIN_BLOCKS, defaultOutletBlock, fillAttrs, blockFromShapes, blockProblem, paperBlockScale, explodeInsert, blockAttrDefs, insertAttrs, type Block } from './blocks'
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
		expect(defaultOutletBlock({ usage: 'ACS', tier: 'high', mount: 'wall' })).toBe('builtin:outlet-wall')   // W11: fed from the ceiling, still a wall plate
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
	it('an outlet shows its label above, usage below and its port count; the AP too (no "AP" in the middle)', () => {
		const prims = planDisplayList(new ProjectIndex(demoProject()), 'L33', { scale: 100, blocks: (id) => lib.get(id) }).filter((p) => p.src === 'O1')
		expect(prims.filter((p) => p.k === 'text').map((p) => p.k === 'text' && p.text)).toEqual(expect.arrayContaining(['33-001', 'desk', '2']))
		const ap = blockPrims(lib.get('builtin:ap')!, { at: { x: 0, y: 0 } }, 1, { LABEL: 'AP-1', USAGE: 'AP', PORTS: '1' }, 'A', 'outlet')
		const usage = ap.find((p) => p.k === 'text' && p.text === 'AP')
		expect(usage?.k === 'text' && usage.at.y).toBeGreaterThan(1.8)   // below the ring, not in its middle
		expect(ap.some((p) => p.k === 'text' && p.text === '1')).toBe(true)
	})
	it('faceplates: data / power, single / dual gang — ONE drawing (User 2026-10-14): a 70 × 115 plate, a 50 × 90 frame; power sockets two prongs and an earth, data an RJ45 — real mm', () => {
		const fp = BUILTIN_BLOCKS.filter((b) => b.id.startsWith('builtin:faceplate-'))
		expect(fp.map((b) => b.name)).toEqual(['Faceplate - data, single', 'Faceplate - data, dual', 'Faceplate - power, single', 'Faceplate - power, dual'])
		for (const b of fp) expect(b).toMatchObject({ category: 'outlet' })
		const dual = lib.get('builtin:faceplate-power-2')!
		expect(dual.annotative).toBeFalsy()
		const sizes = dual.shapes.flatMap((s) => (s.geom.kind === 'rect' ? [s.geom.size] : []))
		expect(sizes).toEqual([{ x: 70, y: 115 }, { x: 50, y: 90 }])
		expect(dual.shapes.filter((s) => s.geom.kind === 'path')).toHaveLength(4)     // 2 sockets × 2 prongs
		expect(dual.shapes.filter((s) => s.geom.kind === 'circle')).toHaveLength(2)   // their earths
		const ps = blockPrims(dual, { at: { x: 1000, y: -1200 } }, 50, {}, 'I', 'shape')   // at 1:50 still 70 mm wide
		const plate = ps.find((p) => p.k === 'line' && p.closed)
		expect(plate?.k === 'line' && Math.max(...plate.pts.map((q) => q.x)) - Math.min(...plate.pts.map((q) => q.x))).toBe(70)
		// a data faceplate: the same plate and frame, an RJ45 rectangle per socket
		const data = lib.get('builtin:faceplate-data-2')!.shapes.flatMap((s) => (s.geom.kind === 'rect' ? [s.geom.size] : []))
		expect(data).toEqual([{ x: 70, y: 115 }, { x: 50, y: 90 }, { x: 14, y: 12 }, { x: 14, y: 12 }])
	})
	it('an annotative block scales with the drawing; a model block does not', () => {
		const b = lib.get('builtin:outlet-box')!
		const r = (k: number, annotative: boolean) => (blockPrims({ ...b, annotative }, { at: { x: 0, y: 0 } }, k, {}, 's', 'x').find((p) => p.k === 'circle') as { r: number }).r
		expect(r(200, true)).toBe(2 * r(100, true))
		expect(r(200, false)).toBe(r(100, false))
	})
})

describe('make block from shapes on a sheet', () => {
	const sheet = { type: 'sheet', id: 'S', viewports: [{ id: 'V', scale: 50 }] } as unknown as import('./drawing').Sheet
	const tied = (geom: object) => ({ type: 'shape', id: 'a', sheetId: 'S', vpId: 'V', layerId: 'Y', geom }) as Shape
	const paper = (geom: object) => ({ type: 'shape', id: 'b', sheetId: 'S', geom }) as Shape
	it('shapes tied to a viewport stay in model mm and the insert stays tied', () => {
		const r = tied({ kind: 'rect', centre: { x: 1000, y: 500 }, size: { x: 600, y: 400 } })
		expect(blockProblem([r])).toBeNull()
		expect(paperBlockScale([r], sheet)).toBeNull()
		const { block, insert } = blockFromShapes([r], 'Desk', paperBlockScale([r], sheet))
		expect(block.shapes[0].geom).toMatchObject({ kind: 'rect', centre: { x: 0, y: 0 }, size: { x: 600, y: 400 } })
		expect(insert).toMatchObject({ sheetId: 'S', vpId: 'V', layerId: 'Y', geom: { kind: 'insert', at: { x: 1000, y: 500 } } })
		expect((insert.geom as { scale?: number }).scale).toBeUndefined()
	})
	it('untied paper shapes make the block at the first viewport’s scale, the insert shrinking it back', () => {
		const r = paper({ kind: 'rect', centre: { x: 100, y: 50 }, size: { x: 20, y: 10 } })
		const k = paperBlockScale([r], sheet)
		expect(k).toBe(50)
		const { block, insert } = blockFromShapes([r], 'Plate', k)
		expect(block.shapes[0].geom).toMatchObject({ size: { x: 1000, y: 500 } })
		expect(insert).toMatchObject({ sheetId: 'S', geom: { at: { x: 100, y: 50 }, scale: 1 / 50 } })
		expect(insert.vpId).toBeUndefined()
		expect(paperBlockScale([r], { ...sheet, viewports: [] })).toBeNull()   // no viewport: paper size
	})
	it('shapes from different places can’t be mixed', () => {
		expect(blockProblem([tied({ kind: 'text', at: { x: 0, y: 0 }, text: 'a', sizeMm: 3 }), paper({ kind: 'text', at: { x: 0, y: 0 }, text: 'b', sizeMm: 3 })])).toMatch(/one place/)
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
	it('shapes drawn on an elevation’s plane can’t become a block (it would put them on the plan)', () => {
		const plan = makeBox('L', { x: 1000, y: 1000 }, 600, 400, 0, 720)
		const onWall = { ...makeBox('L', { x: 200, y: 1200 }, 70, 115, 0, 0), plane: { kind: 'vertical', frame: { o: { x: 0, y: 0 }, t: { x: 1, y: 0 }, n: { x: 0, y: 1 } }, depth: 0 } } as Shape
		expect(blockProblem([plan])).toBeNull()
		expect(blockProblem([plan, onWall])).toMatch(/elevation/)
	})
	it('exploding puts the same shapes back where they were (new ids, same geometry)', () => {
		const a = makeBox('L', { x: 1000, y: 1000 }, 600, 400, 0, 720)
		const { block, insert } = blockFromShapes([a], 'Desk')
		const [back] = explodeInsert(insert, block) as Shape[]
		expect(back.geom).toEqual(a.geom)
		expect(back.id).not.toBe(a.id)
		expect(back.extent).toBe(720)
	})
	it('exploding a turned, scaled insert on a sheet keeps its turn, size, owner and layer', () => {
		const a = makeBox('L', { x: 0, y: 0 }, 600, 400, 0, 720)
		const { block } = blockFromShapes([a], 'Desk')
		const ins = { type: 'shape', id: 'i', sheetId: 'S', vpId: 'V', layerId: 'Y', geom: { kind: 'insert', blockId: block.id, at: { x: 100, y: 50 }, rot: 90, scale: 2 } } as Shape
		const [back] = explodeInsert(ins, block) as Shape[]
		expect(back).toMatchObject({ sheetId: 'S', vpId: 'V', layerId: 'Y' })
		expect(back.levelId).toBeUndefined()
		expect(back.geom).toMatchObject({ kind: 'rect', centre: { x: 100, y: 50 }, size: { x: 1200, y: 800 }, rot: 90 })
	})
})

describe('explode draws what the view drew', () => {
	const datum = lib.get('builtin:datum')!
	it('an annotative symbol: its geometry × the drawing scale, its text the same paper size, its {TAGS} filled', () => {
		const ins = { type: 'shape', id: 'i', levelId: 'L', geom: { kind: 'insert', blockId: datum.id, at: { x: 1000, y: 0 }, attrs: { NAME: 'CH' }, scale: 1.5 } } as Shape
		const out = explodeInsert(ins, datum, 100)
		const text = out.find((x) => x.geom.kind === 'text')!.geom as { text: string; sizeMm: number }
		expect(text).toMatchObject({ text: 'CH +0', sizeMm: 3 })   // 2 paper mm × 1.5, drawn × 100 by the plan as before
		expect((out.find((x) => x.geom.kind === 'circle')!.geom as { r: number }).r).toBeCloseTo(240)   // 1.6 × 1.5 × 100
		// a hidden attribute is blank: its text goes
		const two = { ...datum, shapes: [...datum.shapes, { id: 't2', geom: { kind: 'text', at: { x: 0, y: 5 }, text: '{NOTE}', sizeMm: 2 } }] } as Block
		expect(explodeInsert(ins, two, 100).filter((x) => x.geom.kind === 'text')).toHaveLength(1)
	})
	it('a model block’s text is real size: explode keeps it so on a plan (paper mm = real ÷ k)', () => {
		const b = { type: 'block', id: 'B', name: 'Desk', scope: 'global', shapes: [{ id: 't', geom: { kind: 'text', at: { x: 0, y: 0 }, text: 'DESK', sizeMm: 200 } }] } as Block
		const ins = { type: 'shape', id: 'i', levelId: 'L', geom: { kind: 'insert', blockId: 'B', at: { x: 0, y: 0 } } } as Shape
		expect((explodeInsert(ins, b, 100)[0].geom as { sizeMm: number }).sizeMm).toBe(2)
	})
	it('in an elevation: its drawing on that view’s plane at the insert’s height, not on the plan', () => {
		const plate = { type: 'block', id: 'P', name: 'Plate', scope: 'global',
			shapes: [{ id: 'f', geom: { kind: 'rect', centre: { x: 0, y: -10 }, size: { x: 70, y: 115 } } }, makePath({ levelId: 'L' }, [{ x: -35, y: 0 }, { x: 35, y: 0 }])] } as Block
		const frame = { o: { x: 0, y: 0 }, t: { x: 1, y: 0 }, n: { x: 0, y: 1 } }   // the front elevation: u = x, looking up the sheet
		const ins = { type: 'shape', id: 'i', levelId: 'L', geom: { kind: 'insert', blockId: 'P', at: { x: 2000, y: 500 }, z: 300, inElevations: true, frame } } as Shape
		const [box, line] = explodeInsert(ins, plate, 100, { frame })
		expect(box.plane).toEqual({ kind: 'vertical', frame, depth: 500 })
		expect(box.geom).toMatchObject({ kind: 'rect', centre: { x: 2000, y: 310 }, size: { x: 70, y: 115 } })   // (u, z): 10 mm above its point
		expect((line.geom as { nodes: unknown[] }).nodes).toMatchObject([{ x: 1965, y: 500, z: 300 }, { x: 2035, y: 500, z: 300 }])
	})
})

describe('drawing symbols (Markup kinds part 5)', () => {
	it('datum, detail callout and elevation tag: annotative symbols whose words are attributes with defaults', () => {
		const sym = BUILTIN_BLOCKS.filter((b) => b.category === 'symbol')
		expect(sym.map((b) => b.name)).toEqual(['Datum (level)', 'Detail callout', 'Elevation tag', 'Level marker (elevation)', 'Elevation marker (4-way)', 'Break line - straight', 'Break line - round (pipe / duct)', 'Centreline mark'])
		expect(sym.every((b) => b.annotative)).toBe(true)
		expect(sym.slice(0, 5).map((b) => blockAttrDefs(b).map((d) => `${d.tag}=${d.default}`))).toEqual([['NAME=FFL', 'HEIGHT={Z}'], ['NUMBER=1', 'ON_SHEET=A-501'], ['NUMBER=1', 'ON_SHEET=A-201'], ['NAME=FLOOR 1F', 'HEIGHT=FL±0'], ['ON_SHEET=A-201', 'UP=A', 'RIGHT=B', 'DOWN=C', 'LEFT=D']])
		expect(insertAttrs(sym[1], { NUMBER: '3' })).toEqual({ NUMBER: '3', ON_SHEET: 'A-501' })
	})
})

describe('{Z}: an insert\'s height (User 2026-10-17)', () => {
	it('fills block texts and attribute values; the datum reads where it sits', () => {
		const datum = BUILTIN_BLOCKS.find((b) => b.id === 'builtin:datum')!
		expect(fillAttrs('{NAME} {HEIGHT}', insertAttrs(datum, {}, [], 2010))).toBe('FFL +2010')
		expect(fillAttrs('{NAME} {HEIGHT}', insertAttrs(datum, { HEIGHT: '+3500' }, [], 2010))).toBe('FFL +3500')   // typed: kept
		expect(fillAttrs('{HEIGHT}', insertAttrs(datum, {}, [], -300))).toBe('-300')
		expect(blockAttrDefs(datum).map((a) => a.tag)).toEqual(['NAME', 'HEIGHT'])                                     // Z isn't an attribute
	})
})
