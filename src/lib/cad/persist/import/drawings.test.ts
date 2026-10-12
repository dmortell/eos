// File › Import legacy drawings, against docs shaped like Project Journey's (Pages "Zone 3303", Sheets-tool sheets).
import { describe, it, expect } from 'vitest'
import { planDrawings, levelForDocId, levelForName, levelForSheet, type DrawingsSource, type DrawingsChoice } from './drawings'
import { prismShape, wallShape, ngonFootprint, openingIn, type PagesModel, type PagesPrism } from './drawingsPages'
import { annotationShapes, clipFrame, clipSection, nearestScale, sectionNameFor, viewportOf, type Clip, type LegacyVp } from './drawingsSheets'
import { outlineOf, type Shape } from '../../domain/shapes'
import { validateShape } from '../../domain/validate'
import { namedFrame, project, type ElevDir } from '../../domain/conventions'
import { planOpenings } from '../../domain/openings'
import { toPaper } from '../../views/sheet'
import { sectionFrame, sectionSpace } from '../../views/section'
import { spaceOf } from '../../views/space'
import type { Entity, SectionCut, Sheet } from '../../domain/drawing'
import type { Level } from '../../domain/types'

let n = 0
const id = () => `id${++n}`
const level = (lid: string, name: string, number: number, area?: string): Level => ({ type: 'level', id: lid, buildingId: 'b', name, number, order: number, elevationMm: 0, heights: { slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2600, plenumMm: 700 }, ...(area ? { area } : {}) })
// Journey: the 33F main plan is the 3303 office; 3307 is an area plan
const LEVELS = [level('L12', '12F', 12), level('L30', '30F', 30), level('L3303', '33F 3303', 33), level('L3307', '33F 3307', 33, '3307')]
const near = (a: { x: number; y: number }[], b: { x: number; y: number }[]) => {
	expect(a).toHaveLength(b.length)
	for (const p of b) expect(a.some((q) => Math.abs(q.x - p.x) < 1e-6 && Math.abs(q.y - p.y) < 1e-6)).toBe(true)
}

const zone: PagesModel = {
	id: 'm-3cQp1Lo', name: 'Zone 3303', placeId: 'plx',
	layers: [{ id: 'walls', name: 'Walls' }, { id: 'furniture', name: 'Furniture', color: '#16a34a' }, { id: 'openings', name: 'Openings', opening: true }, { id: 'trunks', name: 'Trunks' }],
	objects: [
		{ type: 'prism', id: 'desk1', x: 1000, y: 2000, z: 0, w: 1600, d: 800, h: 720, edges: 4, layer: 'furniture' },
		{ type: 'prism', id: 'desk2', x: 1000, y: 3000, z: 0, w: 1600, d: 800, h: 720, edges: 4, rot: 30, layer: 'furniture', groupId: 'g1' },
		{ type: 'prism', id: 'col', x: 0, y: 0, z: 0, w: 400, d: 400, h: 2800, edges: 4 },
		{ type: 'prism', id: 'door', x: 500, y: -75, z: 0, w: 900, d: 150, h: 2100, edges: 4, layer: 'openings', open: 'door' },
		{ type: 'prism', id: 'rk', x: 5000, y: 5000, z: 0, w: 600, d: 1000, h: 2000, edges: 4, layer: 'walls', rack: { u: 42 }, label: 'R01' },
		{ type: 'wall', id: 'w1', layer: 'walls', thickness: 150, h: 2800, nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 4000, y: 0, z: 0 }, { id: 'c', x: 4000, y: 3000, z: 0 }], segments: [{ id: 's1', a: 'a', b: 'b' }, { id: 's2', a: 'b', b: 'c', h: 3000 }] },
		{ type: 'conduit', id: 'c1', layer: 'trunks' },
	],
	shapes: [{ kind: 'insert' }, { kind: 'insert' }, { kind: 'text' }],
}

