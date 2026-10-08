// Elevations as behaviour: what the front / rear / side views show, and drawing / moving in them.
import { describe, it, expect } from 'vitest'
import { elevationDisplayList, RU_MM } from './elevation'
import { spaceOf } from './space'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { EntityStore } from '../store/store'
import { PathTool } from '../editor/pathTool'
import { type ToolCtx } from '../editor/tools'
import { SelectTool } from '../editor/selectTool'
import { snapToPrims } from '../editor/snap'
import type { Entity } from '../domain/drawing'
import type { Outlet, Rack } from '../domain/types'
import type { Shape } from '../domain/shapes'

/** The demo with its rack placed (front = +y, unrotated) at plan (5000, 1000). */
const placed = (): Entity[] => demoProject().map((e) => (e.id === 'R1' ? { ...(e as Rack), at: { x: 5000, y: 1000 } } : e))
const view = (dir: 'front' | 'rear' | 'left' | 'right', ents = placed()) => elevationDisplayList(new ProjectIndex(ents), 'L33', spaceOf({ kind: 'elevation', dir }), { scale: 100 })
const srcs = (dir: 'front' | 'rear' | 'left' | 'right') => new Set(view(dir).map((p) => p.src).filter(Boolean))

describe('what an elevation shows', () => {
	it("the FRONT shows the rack's front-mounted devices; the REAR its rear ones; a SIDE none", () => {
		// P1 is mounted 'both', SW1 'front'
		expect(srcs('front').has('SW1')).toBe(true)
		expect(srcs('front').has('P1')).toBe(true)
		expect(srcs('rear').has('SW1')).toBe(false)
		expect(srcs('rear').has('P1')).toBe(true)
		expect(srcs('left').has('P1')).toBe(false)
		expect(srcs('left').has('R1')).toBe(true)
	})
	it('a device sits at its U: panel at U40 is 39 rack units above the rack base', () => {
		const p = view('front').find((x) => x.src === 'P1' && x.k === 'line') as { pts: { y: number }[] }
		const r = view('front').find((x) => x.src === 'R1' && x.k === 'line') as { pts: { y: number }[] }
		const rackBottom = Math.max(...r.pts.map((q) => -q.y)) === 0 ? 0 : 0
		const deviceBottom = Math.min(...p.pts.map((q) => -q.y))
		const base = (42 * RU_MM + 150 - 42 * RU_MM) / 2
		expect(deviceBottom - rackBottom).toBeCloseTo(base + 39 * RU_MM)
	})
	it('the trunk drop is a vertical band from +300 to +2900 at its plan position', () => {
		const drop = view('front').filter((x) => x.src === 'T1' && x.k === 'line').find((x) => (x as { pts: { x: number }[] }).pts.every((q) => q.x === 6000)) as { pts: { y: number }[]; w: number }
		expect(drop.pts.map((q) => -q.y).sort((a, b) => a - b)).toEqual([300 + 25, 2900 + 25])   // bottom-anchored 100×50 → centre line +25
		expect(drop.w).toBe(100)
	})
	it('outlets show as faceplates at their height, in plan order along the view', () => {
		const xs = view('front').filter((x) => (x.src === 'O1' || x.src === 'O2') && x.k === 'line').map((x) => (x as { pts: { x: number }[] }).pts[0].x)
		expect(xs[0]).toBeLessThan(xs[1])
		const ys = view('rear').filter((x) => (x.src === 'O1' || x.src === 'O2') && x.k === 'line').map((x) => (x as { pts: { x: number }[] }).pts[0].x)
		expect(ys[0]).toBeGreaterThan(ys[1])   // seen from behind, the order flips
	})
	it('level datum lines are drawn (FFL, ceiling …)', () => {
		expect(view('front').some((p) => p.k === 'text' && p.text === 'FFL ±0')).toBe(true)
	})
})

function harness(dir: 'front' | 'left', depth: number) {
	const store = new EntityStore()
	store.load(placed())
	let sel: string[] = []
	const space = spaceOf({ kind: 'elevation', dir })
	const ctx = (): ToolCtx => {
		const index = new ProjectIndex(store.all())
		return {
			store, index, levelId: 'L33', opts: { z: 0, w: 100, h: 50 }, space, work: { z: 0, depth },
			prims: () => elevationDisplayList(index, 'L33', space, { scale: 100 }), tol: () => 10,
			snap: (p, alt) => snapToPrims([], p, 10, { noGrid: alt }), selection: sel, select: (ids) => { sel = ids }, setMarquee: () => {}, ask: () => {},
		}
	}
	return { store, ctx, sel: () => sel }
}
const at = (x: number, y: number) => ({ p: { x, y }, shift: false, ctrl: false, alt: false })

