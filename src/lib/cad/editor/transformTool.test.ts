// Rotate / Mirror tools (Dave, 2026-10-12): pivot or mirror line, one undo step, Ctrl keeps the originals.
import { describe, it, expect } from 'vitest'
import { EntityStore } from '../store/store'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { TransformTool } from './transformTool'
import { rotateEntity, mirrorEntity } from './behaviours'
import { spaceOf, PLAN } from '../views/space'
import { rackFrontNormal, namedFrame, rotate } from '../domain/conventions'
import { mirrorPt } from '../domain/shapes'
import type { ToolCtx } from './tools'
import type { Shape } from '../domain/shapes'
import type { Outlet, Rack } from '../domain/types'
import type { SectionCut } from '../domain/drawing'

const box = { type: 'shape', id: 'B', levelId: 'L33', geom: { kind: 'rect', centre: { x: 100, y: 100 }, size: { x: 50, y: 20 } } } as Shape
// a drop from the ceiling ending ON outlet O1 (at 1000, 4000)
const drop = { type: 'shape', id: 'D', levelId: 'L33', geom: { kind: 'path', nodes: [{ id: 'n1', x: 1000, y: 3000, z: 2900 }, { id: 'n2', x: 1000, y: 4000, z: 300, attach: 'O1' }], segs: [{ id: 's', a: 'n1', b: 'n2' }] } } as Shape

function harness(sel0: string[] = ['B']) {
	const store = new EntityStore()
	store.load([...demoProject(), box, drop])
	let sel = sel0
	const ctx = () => ({
		store, index: new ProjectIndex(store.all()), levelId: 'L33', opts: { z: 0, w: 100, h: 50 }, prims: () => [], tol: () => 10,
		space: spaceOf(PLAN), work: { z: 0, depth: 0 }, snap: (p: { x: number; y: number }) => ({ p, kind: 'grid' as const }),
		selection: sel, select: (x: string[]) => { sel = x }, setMarquee: () => {}, ask: () => {}, say: () => {},
	}) as unknown as ToolCtx
	return { store, ctx, sel: () => sel }
}
const at = (x: number, y: number, ctrl = false) => ({ p: { x, y }, shift: false, ctrl, alt: false })
const rects = (s: EntityStore) => s.ofType('shape').filter((x) => x.geom.kind === 'rect').map((x) => x.geom)

describe('rotate', () => {
	it('pivot, then a point straight up the screen: a quarter turn anticlockwise, one undo step', () => {
		const h = harness(), t = new TransformTool('rotate')
		t.down(at(0, 0), h.ctx()); t.down(at(0, -500), h.ctx())
		expect(rects(h.store)).toEqual([{ kind: 'rect', centre: { x: 100, y: -100 }, size: { x: 50, y: 20 }, rot: 270 }])
		expect(h.store.undoLabels).toEqual(['Rotate'])
		expect(t.lastPoint()).toBeNull()   // done: the next click is a new pivot
	})
	it('a typed angle is degrees anticlockwise (as the polar input): 90 = the same quarter turn; −90 the other way', () => {
		const h = harness(), t = new TransformTool('rotate')
		expect(t.typedText('90', h.ctx())).toBe(false)   // no pivot yet: read as a point
		t.down(at(0, 0), h.ctx())
		expect(t.typedText('@100,0', h.ctx())).toBe(false)   // a point, not an angle
		expect(t.typedText('90', h.ctx())).toBeNull()
		expect(rects(h.store)[0]).toMatchObject({ centre: { x: 100, y: -100 }, rot: 270 })
		t.down(at(0, 0), h.ctx()); t.typedText('-90', h.ctx())
		expect(rects(h.store)[0]).toMatchObject({ centre: { x: 100, y: 100 } })
		expect((rects(h.store)[0] as { rot?: number }).rot).toBeUndefined()
	})
	it('Ctrl on the second click keeps the original and turns a copy', () => {
		const h = harness(), t = new TransformTool('rotate')
		t.down(at(0, 0), h.ctx()); t.down(at(0, 500, true), h.ctx())
		expect(rects(h.store).map((g) => (g.kind === 'rect' ? g.centre : null))).toEqual([{ x: 100, y: 100 }, { x: -100, y: 100 }])
		expect(h.store.undoLabels).toEqual(['Rotate a copy'])
		expect(h.sel()).not.toEqual(['B'])   // the copy is selected
	})
	it('an outlet turns about the pivot and adds to its rotation; the drop ending on it follows', () => {
		const h = harness(['O1']), t = new TransformTool('rotate')
		t.down(at(0, 4000), h.ctx()); t.down(at(0, 5000), h.ctx())   // straight down the screen: 90° clockwise
		expect(h.store.get('O1')).toMatchObject({ at: { x: 0, y: 5000 }, rot: 90 })
		const d = h.store.get('D') as Shape
		expect(d.geom.kind === 'path' && d.geom.nodes.map((n) => [n.x, n.y, n.z])).toEqual([[1000, 3000, 2900], [0, 5000, 300]])
	})
	it('a locked outlet is left; with nothing it can turn, it waits', () => {
		const h = harness(['O1']), t = new TransformTool('rotate')
		h.store.transact('lock', (tx) => tx.put({ ...(h.store.get('O1') as Outlet), locked: true }))
		t.down(at(0, 0), h.ctx())
		expect(t.lastPoint()).toBeNull()
	})
})