describe('Pages prism → cad box', () => {
	it('the box stands on the same footprint Pages drew: corner + half the size is its centre', () => {
		const s = prismShape(zone.objects![0] as never, 'L3303', { importedFrom: 'k' }, id)
		expect(s.geom).toMatchObject({ kind: 'rect', centre: { x: 1800, y: 2400 }, size: { x: 1600, y: 800 } })
		expect(s.plane).toEqual({ kind: 'plan', z: 0 })
		expect(s.extent).toBe(720)
		expect(validateShape(s)).toEqual([])
	})
	it('a turned box turns about its centre the way Pages turned it (same on-screen sense)', () => {
		const p = zone.objects![1] as never as { x: number; y: number; w: number; d: number; rot: number }
		const s = prismShape(p as never, 'L3303', { importedFrom: 'k' }, id)
		near(outlineOf(s.geom)!, ngonFootprint(p.x, p.y, p.w, p.d, 4, p.rot))
	})
	it('a prism of other than 4 edges keeps Pages\' n-gon, inscribed in its box', () => {
		const s = prismShape({ type: 'prism', x: 0, y: 0, z: 100, w: 400, d: 400, h: 1000, edges: 16 }, 'L', { importedFrom: 'k' }, id)
		expect(s.geom.kind).toBe('polygon')
		const pts = (s.geom as { pts: { x: number; y: number }[] }).pts
		expect(pts).toHaveLength(16)
		expect(Math.min(...pts.map((p) => p.x))).toBeCloseTo(0); expect(Math.max(...pts.map((p) => p.x))).toBeCloseTo(400)
		expect(s.extent).toBe(1000)
		expect(validateShape(s)).toEqual([])
	})
})

describe('Pages wall → cad wall', () => {
	it('keeps the node graph and its thickness × height, a segment\'s own height as that segment\'s section', () => {
		const s = wallShape(zone.objects![5] as never, 'L3303', { importedFrom: 'k' }, id)!
		expect(s.role).toEqual({ kind: 'wall', openings: [] })
		expect(s.section).toMatchObject({ w: 150, h: 2800 })
		const g = s.geom as Extract<Shape['geom'], { kind: 'path' }>
		expect(g.nodes.map((p) => [p.x, p.y])).toEqual([[0, 0], [4000, 0], [4000, 3000]])
		const byId = new Map(g.nodes.map((p) => [p.id, p]))
		expect(g.segs.map((sg) => [byId.get(sg.a)!.x, byId.get(sg.b)!.y])).toEqual([[0, 0], [4000, 3000]])
		expect(g.segs[0].section).toBeUndefined()
		expect(g.segs[1].section).toMatchObject({ w: 150, h: 3000 })
		expect(validateShape(s)).toEqual([])
	})
})

describe('which cad level a legacy drawing goes on', () => {
	it('an Outlets doc id → that floor\'s plan, an area doc → that area\'s plan; an unknown floor → none (the dialog asks)', () => {
		expect(levelForDocId('P', 'P_F33', LEVELS)).toBe('L3303')
		expect(levelForDocId('P', 'P_F33__3307', LEVELS)).toBe('L3307')
		expect(levelForDocId('P', 'P_F3307', LEVELS)).toBe('L3307')
		expect(levelForDocId('P', 'P_F30', LEVELS)).toBe('L30')
		expect(levelForDocId('P', 'P_F10', LEVELS)).toBeUndefined()
	})
	it('a model name with the office number → that office\'s level', () => {
		expect(levelForName('Zone 3303', LEVELS)).toBe('L3303')
		expect(levelForName('3303 office', LEVELS)).toBe('L3303')
		expect(levelForName('Zone 3307', LEVELS)).toBe('L3307')
		expect(levelForName('Hibiya Midtown', LEVELS)).toBeUndefined()
	})
	it('a sheet whose viewport shows an old floor doc goes by its title: "3307 Sensaphone" → the 3307 area plan', () => {
		const src: DrawingsSource = { pid: 'P', models: [], models3d: [], sheetLayers: [], sheets: [] }
		const d = { id: 's', title: '3307 Sensaphone', viewports: [{ id: 'v', x: 0, y: 0, w: 100, h: 100, source: { kind: 'outlets', outletsDocId: 'P_F10' } }] }
		expect(levelForSheet(src, d, LEVELS)).toBe('L3307')
		expect(levelForSheet(src, { ...d, title: '30F Sensaphone' }, LEVELS)).toBe('L30')
	})
})