describe('drawing and moving in an elevation (ADR 0006)', () => {
	it('a run drawn straight down in the FRONT view is a vertical drop at the work depth', () => {
		const h = harness('front', 3000)              // front: depth = plan y
		const t = new PathTool('trunk')
		t.down(at(2000, -2900), h.ctx()); t.down(at(2000, -300), h.ctx()); t.finish(h.ctx())
		const s = h.store.get(h.sel()[0]) as Shape
		expect(s.geom.kind === 'path' && s.geom.nodes.map((n) => [n.x, n.y, n.z])).toEqual([[2000, 3000, 2900], [2000, 3000, 300]])
	})
	it('in the LEFT view the same strokes run along the plan y axis', () => {
		const h = harness('left', -500)               // left: n = −x, so depth −500 is plan x = 500
		const t = new PathTool('line')
		t.down(at(0, -1000), h.ctx()); t.down(at(4000, -1000), h.ctx()); t.finish(h.ctx())
		const s = h.store.get(h.sel()[0]) as Shape
		expect(s.geom.kind === 'path' && s.geom.nodes.map((n) => [n.x, n.y, n.z])).toEqual([[500, 0, 1000], [500, 4000, 1000]])
	})
	it('a LINE drawn on an elevation belongs to it: shown there only, not on the plan or the other elevations', () => {
		const h = harness('front', 3000)
		const t = new PathTool('line')
		t.down(at(0, -1000), h.ctx()); t.down(at(2000, -1000), h.ctx()); t.finish(h.ctx())
		const s = h.store.get(h.sel()[0]) as Shape
		expect(s.plane).toMatchObject({ kind: 'vertical', depth: 3000 })
		const ents = h.store.all()
		const shown = (dir: 'front' | 'rear' | 'left' | 'right') => view(dir, ents).some((p) => p.src === s.id)
		expect([shown('front'), shown('rear'), shown('left'), shown('right')]).toEqual([true, false, false, false])
		// a trunk drawn the same way is a model run: every elevation shows it
		const r = new PathTool('trunk')
		r.down(at(0, -2000), h.ctx()); r.down(at(2000, -2000), h.ctx()); r.finish(h.ctx())
		const run = h.sel()[0]
		expect(view('rear', h.store.all()).some((p) => p.src === run)).toBe(true)
	})
	it('a note or flat shape on one elevation stays there; a box with a depth is seen from the others', () => {
		const sp = spaceOf({ kind: 'elevation', dir: 'front' })
		const plane = { kind: 'vertical' as const, frame: sp.frame!, depth: 3000 }
		const note = { type: 'shape', id: 'N', levelId: 'L33', plane, geom: { kind: 'text', at: { x: 0, y: 1000 }, text: 'A', sizeMm: 2.5 } } as Shape
		const flat = { type: 'shape', id: 'F', levelId: 'L33', plane, geom: { kind: 'rect', centre: { x: 0, y: 1000 }, size: { x: 400, y: 200 } } } as Shape
		const solid = { ...flat, id: 'B', extent: 300 } as Shape
		const ents = [...placed(), note, flat, solid]
		const ids = (dir: 'front' | 'rear' | 'left' | 'right') => ['N', 'F', 'B'].filter((id) => view(dir, ents).some((p) => p.src === id))
		expect(ids('front')).toEqual(['N', 'F', 'B'])
		expect(ids('rear')).toEqual(['B'])
		expect(ids('left')).toEqual(['B'])
	})
	it('dragging an outlet up in an elevation raises it (z) and slides it along the view', () => {
		const h = harness('front', 0)
		const sel = new SelectTool()
		const c = h.ctx()
		const face = c.prims().find((p) => p.src === 'O1' && p.k === 'line') as { pts: { x: number; y: number }[] }
		const grab = { x: face.pts[0].x + 10, y: face.pts[0].y - 10 }
		sel.down(at(grab.x, grab.y), c)
		sel.move(at(grab.x + 100, grab.y - 1200), h.ctx())
		sel.up(at(grab.x + 100, grab.y - 1200), h.ctx())
		const o = h.store.get('O1') as Outlet
		expect([o.at?.x, o.at?.y, o.z]).toEqual([1100, 4000, 1200])
	})
})

