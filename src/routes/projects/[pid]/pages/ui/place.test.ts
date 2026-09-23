import { describe, it, expect } from 'vitest'
import {
	drawPlane, resolveLayer, buildEnt, PRISM_TOOL, trimTail, polylineEnt, GRAPH_TOOL, graphObj, prismObj, guideObj,
	imageWithOrigin, imageScaled, moveEnt, sectionObj, sectionName,
} from './place'
import type { Ent, Pt } from './geometry'
import type { ViewCtx } from './view'
import type { Model, Wall, Conduit, Prism } from '../3dview/types'

const planCtx: ViewCtx = { dir: 'plan', isPlan: true, isElev: false, isIso: false, elevDir: 'front', cx: 14000, cy: 8750, ground: 10250, frameId: 'f', paperMm: 1, mdl: undefined, yaw: 0, pitch: 0 }
const elevCtx = (elevDir: ViewCtx['elevDir'], over: Partial<ViewCtx> = {}): ViewCtx => ({ ...planCtx, dir: elevDir, isPlan: false, isElev: true, elevDir, ...over })
const isoCtx: ViewCtx = { ...planCtx, dir: 'iso', isPlan: false, isIso: true }
const mdl = (over: Partial<Model> = {}): Model => ({ id: 1, name: 'm', objects: [], layers: [{ id: 'walls', name: 'Walls', color: '#000', visible: true, locked: false }, { id: 'openings', name: 'Openings', color: '#000', visible: true, locked: false, opening: true }], ...over })
// Deterministic ids: a counter per prefix so tests can assert exact values.
const ids = () => { let n = 0; return (prefix = 'e') => `${prefix}${++n}` }
const ent = (over: Partial<Ent> = {}): Ent => ({ id: 'e', type: 'rect', a: [0, 0], b: [200, 100], ...over } as Ent)

describe('drawPlane / resolveLayer', () => {
	it('plan and iso draw on the plan plane (undefined); an elevation draws natively in that elevation', () => {
		expect(drawPlane(planCtx)).toBeUndefined()
		expect(drawPlane(isoCtx)).toBeUndefined()
		expect(drawPlane(elevCtx('rear'))).toBe('rear')
	})
	it('resolves a known layer, falls back to the first layer, and is undefined with no layers', () => {
		expect(resolveLayer(mdl(), 'openings')).toBe('openings')
		expect(resolveLayer(mdl(), 'nope')).toBe('walls')
		expect(resolveLayer(mdl({ layers: [] }), 'walls')).toBeUndefined()
		// R5: the list also holds grouped (Background / annotation) layers — an unknown object layer falls
		// back to the first OBJECT layer (no group), never onto a background layer.
		const grouped = { layers: [{ id: 'bg', name: 'bg', color: '#000', visible: true, locked: false, group: 'Background' }, { id: 'desks', name: 'desks', color: '#000', visible: true, locked: false }] }
		expect(resolveLayer(mdl(grouped), 'nope')).toBe('desks')
		expect(resolveLayer(undefined, 'walls')).toBeUndefined()
	})
})

describe('buildEnt', () => {
	const a: Pt = [100, 200], b: Pt = [300, 250]
	it('Line makes a 2-point polyline (R4: the retired line type); Dimension takes a/b as drawn — both with the view plane', () => {
		expect(buildEnt(planCtx, 'Line', a, b, { centerDraw: false, uid: ids() })).toEqual({ id: 'e1', type: 'polyline', pts: [a, b], plane: undefined })
		expect(buildEnt(elevCtx('front'), 'Dimension', a, b, { centerDraw: true, uid: ids() })).toEqual({ id: 'e1', type: 'dim', a, b, plane: 'front' })
	})
	it('Rectangle / Ellipse use the corners as drawn, or centre-out with CEN (first point = centre)', () => {
		expect(buildEnt(planCtx, 'Rectangle', a, b, { centerDraw: false, uid: ids() })).toMatchObject({ type: 'rect', a, b })
		expect(buildEnt(planCtx, 'Ellipse', a, b, { centerDraw: true, uid: ids() })).toMatchObject({ type: 'ellipse', a: [-100, 150], b: [300, 250] })
	})
	it('model / caller-owned tools build nothing here', () => {
		for (const t of ['Furniture', 'Opening', 'Section', 'Text', 'Wall', 'Select', 'Guide']) expect(buildEnt(planCtx, t, a, b, { centerDraw: false, uid: ids() })).toBeNull()
		expect(PRISM_TOOL.Furniture).toEqual({ layer: 'furniture', h: 750, tag: 'f' })
		expect(PRISM_TOOL.Opening).toEqual({ layer: 'openings', h: 2100, tag: 'o' })
	})
})