describe('Sheets annotations → notes tied to the viewport', () => {
	const owner = { sheetId: 'S', vpId: 'V' }
	it('a dimension measures between the same two view points', () => {
		const { shapes } = annotationShapes({ id: 'a', kind: 'dimension', x: -1000, y: 2444, x2: -1002, y2: 21614, start: 'tick', end: 'tick' }, owner, 100, 'k', id)
		expect(shapes[0]).toMatchObject({ sheetId: 'S', vpId: 'V', geom: { kind: 'dimension', a: { x: -1000, y: 2444 }, b: { x: -1002, y: 21614 }, mode: 'aligned' } })
	})
	it('a text sits where it was drawn (first baseline one font height under the box top), its size in paper mm', () => {
		const { shapes } = annotationShapes({ id: 't', kind: 'text', x: 100, y: 200, text: 'IDF1', fontPt: 72 }, owner, 50, 'k', id)
		expect(shapes[0].geom).toMatchObject({ kind: 'text', text: 'IDF1', at: { x: 100 } })
		const g = shapes[0].geom as { at: { y: number }; sizeMm: number }
		expect(g.sizeMm).toBeCloseTo(25.4)
		expect(g.at.y).toBeCloseTo(200 + 25.4 * 50)
	})
	it('a rect keeps its box and fill; no color = the Sheets tool\'s red', () => {
		const { shapes } = annotationShapes({ id: 'r', kind: 'rect', x: 4192, y: -2179, w: 200, h: 437, fill: '#16a34a' }, owner, 100, 'k', id)
		expect(shapes[0].geom).toEqual({ kind: 'rect', centre: { x: 4292, y: -1960.5 }, size: { x: 200, y: 437 } })
		expect(shapes[0].style).toEqual({ stroke: '#dc2626', fill: '#16a34a' })
	})
	it('a callout is a leader whose tip is the callout\'s pointer and whose words sit at its box', () => {
		const { shapes } = annotationShapes({ id: 'c', kind: 'callout', x: 1000, y: 1000, x2: 0, y2: 3000, text: 'C-WORK\nrope sensor', border: 'box' }, owner, 100, 'k', id)
		const g = shapes[0].geom as { kind: string; pts: { x: number; y: number }[]; text: string; border: string }
		expect(g.kind).toBe('leader')
		expect(g.pts[0]).toEqual({ x: 0, y: 3000 })
		expect(g.pts.at(-1)!.x).toBeLessThan(1000)          // just left of the box, words going right into it
		expect(g.pts.at(-1)!.x).toBeGreaterThan(g.pts.at(-2)!.x)
		expect(g.text).toBe('C-WORK\nrope sensor'); expect(g.border).toBe('box')
	})
	it('an elevation tag points the way its arm did; a grid is left out with a reason', () => {
		const { shapes } = annotationShapes({ id: 'e', kind: 'symbol', symbol: 'elevation', x: 0, y: 0, w: 1000, h: 1000, link: { ref: '10' }, arms: { s: null, e: '' } }, owner, 100, 'k', id)
		expect(shapes).toHaveLength(1)
		expect(shapes[0].geom).toMatchObject({ kind: 'insert', blockId: 'builtin:elevation-tag', at: { x: 500, y: 500 }, rot: 90, attrs: { ON_SHEET: '10' } })
		expect(annotationShapes({ id: 'g', kind: 'grid', x: 0, y: 0 }, owner, 100, 'k', id).skip).toBeTruthy()
	})
})