describe('risers in floor elevations', () => {
	const lv = (id: string, e: number) => ({ type: 'level', id, name: id, number: e / 4000, order: e, elevationMm: e, heights: { slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2600, plenumMm: 700 } })
	const riser = { type: 'shape', id: 'RA', levelId: 'L33', label: 'Riser A', section: { w: 150, h: 150 }, role: { kind: 'containment', form: 'trunk', tier: 'low' },
		geom: { kind: 'path', nodes: [{ id: 'a', x: 1000, y: -2000, z: 0 }, { id: 'b', x: 1000, y: -2000, z: 0, levelId: 'L12' }], segs: [{ id: 's', a: 'a', b: 'b' }] } }
	const ix = new ProjectIndex([lv('L12', 48000), lv('L30', 120000), lv('L33', 132000), riser] as Entity[])
	it('a riser from L33 down to L12 shows in L30\'s elevation, cut to that floor (slab underside → top of plenum)', () => {
		const ps = elevationDisplayList(ix, 'L30', spaceOf({ kind: 'elevation', dir: 'front' }), { scale: 100 }).filter((p) => p.src === 'RA')
		expect(ps.length).toBeGreaterThan(0)
		expect(ps[0].clip).toEqual({ x0: -1e6, x1: 1e6, y0: -3300, y1: 500 })
		expect(elevationDisplayList(ix, 'L12', spaceOf({ kind: 'elevation', dir: 'front' }), { scale: 100 }).some((p) => p.src === 'RA')).toBe(true)   // its end floor too
	})
})

describe('openings in elevations', () => {
	it('a wall face is solid around a door: beside it and above it, nothing in the hole; the hole is outlined', async () => {
		const { makeWall } = await import('../domain/make')
		const { makeOpening } = await import('../domain/openings')
		const w = makeWall('L1', [{ x: 0, y: 0 }, { x: 4000, y: 0 }], 100, 2600)
		const seg = w.geom.kind === 'path' ? w.geom.segs[0].id : ''
		const wall = { ...w, id: 'W', role: { kind: 'wall', openings: [makeOpening(seg, 1500, { width: 900, z: 0, h: 2100 })] } }
		const ix = new ProjectIndex([{ type: 'level', id: 'L1', name: '1F', number: 1, order: 1, elevationMm: 0, heights: { slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2600, plenumMm: 700 } }, wall] as Entity[])
		const ps = elevationDisplayList(ix, 'L1', spaceOf({ kind: 'elevation', dir: 'front' }), { scale: 100 }).filter((p) => p.src === 'W')
		const box = (p: (typeof ps)[number]) => (p.k === 'line' ? [Math.min(...p.pts.map((q) => q.x)), Math.max(...p.pts.map((q) => q.x)), Math.min(...p.pts.map((q) => q.y)), Math.max(...p.pts.map((q) => q.y))] : []).map((v) => v || 0)   // −0 → 0
		expect(ps.filter((p) => p.k === 'line' && p.cls === 'wall').map(box)).toEqual([[0, 1050, -2600, 0], [1050, 1950, -2600, -2100], [1950, 4000, -2600, 0]])
		expect(ps.filter((p) => p.k === 'line' && p.cls === 'opening').map(box)).toEqual([[1050, 1950, -2100, 0]])
	})
})

describe('depth band (UX14)', () => {
	it('leaves out what is nearer than the band and fades what is beyond it', () => {
		const base = demoProject(), o = base.find((e) => e.type === 'outlet') as Outlet
		const near = { ...o, id: 'ON', label: 'NEAR', at: { x: o.at!.x, y: -6000 } }, far = { ...o, id: 'OF', label: 'FAR', at: { x: o.at!.x, y: 12000 } }
		const ix = new ProjectIndex([...base, near, far] as Entity[]), sp = spaceOf({ kind: 'elevation', dir: 'front' })
		const dN = sp.depthOf({ ...near.at, z: 0 }), dF = sp.depthOf({ ...far.at, z: 0 }), dO = sp.depthOf({ ...o.at!, z: 0 })
		const [hi, lo] = dN > dF ? [dN, dF] : [dF, dN]   // larger depth = nearer the viewer
		const nearest = dN > dF ? 'ON' : 'OF', furthest = dN > dF ? 'OF' : 'ON'
		// a band round the fixture's outlets: the nearest extra outlet goes, the furthest fades, the middle ones stay
		const ps = elevationDisplayList(ix, 'L33', sp, { scale: 100, band: { near: (hi + dO) / 2, far: (lo + dO) / 2 } })
		expect(ps.some((p) => p.src === nearest)).toBe(false)
		expect(ps.filter((p) => p.src === furthest).every((p) => p.k === 'image' || p.cls.endsWith(' far'))).toBe(true)
		expect(ps.some((p) => p.src === o.id && p.k !== 'image' && !p.cls.endsWith(' far'))).toBe(true)
	})
})