describe('trimTail / polylineEnt', () => {
	it('drops repeated (zero-length) trailing points only, without touching the input', () => {
		const pts: Pt[] = [[0, 0], [100, 0], [100, 0], [100, 0.001]]
		expect(trimTail(pts)).toEqual([[0, 0], [100, 0]])
		expect(pts).toHaveLength(4)
		expect(trimTail([[0, 0], [100, 0], [100, 50]])).toEqual([[0, 0], [100, 0], [100, 50]])
		expect(trimTail([[5, 5], [5, 5]])).toEqual([[5, 5]])
		expect(trimTail([])).toEqual([])
	})
	it('a trimmed draft with ≥ 2 points becomes a polyline with COPIED points on the view plane; fewer → null', () => {
		const pts: Pt[] = [[0, 0], [100, 0], [100, 0]]
		const pl = polylineEnt(elevCtx('left'), pts, ids())!
		expect(pl).toEqual({ id: 'e1', type: 'polyline', pts: [[0, 0], [100, 0]], plane: 'left' })
		expect(pl.pts![0]).not.toBe(pts[0])
		expect(polylineEnt(planCtx, [[0, 0], [0, 0]], ids())).toBeNull()
		expect(polylineEnt(planCtx, [], ids())).toBeNull()
	})
})

describe('graphObj — plan', () => {
	const noDepth = () => null
	it('Wall: nodes on the floor (z 0), rounded x/y, default profile, walls layer, w-id', () => {
		const w = graphObj({ ...planCtx, mdl: mdl() }, 'Wall', [[0.4, 0.6], [1000.2, 0]], { guide: null, depthSnap: noDepth, uid: ids() }) as Wall & { layer?: string; id?: string }
		expect(w).toMatchObject({ type: 'wall', h: 2800, thickness: 100, layer: 'walls', id: 'w1' })
		expect(w.nodes.map((n) => [n.x, n.y, n.z])).toEqual([[0, 1, 0], [1000, 0, 0]])
		expect(w.segments).toHaveLength(1)
		expect(w.segments[0]).toMatchObject({ a: w.nodes[0].id, b: w.nodes[1].id })
	})
	it('Trunk / Pipe: at the model ceiling-tile level (default 2600), trunks layer, conduit profiles', () => {
		const t = graphObj(planCtx, 'Trunk', [[0, 0], [500, 0]], { guide: null, depthSnap: noDepth, uid: ids() }) as Conduit
		expect(t).toMatchObject({ type: 'conduit', w: 300, h: 150, edges: 4, id: 't1' })
		expect(t.nodes.every((n) => n.z === 2600)).toBe(true)
		const p = graphObj({ ...planCtx, mdl: mdl({ levels: { ceilingTile: 2400 } }) }, 'Pipe', [[0, 0], [500, 0]], { guide: null, depthSnap: noDepth, uid: ids() }) as Conduit
		expect(p).toMatchObject({ type: 'conduit', w: 80, h: 80, edges: 16, id: 'p1', layer: 'walls' })   // no 'trunks' layer → first layer
		expect(p.nodes.every((n) => n.z === 2400)).toBe(true)
	})
	it('a closed run (last point = first) becomes a cycle; a custom layerId is honoured; bad input → null', () => {
		const w = graphObj(planCtx, 'Wall', [[0, 0], [1000, 0], [1000, 1000], [0, 0]], { guide: null, depthSnap: noDepth, uid: ids(), layerId: (id) => 'L:' + id }) as Wall & { layer?: string }
		expect(w.nodes).toHaveLength(3); expect(w.segments).toHaveLength(3); expect(w.layer).toBe('L:walls')
		expect(graphObj(planCtx, 'Line', [[0, 0], [1, 1]], { guide: null, depthSnap: noDepth, uid: ids() })).toBeNull()
		expect(graphObj(planCtx, 'Wall', [[0, 0]], { guide: null, depthSnap: noDepth, uid: ids() })).toBeNull()
		expect(Object.keys(GRAPH_TOOL).sort()).toEqual(['Pipe', 'Trunk', 'Wall'])
	})
})

