// Move / Copy with a base point (Dave, 2026-10-05).
import { describe, it, expect } from 'vitest'
import { EntityStore } from '../store/store'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { MoveTool } from './moveTool'
import { spaceOf, PLAN } from '../views/space'
import type { ToolCtx } from './tools'
import type { Shape } from '../domain/shapes'
import type { SectionCut } from '../domain/drawing'
import { sectionFrame, sectionDisplayList } from '../views/section'
import { followSection } from './behaviours'

const box = { type: 'shape', id: 'B', levelId: 'L33', geom: { kind: 'rect', centre: { x: 100, y: 100 }, size: { x: 50, y: 50 } } } as Shape

function harness() {
	const store = new EntityStore()
	store.load([...demoProject(), box])
	let sel = ['B']
	const ctx = () => ({
		store, index: new ProjectIndex(store.all()), levelId: 'L33', opts: { z: 0, w: 100, h: 50 }, prims: () => [], tol: () => 10,
		space: spaceOf(PLAN), work: { z: 0, depth: 0 }, snap: (p: { x: number; y: number }) => ({ p, kind: 'grid' as const }),
		selection: sel, select: (x: string[]) => { sel = x }, setMarquee: () => {}, ask: () => {}, say: () => {},
	}) as unknown as ToolCtx
	return { store, ctx }
}
const at = (x: number, y: number, shift = false) => ({ p: { x, y }, shift, ctrl: false, alt: false })
const rects = (s: EntityStore) => s.ofType('shape').filter((x) => x.geom.kind === 'rect').map((x) => (x.geom.kind === 'rect' ? x.geom.centre : null))

describe('move / copy with a base point', () => {
	it('move: base point, then the second point moves the selection by the difference, one undo step', () => {
		const h = harness(), t = new MoveTool('move')
		t.down(at(0, 0), h.ctx()); t.down(at(1000, 500), h.ctx())
		expect(rects(h.store)).toEqual([{ x: 1100, y: 600 }])
		expect(h.store.undoLabels).toEqual(['Move'])
		expect(t.lastPoint()).toBeNull()   // done: the next click is a new base point
	})
	it('a typed second point is taken as it is (the tool bar turns @dx,dy into it from the base)', () => {
		const h = harness(), t = new MoveTool('move')
		t.down(at(100, 100), h.ctx()); t.typed({ x: 100, y: 2100 }, h.ctx())
		expect(rects(h.store)).toEqual([{ x: 100, y: 2100 }])
	})
	it('copy: each click a copy from the base point; the original stays; Enter ends', () => {
		const h = harness(), t = new MoveTool('copy')
		t.down(at(0, 0), h.ctx()); t.down(at(1000, 0), h.ctx()); t.down(at(2000, 0), h.ctx())
		expect(rects(h.store).map((p) => p!.x).sort((a, b) => a - b)).toEqual([100, 1100, 2100])
		expect(h.store.undoLabels).toEqual(['Copy', 'Copy'])
		expect(t.key({ key: 'Enter' } as KeyboardEvent)).toBe(true)
		expect(t.lastPoint()).toBeNull()
	})
	it('nothing selected: it says so and waits', () => {
		const h = harness(), t = new MoveTool('move'), c = { ...h.ctx(), selection: [] } as ToolCtx
		t.down(at(0, 0), c)
		expect(t.lastPoint()).toBeNull()
	})
})

describe('what is drawn on a section’s plane follows the section', () => {
	const sec: SectionCut = { type: 'section', id: 'X', levelId: 'L33', name: 'A', a: { x: 0, y: 0 }, b: { x: 5000, y: 0 }, depth: 3000 }
	const f = sectionFrame(sec).f
	// a note 1 m along the cut at 1.5 m up, and a line on its plane
	const note = { type: 'shape', id: 'N', levelId: 'L33', plane: { kind: 'vertical', frame: f, depth: 0 }, geom: { kind: 'text', at: { x: 1000, y: 1500 }, text: 'CHECK', sizeMm: 2.5 } } as Shape
	const line = { type: 'shape', id: 'P', levelId: 'L33', plane: { kind: 'vertical', frame: f, depth: 0 }, geom: { kind: 'path', nodes: [{ id: 'a', x: 500, y: 0, z: 0 }, { id: 'b', x: 500, y: 0, z: 2000 }], segs: [{ id: 's', a: 'a', b: 'b' }] } } as Shape
	const shown = (st: EntityStore) => sectionDisplayList(new ProjectIndex(st.all()), st.get('X') as SectionCut, { scale: 100 }).filter((p) => p.src === 'N' || p.src === 'P').map((p) => p.src)
	it('moved with the Move tool (only the section picked): the note and the line still show, in the same place in the building', () => {
		const store = new EntityStore()
		store.load([...demoProject(), sec, note, line])
		expect(shown(store)).toEqual(['P', 'N'])
		let sel = ['X']
		const ctx = () => ({ store, index: new ProjectIndex(store.all()), levelId: 'L33', opts: { z: 0, w: 100, h: 50 }, prims: () => [], tol: () => 10,
			space: spaceOf(PLAN), work: { z: 0, depth: 0 }, snap: (p: { x: number; y: number }) => ({ p, kind: 'grid' as const }),
			selection: sel, select: (x: string[]) => { sel = x }, setMarquee: () => {}, ask: () => {}, say: () => {} }) as unknown as ToolCtx
		const t = new MoveTool('move')
		t.down(at(0, 0), ctx()); t.down(at(-400, 300), ctx())   // 400 back along the cut, 300 towards the viewer
		expect(shown(store)).toEqual(['P', 'N'])
		const n = store.get('N') as Shape
		expect(n.geom).toMatchObject({ at: { x: 1400, y: 1500 } })   // the cut starts 400 further back: same building point
		expect(n.plane).toMatchObject({ depth: -300 })
		expect(store.undoLabels).toEqual(['Move'])
	})
	it('flipped: the note stays put in the building (mirrored along the cut as seen), still readable', () => {
		const [n] = followSection([note], sec, { ...sec, flip: true })
		expect(n.geom).toMatchObject({ at: { x: 4000, y: 1500 } })
		expect(n.plane).toMatchObject({ frame: sectionFrame({ ...sec, flip: true }).f })
	})
})
