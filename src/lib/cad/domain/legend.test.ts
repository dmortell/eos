// Legends, boxes, a sheet from the current view, new layers hidden in existing drawings (User, 2026-10-05).
import { describe, it, expect } from 'vitest'
import { ProjectIndex } from './project'
import { demoProject } from './fixtures'
import { legendCandidates, legendShown } from './legend'
import { freezeInExisting } from './layers'
import { BUILTIN_BLOCKS } from './blocks'
import { planDisplayList } from '../views/plan'
import { viewViewport, drawingArea, freeSpot } from '../views/sheet'
import { EntityStore } from '../store/store'
import { ShapeTool } from '../editor/shapeTool'
import { spaceOf, PLAN } from '../views/space'
import type { Shape } from './shapes'
import type { Sheet, Entity } from './drawing'
import type { ToolCtx } from '../editor/tools'

const blockOf = (id: string) => BUILTIN_BLOCKS.find((b) => b.id === id)
const ents = demoProject()
const ix = new ProjectIndex(ents)

describe('legends', () => {
	it('lists the symbols in use with counts (A → Z), then the layers with items; by default the symbols', () => {
		const all = legendCandidates(ix, new Set(['L33']), blockOf)
		const blocks = all.filter((r) => r.kind === 'block'), layers = all.filter((r) => r.kind === 'layer')
		expect(blocks.length).toBeGreaterThan(0)
		expect(blocks.reduce((n, r) => n + r.count, 0)).toBe(ix.outlets.filter((o) => o.levelId === 'L33' && o.at).length)
		expect(layers.some((r) => r.id === 'sys:outlets-low' || r.id === 'sys:outlets-high')).toBe(true)
		expect(legendShown(all, undefined)).toEqual(blocks)
		expect(legendShown(all, [layers[0].key])).toEqual([layers[0]])
	})
	it('a legend on the plan draws its rows (a name and count each), all its own', () => {
		const lg = { type: 'shape', id: 'LG', levelId: 'L33', geom: { kind: 'legend', at: { x: 0, y: 0 }, title: 'Key' } } as unknown as Shape
		const ps = planDisplayList(new ProjectIndex([...ents, lg]), 'L33', { scale: 100, blocks: blockOf }).filter((p) => p.src === 'LG')
		const texts = ps.filter((p) => p.k === 'text').map((p) => (p.k === 'text' ? p.text : ''))
		expect(texts[0]).toBe('Key')
		expect(texts.length).toBe(1 + 2 * legendShown(legendCandidates(ix, new Set(['L33']), blockOf), undefined).length)
	})
})

describe('boxes', () => {
	it('the Box tool draws a rectangle with a height and Z on the plan', () => {
		const store = new EntityStore()
		store.load(ents)
		const ctx = { store, index: new ProjectIndex(store.all()), levelId: 'L33', space: spaceOf(PLAN), work: { z: 0, depth: 0 }, snap: (p: { x: number; y: number }) => ({ p, kind: 'grid' }), tol: () => 10, select: () => {}, say: () => {} } as unknown as ToolCtx
		const t = new ShapeTool(() => ({ kind: 'rect', sides: 4, inscribed: true, height: 750, z: 100 }), 'box')
		t.down({ p: { x: 0, y: 0 }, shift: false, ctrl: false, alt: false }, ctx); t.down({ p: { x: 1600, y: 800 }, shift: false, ctrl: false, alt: false }, ctx)
		const s = store.ofType('shape').at(-1) as Shape
		expect(s).toMatchObject({ extent: 750, plane: { kind: 'plan', z: 100 }, geom: { kind: 'rect', size: { x: 1600, y: 800 } } })
	})
})