describe('a Sheets viewport → a cad viewport', () => {
	const vp = (over: Partial<LegacyVp>): LegacyVp => ({ id: 'v', x: 20, y: 20, w: 190, h: 145, source: { kind: 'outlets', outletsDocId: 'P_F33' }, ...over })
	it('a set scale and pan show the same view point at the same paper point (top-left of the window = the pan)', () => {
		const r = viewportOf(vp({ scale: 100, contentOffsetMm: { x: -8000, y: -22000 } }), 'L', 'V')
		if ('skip' in r) throw new Error(r.skip)
		expect(r.vp.scale).toBe(100)
		const p = toPaper(r.vp)({ x: -8000, y: -22000 })
		expect(p.x).toBeCloseTo(20); expect(p.y).toBeCloseTo(20)
	})
	it('a model3d LEFT elevation (y-up model3d) frames the clip box where cad\'s left frame sees it', () => {
		const clip = { x0: -1465, x1: -286, y0: 6035, y1: 11574, z0: -150, z1: 4150 }
		const f = clipFrame('left', clip)
		// a point inside the clip box, in cad plan mm (y_cad = −y_m3), seen by cad's left elevation
		const e = project(namedFrame('left'), { x: -800, y: -8000, z: 1000 })
		expect(e.u).toBeGreaterThan(f.x); expect(e.u).toBeLessThan(f.x + f.w)
		expect(-e.v).toBeGreaterThan(f.y); expect(-e.v).toBeLessThan(f.y + f.h)
		const r = viewportOf(vp({ scale: 0, source: { kind: 'model3d', modelId: 3, direction: 'left', clip } }), 'L', 'V')
		if ('skip' in r) throw new Error(r.skip)
		expect(r.vp.view.spec).toEqual({ kind: 'elevation', dir: 'left' })
		// fitted: the whole framed box fits the window
		expect(f.w / r.vp.scale).toBeLessThanOrEqual(190 + 0.1); expect(f.h / r.vp.scale).toBeLessThanOrEqual(145 + 0.1)
	})
})