describe('graphObj — elevation (vertical runs, depth from guide / snap / centre)', () => {
	const front = elevCtx('front'), right = elevCtx('right')
	// front: on-axis = x (elevUInv is identity about cx); z = ground − drawing y, clamped at the floor
	const pts: Pt[] = [[100, 10250], [100, 7250], [400, 7250.4]]
	it('with a selected plan guide, the depth (off-axis) is the guide position for every node', () => {
		const w = graphObj(front, 'Wall', pts, { guide: { id: 'g', plane: 'plan', orient: 'h', pos: 5000 }, depthSnap: () => 999, uid: ids() }) as Wall
		expect(w.nodes.map((n) => [n.x, n.y, n.z])).toEqual([[100, 5000, 0], [100, 5000, 3000], [400, 5000, 3000]])
	})
	it('without a guide, each point asks the depth-snap; null falls back to the plan centre (cy for front/rear)', () => {
		const snap = (p: Pt) => (p[0] === 100 ? 1234 : null)
		const t = graphObj(front, 'Trunk', pts, { guide: null, depthSnap: snap, uid: ids() }) as Conduit
		expect(t.nodes.map((n) => n.y)).toEqual([1234, 1234, planCtx.cy])
		expect(t.nodes.map((n) => n.z)).toEqual([0, 3000, 3000])   // NOT the ceiling-tile default: z comes from the drawing
	})
	it('in a RIGHT elevation the on-axis coord is y (re-centred) and the depth fills x (cx fallback)', () => {
		const p = graphObj(right, 'Pipe', [[14000, 10250], [14500, 8250]], { guide: null, depthSnap: () => null, uid: ids() }) as Conduit
		// elevUInv('right', u) = cy + (u − cx)
		expect(p.nodes.map((n) => [n.x, n.y, n.z])).toEqual([[planCtx.cx, 8750, 0], [planCtx.cx, 9250, 2000]])
		const g = graphObj(right, 'Pipe', [[14000, 10250], [14500, 8250]], { guide: { id: 'g', plane: 'plan', orient: 'v', pos: 777 }, depthSnap: () => null, uid: ids() }) as Conduit
		expect(g.nodes.every((n) => n.x === 777)).toBe(true)
	})
	it('a point dragged below the ground line clamps z to 0', () => {
		const w = graphObj(front, 'Wall', [[0, 10250], [0, 12000]], { guide: null, depthSnap: () => null, uid: ids() }) as Wall
		expect(w.nodes.map((n) => n.z)).toEqual([0, 0])
	})
})