describe('a sheet from the current view', () => {
	const sheet = { type: 'sheet', id: 'S', number: 'S1', title: 'T', order: 1, paper: { size: 'A3', orientation: 'landscape', marginMm: 5 }, viewports: [], status: 'active' } as Sheet
	it('centred on what the pane shows, at the largest standard scale it fits at', () => {
		const vp = viewViewport(ix, sheet, { levelId: 'L33', spec: { kind: 'plan' } }, { x0: 0, y0: 0, x1: 20000, y1: 10000 }, 'V')
		expect(vp.centre).toEqual({ x: 10000, y: 5000 })
		expect(vp.scale).toBe(100)   // 200 × 100 mm fits the A3 drawing area; 1:50 (400 × 200) doesn't
		expect(vp.rect).toMatchObject({ w: 200, h: 100 })
	})
	it('a plan zoomed out past 1:100: at 1:100, filling the drawing area, centred on the floorplan crop (W18)', () => {
		const ixU = new ProjectIndex([...ix.byId.values(), { type: 'underlay', id: 'U', levelId: 'L33', fileId: 'F', origin: { x: 1000, y: 0 } } as Entity])
		const underlay = () => ({ url: '', x: -5000, y: -5000, w: 84000, h: 59400, clip: { x0: 0, y0: 0, x1: 40000, y1: 20000 } })
		const vp = viewViewport(ixU, sheet, { levelId: 'L33', spec: { kind: 'plan' } }, { x0: -5000, y0: -5000, x1: 79000, y1: 54400 }, 'V', { underlay })
		expect(vp.scale).toBe(100)
		expect(vp.centre).toEqual({ x: 21000, y: 10000 })   // the crop's middle, moved by the floorplan's X offset
		const a = drawingArea(ixU, sheet)
		expect(vp.rect).toEqual({ x: a.x + 5, y: a.y + 5, w: a.w - 10, h: a.h - 10 })
		// a second view onto the same sheet goes beside the first, not on top of it (W22)
		const room = { x: 10, y: 10, w: 300, h: 200 }, first = { ...vp, rect: { x: 10, y: 10, w: 100, h: 80 } }
		expect(freeSpot({ viewports: [] }, room, 100, 80)).toEqual({ x: 10, y: 10 })
		expect(freeSpot({ viewports: [first] }, room, 100, 80)).toEqual({ x: 115, y: 10 })     // beside it, 5 mm clear
		expect(freeSpot({ viewports: [first] }, room, 250, 80)).toEqual({ x: 10, y: 95 })      // too wide beside: below
		expect(freeSpot({ viewports: [first] }, room, 300, 200)).toEqual({ x: 10, y: 10 })     // no room: top-left
		// no floorplan: the middle of what the pane shows
		expect(viewViewport(ix, sheet, { levelId: 'L33', spec: { kind: 'plan' } }, { x0: 0, y0: 0, x1: 80000, y1: 40000 }, 'V').centre).toEqual({ x: 40000, y: 20000 })
	})
})

describe('floorplans on their own (W7)', () => {
	const u = (id: string, x: Partial<Entity> = {}) => ({ type: 'underlay', id, levelId: 'L33', fileId: `${id}.pdf`, ...x }) as Entity
	const underlay = (z: { fileId: string }) => ({ url: `blob:${z.fileId}`, x: 0, y: 0, w: 100, h: 50 })
	const images = (ents: Entity[], compare?: (z: { fileId: string; prevFileId?: string }) => string | undefined) =>
		planDisplayList(new ProjectIndex([...ents, ...demoProject().filter((e) => e.type !== 'underlay')]), 'L33', { scale: 100, underlay, compare }).filter((p) => p.k === 'image')
	it('a hidden one isn’t drawn; each keeps its own fade', () => {
		const ps = images([u('A', { opacity: 0.15 }), u('B', { hidden: true })])
		expect(ps.map((p) => p.k === 'image' && [p.url, p.opacity])).toEqual([['blob:A.pdf', 0.15]])
	})
	it('compared: the other revision in red UNDER it, not pickable; off = nothing extra', () => {
		const ents = [u('A', { prevFileId: 'old.pdf' })]
		expect(images(ents)).toHaveLength(1)
		const ps = images(ents, (z) => z.prevFileId)
		expect(ps.map((p) => p.k === 'image' && [p.url, p.tint, p.src])).toEqual([['blob:old.pdf', 'red', undefined], ['blob:A.pdf', undefined, 'A']])
	})
})

describe('new layers in existing drawings', () => {
	it('start frozen in every viewport that exists', () => {
		const vp = { id: 'V', view: { levelId: 'L33', spec: PLAN }, rect: { x: 0, y: 0, w: 1, h: 1 }, scale: 100, centre: { x: 0, y: 0 } }
		const sheets = [{ type: 'sheet', id: 'S', viewports: [vp, { ...vp, id: 'W', frozen: ['X'] }] }, { type: 'sheet', id: 'E', viewports: [] }] as unknown as Sheet[]
		const out = freezeInExisting(sheets, 'NEW')
		expect(out.map((s) => s.id)).toEqual(['S'])
		expect(out[0].viewports.map((v) => v.frozen)).toEqual([['NEW'], ['X', 'NEW']])
	})
})