describe('planDrawings (the whole import, one transaction\'s worth)', () => {
	const src: DrawingsSource = {
		pid: 'P', models: [zone], models3d: [{ id: 3, name: '3303 office', layers: [{ id: 'L1', name: 'Furniture' }] }],
		sheetLayers: [{ id: 'Lhidden' }],
		sheets: [{
			id: 'jd', title: '3303 Sensaphone', drawingNumber: '004', paper: { paperSize: 'A3', orientation: 'landscape', margins: 10 },
			titleBlock: { fields: { drawnBy: 'DM', checkedBy: null } },
			viewports: [{ id: 'v1', x: 10, y: 10, w: 360, h: 277, scale: 100, contentOffsetMm: { x: -8168, y: -22714 }, source: { kind: 'outlets', outletsDocId: 'P_F33' },
				layerOverrides: { Lhidden: { hidden: true }, outlets: { hidden: true } },
				annotations: [{ id: 'a1', kind: 'text', x: 0, y: 0, text: 'Sensor' }, { id: 'a2', kind: 'rect', x: 0, y: 0, w: 10, h: 10, layerId: 'Lhidden' }, { id: 'a3', kind: 'grid', x: 0, y: 0 }] }],
		}],
	}
	const choice: DrawingsChoice = { models: [{ id: 'm-3cQp1Lo', levelId: 'L3303', prism: true, wall: true }], sheets: [{ id: 'jd', levelId: 'L3303' }] }
	const existing: Entity[] = [...LEVELS, { type: 'sheet', id: 'S1', number: 'S001', title: 'Old', order: 1, paper: { size: 'A3', orientation: 'landscape', marginMm: 5 }, status: 'active', viewports: [{ id: 'ov', view: { levelId: 'L3303', spec: { kind: 'plan' } }, rect: { x: 0, y: 0, w: 1, h: 1 }, scale: 100, centre: { x: 0, y: 0 } }] }]

	it('brings the boxes and walls (not the rack, conduits or 2D shapes) onto layers named as in Pages', () => {
		const p = planDrawings(src, choice, existing, { makeId: id })
		const shapes = p.entities.filter((e): e is Shape => e.type === 'shape' && !!e.levelId)
		expect(p.counts.boxes).toBe(3); expect(p.counts.walls).toBe(1); expect(p.counts.openings).toBe(1)
		expect(shapes.every((s) => s.levelId === 'L3303' && s.importedFrom?.startsWith('pages:m-3cQp1Lo:'))).toBe(true)
		const furniture = p.entities.find((e) => e.type === 'layer' && e.name === 'Furniture')!
		expect(shapes.find((s) => s.importedFrom === 'pages:m-3cQp1Lo:desk1')!.layerId).toBe(furniture.id)
		// "Walls" is the system layer of that name — not a second one
		expect(shapes.find((s) => s.role?.kind === 'wall')!.layerId).toBe('sys:walls')
		// the door became an opening in the wall, so no "Openings" layer is needed
		expect(p.counts.layers).toEqual(['Furniture'])
		const wall = shapes.find((s) => s.role?.kind === 'wall')!
		expect(wall.role).toMatchObject({ kind: 'wall', openings: [{ at: 950, width: 900, z: 0, h: 2100, importedFrom: 'pages:m-3cQp1Lo:door' }] })
		expect(p.notes.some((t) => t.includes('R01'))).toBe(true)
		// the desk in a Pages group is in a cad group
		expect(shapes.find((s) => s.importedFrom === 'pages:m-3cQp1Lo:desk2')!.groupId).toBeTruthy()
	})
	it('a new layer is frozen in the sheets that already existed, not in the imported ones', () => {
		const p = planDrawings(src, choice, existing, { makeId: id })
		const old = p.entities.find((e) => e.id === 'S1') as Sheet
		const made = p.entities.find((e) => e.type === 'sheet' && e.importedFrom === 'sheets:jd') as Sheet
		const furniture = p.entities.find((e) => e.type === 'layer' && e.name === 'Furniture')!
		expect(old.viewports[0].frozen).toContain(furniture.id)
		expect(made.viewports[0].frozen ?? []).not.toContain(furniture.id)
	})
	it('makes the sheet with its number, paper, title-block fields and a plan viewport of the matched level; notes tied to it', () => {
		const p = planDrawings(src, choice, existing, { makeId: id })
		const s = p.entities.find((e) => e.type === 'sheet' && e.importedFrom === 'sheets:jd') as Sheet
		expect(s).toMatchObject({ number: '004', title: '3303 Sensaphone', paper: { size: 'A3', orientation: 'landscape', marginMm: 10 }, titleBlock: { fields: { drawn: 'DM' } } })
		expect(s.viewports[0].view).toEqual({ levelId: 'L3303', spec: { kind: 'plan' } })
		expect(s.viewports[0].frozen).toEqual(expect.arrayContaining(['sys:outlets-low', 'sys:outlets-high']))
		const notes = p.entities.filter((e): e is Shape => e.type === 'shape' && e.sheetId === s.id)
		// the rect on a layer hidden in that viewport didn't print, so it doesn't come; the grid is listed as left out
		expect(notes).toHaveLength(1)
		expect(notes[0].vpId).toBe(s.viewports[0].id)
		expect(p.notes.some((t) => t.includes('grid'))).toBe(true)
		expect(p.notes.some((t) => t.includes('hidden'))).toBe(true)
	})
	it('importing again adds nothing that is already there', () => {
		const first = planDrawings(src, choice, existing, { makeId: id })
		const again = planDrawings(src, choice, [...existing, ...first.entities], { makeId: id })
		expect(again.entities.filter((e) => e.type === 'shape' || e.type === 'sheet' || e.type === 'layer')).toEqual([])
		expect(again.counts.already).toBe(6)   // 3 boxes + 1 opening + 1 wall + 1 sheet
	})
})