describe('prismObj', () => {
	const ctx = { ...planCtx, mdl: mdl() }
	it('rounds the footprint, normalises a/b order, enforces a 1×1 minimum, z 0, 4 edges', () => {
		const p = prismObj(ctx, [300.4, 250.6], [100.2, 200.1], 'furniture', 750, () => 'f1') as Prism & { layer?: string; id?: string }
		expect(p).toEqual({ type: 'prism', x: 100, y: 200, z: 0, w: 200, d: 51, h: 750, edges: 4, layer: 'walls', id: 'f1' })   // no 'furniture' layer → first
		expect(prismObj(ctx, [10, 10], [10.2, 10.3], 'furniture', 750, () => 'f2')).toMatchObject({ w: 1, d: 1 })
	})
	it('an opening defaults to a door 2100 high regardless of the h passed; extra overrides win', () => {
		expect(prismObj(ctx, [0, 0], [900, 100], 'openings', 750, () => 'o1')).toMatchObject({ open: 'door', z: 0, h: 2100, layer: 'openings', id: 'o1' })
		expect(prismObj(ctx, [0, 0], [900, 100], 'openings', 2100, () => 'o2', { open: 'window', rot: 90 })).toMatchObject({ open: 'window', rot: 90, h: 2100 })
		expect(prismObj(ctx, [0, 0], [900, 100], 'furniture', 750, () => 'f1', { h: 1200 })).toMatchObject({ h: 1200 })
	})
})

describe('guideObj', () => {
	it('plan: h-guide stores the rounded y, v-guide the rounded x, plane "plan"', () => {
		expect(guideObj(planCtx, [123.6, 456.4], false, 'g1')).toEqual({ id: 'g1', plane: 'plan', orient: 'h', pos: 456 })
		expect(guideObj(planCtx, [123.6, 456.4], true, 'g2')).toEqual({ id: 'g2', plane: 'plan', orient: 'v', pos: 124 })
	})
	it('an elevation files the guide on that elevation plane; iso has no drawing plane → null', () => {
		expect(guideObj(elevCtx('left'), [10, 20], false, 'g')).toEqual({ id: 'g', plane: 'left', orient: 'h', pos: 20 })
		expect(guideObj(isoCtx, [10, 20], true, 'g')).toBeNull()
	})
})

describe('imageWithOrigin / imageScaled', () => {
	const img = ent({ id: 'i', type: 'image', a: [1000, 500], b: [0, 0] })   // reversed a/b: rect is 0..1000 × 0..500
	it('origin is the click as a 0..1 anchor of the normalised rect, clamped to the rect', () => {
		expect(imageWithOrigin(img, [250, 400]).origin).toEqual({ x: 0.25, y: 0.8 })
		expect(imageWithOrigin(img, [-50, 900]).origin).toEqual({ x: 0, y: 1 })
		expect(imageWithOrigin(img, [250, 400])).not.toBe(img)                 // a new entity
		const r = ent({ id: 'r', type: 'rect' }); expect(imageWithOrigin(r, [1, 1])).toBe(r)   // non-image untouched
	})
	it('scaling by real/measured keeps the origin anchor fixed (or the centre when there is none)', () => {
		const anchored = imageWithOrigin(img, [250, 400])   // anchor at (250, 400)
		const s = imageScaled(anchored, 100, 200)             // ×2
		expect(s.a).toEqual([1750, 600]); expect(s.b).toEqual([-250, -400])
		const c = imageScaled(img, 100, 50)                   // ×0.5 about the centre (500, 250)
		expect(c.a).toEqual([750, 375]); expect(c.b).toEqual([250, 125])
	})
	it('an invalid measurement, a non-positive real distance, or a non-image leaves the entity unchanged', () => {
		expect(imageScaled(img, 0, 100)).toBe(img)
		expect(imageScaled(img, 100, NaN)).toBe(img)
		expect(imageScaled(img, 100, -5)).toBe(img)
		const r = ent({ id: 'r' }); expect(imageScaled(r, 10, 20)).toBe(r)
	})
})