describe('mirror', () => {
	it('two points of the line: the original is replaced by its mirror image, one undo step', () => {
		const h = harness(), t = new TransformTool('mirror')
		t.down(at(0, 0), h.ctx()); t.down(at(0, 100), h.ctx())
		expect(rects(h.store)).toEqual([{ kind: 'rect', centre: { x: -100, y: 100 }, size: { x: 50, y: 20 } }])
		expect(h.store.undoLabels).toEqual(['Mirror'])
	})
	it('Ctrl on the second point keeps the original (a mirrored copy)', () => {
		const h = harness(), t = new TransformTool('mirror')
		t.down(at(0, 0), h.ctx()); t.typed({ x: 0, y: 100 }, h.ctx())
		t.down(at(500, 0), h.ctx()); t.down(at(500, 100, true), h.ctx())
		expect(rects(h.store).map((g) => (g.kind === 'rect' ? g.centre.x : null))).toEqual([-100, 1100])
		expect(h.store.undoLabels).toEqual(['Mirror', 'Mirror a copy'])
	})
})

describe('what turning / mirroring does to each kind', () => {
	const rack = { type: 'rack', id: 'R', levelId: 'L', spaceId: 'S', order: 0, name: 'A', kind: 'cabinet', heightU: 42, widthMm: 600, depthMm: 1000, at: { x: 0, y: 500 }, doors: { front: 'single', hinge: 'left' } } as Rack
	const X = [{ x: 0, y: 0 }, { x: 1, y: 0 }] as const   // a horizontal mirror line through 0,0

	it('a rack mirrored keeps facing the mirrored way, its door hinged on the other side', () => {
		const m = mirrorEntity(rack, ...X)
		expect(m.at).toEqual({ x: 0, y: -500 })
		expect(rackFrontNormal(rack)).toEqual({ x: 0, y: 1 })   // it faced down the sheet, away from the line…
		expect(rackFrontNormal(m)).toEqual({ x: 0, y: -1 })   // …its image faces up, away from it too
		expect(m.doors?.hinge).toBe('right')
		expect(rotateEntity(rack, { x: 0, y: 0 }, 90)).toMatchObject({ at: { x: -500, y: 0 }, rot: 90 })
	})
	it('a box with a back line keeps its back towards the mirror line', () => {
		const desk = { ...box, backLine: true, geom: { kind: 'rect', centre: { x: 0, y: 100 }, size: { x: 50, y: 20 } } } as Shape
		const m = mirrorEntity(desk, ...X)
		expect(m.geom).toMatchObject({ centre: { x: 0, y: -100 }, rot: 180 })   // its back (local −y) now faces down, at the line
	})
	it('a door in a mirrored wall opens to the mirrored face', () => {
		const wall = { type: 'shape', id: 'W', levelId: 'L', geom: drop.geom, role: { kind: 'wall', openings: [{ id: 'o', segId: 's', at: 500, width: 900, z: 0, h: 2100, swing: 'left' }] } } as Shape
		const m = mirrorEntity(wall, ...X)
		expect(m.role?.kind === 'wall' && m.role.openings[0]).toMatchObject({ swing: 'left', flip: true })
	})
	it('an outlet points the mirrored way, as an insert does (2θ − r + 180); a section keeps looking at the same, mirrored, side', () => {
		const o = { ...(demoProject().find((e) => e.id === 'O1') as Outlet), rot: 30 }
		const m = mirrorEntity(o, ...X)
		expect(m).toMatchObject({ at: { x: 1000, y: -4000 }, rot: 150 })
		const want = mirrorPt(rotate({ x: 0, y: 1 }, 30), { x: 0, y: 0 }, { x: 1, y: 0 }), got = rotate({ x: 0, y: 1 }, m.rot!)
		expect([got.x, got.y]).toEqual([expect.closeTo(want.x, 6), expect.closeTo(want.y, 6)])   // its +y, mirrored
		const sec = { type: 'section', id: 'X', levelId: 'L', name: 'A', a: { x: 0, y: 100 }, b: { x: 100, y: 100 }, depth: 1000 } as SectionCut
		expect(mirrorEntity(sec, ...X)).toMatchObject({ a: { x: 100, y: -100 }, b: { x: 0, y: -100 } })
	})
	it('a shape on an elevation’s plane turns / mirrors with its plane', () => {
		const f = namedFrame('front')   // t = +x, n = +y
		const flat = { type: 'shape', id: 'E', levelId: 'L', plane: { kind: 'vertical', frame: f, depth: 0 }, extent: 100, geom: { kind: 'rect', centre: { x: 200, y: 500 }, size: { x: 100, y: 100 } } } as Shape
		const r = rotateEntity(flat, { x: 0, y: 0 }, 90)
		expect(r.plane).toMatchObject({ frame: { t: { x: 0, y: 1 }, n: { x: -1, y: 0 } } })
		expect(r.geom).toEqual(flat.geom)   // its (u, z) points stay
		const m = mirrorEntity(flat, { x: 0, y: 0 }, { x: 0, y: 1 })   // in the y axis
		expect(m.plane).toMatchObject({ frame: { t: { x: 1, y: 0 }, n: { x: 0, y: 1 } } })   // still a right-handed frame
		expect(m.geom).toMatchObject({ centre: { x: -200, y: 500 } })   // u = 200 → model x 200 → mirrored to x −200
	})
})