describe('Pages opening boxes → openings in the imported walls', () => {
	// Journey: a wall running down the sheet, 100 thick; a door 100 × 700 × 2100 and a hole 100 × 200 × 200 in it
	const wall = wallShape({ type: 'wall', thickness: 100, h: 2700, nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 0, y: 5000 }], segments: [{ id: 's', a: 'a', b: 'b' }] }, 'L', { importedFrom: 'w' }, id)!
	const door: PagesPrism = { type: 'prism', id: 'd', x: -50, y: 1000, z: 0, w: 100, d: 700, h: 2100, edges: 4, open: 'door' }
	const hole: PagesPrism = { type: 'prism', id: 'h', x: -50, y: 3000, z: 900, w: 100, d: 200, h: 200, edges: 4 }
	it('sits on the segment under its footprint centre, as wide as its side along the wall, from its z up its h', () => {
		const r = openingIn(door, [wall], 'k', id)!
		expect(r.opening).toMatchObject({ at: 1350, width: 700, z: 0, h: 2100, importedFrom: 'k' })
		expect(validateShape(r.wall)).toEqual([])
		const h = openingIn(hole, [r.wall], 'k2', id)!
		expect(h.opening).toMatchObject({ at: 3100, width: 200, z: 900, h: 200 })
		expect(h.opening.swing).toBeUndefined()   // below door height: a plain hole
		expect((h.wall.role as { openings: unknown[] }).openings).toHaveLength(2)
	})
	it('a box turned 90° measures its width along the wall all the same', () => {
		const r = openingIn({ ...door, x: -350, y: 1300, w: 700, d: 100, rot: 90 }, [wall], 'k', id)!
		expect(r.opening.width).toBe(700)
		expect(r.opening.at).toBeCloseTo(1350)
	})
	it('a door hinges at the jamb Pages drew and its leaf opens to the same side', () => {
		for (const flip of [false, true]) {
			const r = openingIn({ ...door, flip }, [wall], 'k', id)!
			const p = planOpenings(r.wall, r.opening.segId, 100)
			const [hinge, open] = p.swings[0]
			// Pages (3dview doorGeom): a door longer along y hinges at its top (bottom when flipped), the leaf opening to −x
			expect(hinge.y).toBeCloseTo(flip ? 1700 : 1000)
			expect(open.x).toBeLessThan(hinge.x)
		}
	})
	it('a box in no wall stays out (the caller keeps it as a box)', () => {
		expect(openingIn({ ...door, x: 2000 }, [wall], 'k', id)).toBeNull()
	})
	it('with its walls not ticked and none imported before, an opening box comes as a plain box and says so', () => {
		const p = planDrawings({ pid: 'P', models: [zone], models3d: [], sheetLayers: [], sheets: [] }, { models: [{ id: zone.id, levelId: 'L3303', prism: true, wall: false }], sheets: [] }, [...LEVELS], { makeId: id })
		expect(p.counts.openings).toBe(0); expect(p.counts.boxes).toBe(4)
		expect(p.notes.some((t) => t.includes('not in an imported wall'))).toBe(true)
	})
	it('importing the boxes later puts the openings into the walls imported before', () => {
		const ch = (prism: boolean, wall: boolean): DrawingsChoice => ({ models: [{ id: zone.id, levelId: 'L3303', prism, wall }], sheets: [] })
		const src: DrawingsSource = { pid: 'P', models: [zone], models3d: [], sheetLayers: [], sheets: [] }
		const first = planDrawings(src, ch(false, true), [...LEVELS], { makeId: id })
		const later = planDrawings(src, ch(true, false), [...LEVELS, ...first.entities], { makeId: id })
		const w = later.entities.find((e): e is Shape => e.type === 'shape' && e.role?.kind === 'wall')!
		expect(w.id).toBe(first.entities.find((e) => e.type === 'shape' && e.role?.kind === 'wall')!.id)
		expect((w.role as { openings: unknown[] }).openings).toHaveLength(1)
	})
})