describe('moveEnt', () => {
	const rect = ent({ a: [0, 0], b: [200, 100] }), text = ent({ id: 't', type: 'text', a: [10, 10], b: undefined, text: 'x' })
	it('plan and iso translate every entity normally', () => {
		expect(moveEnt(planCtx, rect, 5, -7)).toMatchObject({ a: [5, -7], b: [205, 93] })
		expect(moveEnt(isoCtx, text, 5, -7)).toMatchObject({ a: [15, 3] })
	})
	it('elevation: a flat kind moves only along the view axis — x for front, mirrored for rear, y for right/left; dy is dropped', () => {
		expect(moveEnt(elevCtx('front'), rect, 30, 99)).toMatchObject({ a: [30, 0], b: [230, 100] })
		expect(moveEnt(elevCtx('rear'), rect, 30, 99)).toMatchObject({ a: [-30, 0], b: [170, 100] })
		expect(moveEnt(elevCtx('right'), rect, 30, 99)).toMatchObject({ a: [0, 30], b: [200, 130] })
		expect(moveEnt(elevCtx('left'), rect, 30, 99)).toMatchObject({ a: [0, -30], b: [200, 70] })
		const pl = ent({ type: 'polyline', a: undefined, b: undefined, pts: [[0, 0], [10, 10]] })
		expect(moveEnt(elevCtx('front'), pl, 4, 4).pts).toEqual([[4, 0], [14, 10]])
	})
	it('elevation: non-flat kinds (text, image) translate normally', () => {
		expect(moveEnt(elevCtx('front'), text, 30, 99)).toMatchObject({ a: [40, 109] })
		expect(moveEnt(elevCtx('rear'), ent({ type: 'image' }), 30, 99)).toMatchObject({ a: [30, 99], b: [230, 199] })
	})
	it('B24: a rect drawn NATIVELY in an elevation translates freely (its coords ARE drawing coords)', () => {
		// Flatness is per VIEW (isFlatElev), not per kind: a plane:'rear' rect in the rear view moves with the
		// pointer in both axes, no mirroring; the same rect seen from the front is not in view at all.
		const native = ent({ a: [0, 0], b: [200, 100], plane: 'rear' })
		expect(moveEnt(elevCtx('rear'), native, 30, 99)).toMatchObject({ a: [30, 99], b: [230, 199] })
		expect(moveEnt(elevCtx('rear'), ent({ type: 'dim', a: [0, 0], b: [10, 10], plane: 'rear' }), 30, 99)).toMatchObject({ a: [30, 99], b: [40, 109] })
	})
})

describe('sectionObj / sectionName (B5)', () => {
	it('a plan drag → a normalised whole-mm clip from the floor to the ceiling slab, sighted front', () => {
		const withLevels: ViewCtx = { ...planCtx, mdl: { id: 1, name: 'm', layers: [], levels: { ceilingSlab: 2900 }, objects: [] } as unknown as ViewCtx['mdl'] }
		expect(sectionObj(withLevels, [300.4, 200.6], [100, 400], 'sec1', 'Section A')).toEqual({ id: 'sec1', dir: 'front', name: 'Section A', clip: { x0: 100, y0: 201, z0: 0, x1: 300, y1: 400, z1: 2900 } })
		expect(sectionObj(planCtx, [0, 0], [10, 10], 's', 'n')?.clip.z1).toBe(3200)   // no levels → default slab
		expect(sectionObj(elevCtx('front'), [0, 0], [10, 10], 's', 'n')).toBe(null)
	})
	it('names the first free letter, re-using a deleted one; numbered past Z', () => {
		const sec = (name: string) => ({ id: name, clip: { x0: 0, y0: 0, z0: 0, x1: 1, y1: 1, z1: 1 }, dir: 'front' as const, name })
		expect(sectionName([])).toBe('Section A')
		expect(sectionName([sec('Section A'), sec('Section C')])).toBe('Section B')
		expect(sectionName(Array.from({ length: 26 }, (_, i) => sec(`Section ${String.fromCharCode(65 + i)}`)))).toBe('Section 27')
	})
})