describe('a clipped model3d elevation → a section on its clip box', () => {
	const clip: Clip = { x0: -1465, x1: -286, y0: 6035, y1: 11574, z0: -150, z1: 4150 }
	// a point on the clip box's near face as each direction sees it (cad plan mm, y_cad = −y_m3)
	const onNear: Record<ElevDir, { x: number; y: number; z: number }> = {
		front: { x: -900, y: -6035, z: 1000 }, rear: { x: -900, y: -11574, z: 1000 },
		left: { x: -1465, y: -8000, z: 1000 }, right: { x: -286, y: -8000, z: 1000 },
	}
	const DIRS: ElevDir[] = ['front', 'rear', 'left', 'right']
	it('the cut looks the way the elevation did, along the near face, across the box, as deep as the box', () => {
		for (const dir of DIRS) {
			const c = clipSection(dir, clip)
			const sec: SectionCut = { type: 'section', id: 'S', levelId: 'L', name: 'A', a: c.a, b: c.b, depth: c.depth }
			const { f, len } = sectionFrame(sec), nf = namedFrame(dir)
			expect(f.n.x).toBeCloseTo(nf.n.x); expect(f.n.y).toBeCloseTo(nf.n.y)
			expect(len).toBeCloseTo(dir === 'front' || dir === 'rear' ? clip.x1 - clip.x0 : clip.y1 - clip.y0)
			expect(c.depth).toBeCloseTo(dir === 'front' || dir === 'rear' ? clip.y1 - clip.y0 : clip.x1 - clip.x0)
			// the near face is the cut (depth 0), the opposite face `depth` beyond it; a point in front of the box is outside
			const sp = sectionSpace(sec)
			expect(sp.depthOf(onNear[dir])).toBeCloseTo(0)
			const opposite = { x: clip.x0 + clip.x1 - onNear[dir].x, y: -(clip.y0 + clip.y1) - onNear[dir].y, z: 1000 }
			expect(sp.depthOf(opposite)).toBeCloseTo(-c.depth)
			const inFront = { x: onNear[dir].x + nf.n.x * 500, y: onNear[dir].y + nf.n.y * 500, z: 1000 }
			expect(sp.depthOf(inFront)).toBeGreaterThan(50)
			// and its u is the elevation's, shifted by du
			expect(sp.fromWorld(onNear[dir]).x).toBeCloseTo(spaceOf({ kind: 'elevation', dir }).fromWorld(onNear[dir]).x + c.du)
		}
	})
	it('a point on the near face, and a note drawn on it, land at the same paper point as in the elevation', () => {
		for (const dir of DIRS) {
			const elevAt = spaceOf({ kind: 'elevation', dir }).fromWorld(onNear[dir])
			const fr = clipFrame(dir, clip)
			const lv: LegacyVp = { id: 'v', x: 20, y: 20, w: 190, h: 145, scale: 50, contentOffsetMm: { x: fr.x, y: fr.y }, source: { kind: 'model3d', modelId: 3, direction: dir, clip },
				annotations: [{ id: 'r', kind: 'rect', x: elevAt.x - 100, y: elevAt.y - 50, w: 200, h: 100 }] }
			const before = viewportOf(lv, 'L3303', 'V')
			if ('skip' in before) throw new Error(before.skip)
			const want = toPaper(before.vp)(elevAt)
			const src: DrawingsSource = { pid: 'P', models: [], models3d: [{ id: 3, name: '3303 office' }], sheetLayers: [], sheets: [{ id: `e-${dir}`, title: 'Comms1 elevation', viewports: [lv] }] }
			const p = planDrawings(src, { models: [], sheets: [{ id: `e-${dir}`, levelId: 'L3303' }] }, [...LEVELS], { makeId: id })
			const sec = p.entities.find((e): e is SectionCut => e.type === 'section')!
			expect(sec).toMatchObject({ name: 'Comms1', levelId: 'L3303', importedFrom: `sheets:e-${dir}:v` })
			const vp = (p.entities.find((e) => e.type === 'sheet') as Sheet).viewports[0]
			expect(vp.view).toEqual({ levelId: 'L3303', spec: { kind: 'section', sectionId: sec.id } })
			const got = toPaper(vp)(sectionSpace(sec).fromWorld(onNear[dir]))
			expect(got.x).toBeCloseTo(want.x, 1); expect(got.y).toBeCloseTo(want.y, 1)
			const note = p.entities.find((e): e is Shape => e.type === 'shape' && e.vpId === vp.id)!
			const at = toPaper(vp)((note.geom as { centre: { x: number; y: number } }).centre)
			expect(at.x).toBeCloseTo(want.x, 1); expect(at.y).toBeCloseTo(want.y, 1)
		}
	})
	it('importing the sheet again (after deleting it) reuses its section instead of cutting another', () => {
		const lv: LegacyVp = { id: 'v', x: 20, y: 20, w: 190, h: 145, scale: 0, source: { kind: 'model3d', modelId: 3, direction: 'left', clip } }
		const src: DrawingsSource = { pid: 'P', models: [], models3d: [], sheetLayers: [], sheets: [{ id: 'c2', title: '3303 Comms 2 Elevation', viewports: [lv] }] }
		const choice: DrawingsChoice = { models: [], sheets: [{ id: 'c2', levelId: 'L3303' }] }
		const first = planDrawings(src, choice, [...LEVELS], { makeId: id })
		const sec = first.entities.find((e): e is SectionCut => e.type === 'section')!
		expect(sec.name).toBe('Comms 2')
		const again = planDrawings(src, choice, [...LEVELS, sec], { makeId: id })
		expect(again.entities.filter((e) => e.type === 'section')).toEqual([])
		const vp = (again.entities.find((e) => e.type === 'sheet') as Sheet).viewports[0]
		expect(vp.view.spec).toEqual({ kind: 'section', sectionId: sec.id })
		expect(vp.centre).toEqual((first.entities.find((e) => e.type === 'sheet') as Sheet).viewports[0].centre)
	})
	it('names: the sheet title without "elevation" or a leading office number, unique on the level', () => {
		expect(sectionNameFor('Comms1 elevation', new Set())).toBe('Comms1')
		expect(sectionNameFor('3303 Comms 2 Elevation', new Set())).toBe('Comms 2')
		expect(sectionNameFor('Comms1 elevation', new Set(['Comms1']))).toBe('Comms1 (2)')
		expect(sectionNameFor('Elevation', new Set())).toBe('Section')
	})
})

describe('odd Sheets-tool scales → the nearest standard scale', () => {
	it('by ratio: 1:20.16 → 1:20, 1:35.74 → 1:50; a standard one stays', () => {
		expect(nearestScale(20.16)).toBe(20)
		expect(nearestScale(35.74)).toBe(50)
		expect(nearestScale(100)).toBe(100)
	})
	it('the viewport keeps its centre, so the content stays centred; the notes stay put in view mm', () => {
		const lv: LegacyVp = { id: 'v', x: 20, y: 20, w: 190, h: 145, scale: 20.16, contentOffsetMm: { x: 1000, y: 2000 }, source: { kind: 'outlets', outletsDocId: 'P_F33' }, annotations: [{ id: 'r', kind: 'rect', x: 1500, y: 2500, w: 100, h: 100 }] }
		const before = viewportOf(lv, 'L3303', 'V')
		if ('skip' in before) throw new Error(before.skip)
		const src: DrawingsSource = { pid: 'P', models: [], models3d: [], sheetLayers: [], sheets: [{ id: 's', title: '3303 Sensaphone', viewports: [lv] }] }
		const p = planDrawings(src, { models: [], sheets: [{ id: 's', levelId: 'L3303' }] }, [...LEVELS], { makeId: id })
		const vp = (p.entities.find((e) => e.type === 'sheet') as Sheet).viewports[0]
		expect(vp.scale).toBe(20)
		expect(vp.centre).toEqual(before.vp.centre)
		const note = p.entities.find((e): e is Shape => e.type === 'shape' && e.vpId === vp.id)!
		expect(note.geom).toMatchObject({ centre: { x: 1550, y: 2550 } })
		expect(p.notes.some((t) => t.includes('1:20.16 → 1:20'))).toBe(true)
	})
})
