import { describe, it, expect } from 'vitest'
import { SNAP_STEP, snapToGrid, rndTo, snapDelta, entSnaps, findSnap, drawPoint, snapNode, graphNodeApply } from './snap'
import type { GN } from './hit'
import type { Model, Obj } from '../3dview/types'
import type { Mapper } from './mapper'
import { translate, type Ent, type Pt } from './geometry'
import type { ViewCtx } from './view'

const planCtx: ViewCtx = { dir: 'floorplan', isPlan: true, isElev: false, isIso: false, elevDir: 'front', cx: 14000, cy: 8750, ground: 10250, frameId: 'f', paperMm: 1, mdl: undefined, yaw: 0, pitch: 0 }
const ent = (over: Partial<Ent> = {}): Ent => ({ id: 'e', type: 'rect', a: [0, 0], b: [200, 100], ...over } as Ent)

describe('snapToGrid', () => {
	it('rounds to the step (default SNAP_STEP)', () => {
		expect(snapToGrid([149, 151])).toEqual([100, 200])
		expect(snapToGrid([149, 151], 50)).toEqual([150, 150])
		expect(SNAP_STEP).toBe(100)
	})
})

describe('snapDelta', () => {
	it('step 0 leaves the delta untouched; a real step snaps the base point to the grid', () => {
		expect(snapDelta(37, -12, ent({ a: [10, 10] }), 0)).toEqual([37, -12])
		// base a=(10,10); +delta(37,-12) → (47,-2) → grid(0,0) → delta (-10,-10)
		expect(snapDelta(37, -12, ent({ a: [10, 10] }), 100)).toEqual([-10, -10])
	})
})

describe('entSnaps', () => {
	it('a line gives 2 ends + 1 mid; a rect gives 4 corners + 4 mids + centre', () => {
		expect(entSnaps(planCtx, ent({ type: 'line', a: [0, 0], b: [10, 20] }))).toEqual([
			{ point: [0, 0], type: 'end' }, { point: [10, 20], type: 'end' }, { point: [5, 10], type: 'mid' },
		])
		const rs = entSnaps(planCtx, ent({ a: [0, 0], b: [200, 100] }))
		expect(rs.length).toBe(9)
		expect(rs.filter((s) => s.type === 'center')).toEqual([{ point: [100, 50], type: 'center' }])
	})
})

// An identity mapper: client px == drawing mm, so screen distances read directly in the fixtures.
const ident: Mapper = { toModel: (x, y) => [x, y], toClient: (x, y) => ({ x, y }), tolMm: (px) => px }

describe('findSnap', () => {
	const ents = [ent({ id: 'r', a: [0, 0], b: [200, 100] }), ent({ id: 'l', type: 'line', a: [500, 500], b: [600, 500] })]
	it('returns the nearest snap point within the radius (default 11px), with its kind', () => {
		expect(findSnap(planCtx, ident, ents, 205, 4)).toEqual({ p: [200, 0], type: 'end' })
		expect(findSnap(planCtx, ident, ents, 100, 3)).toEqual({ p: [100, 0], type: 'mid' })
		expect(findSnap(planCtx, ident, ents, 98, 52)).toEqual({ p: [100, 50], type: 'center' })
		expect(findSnap(planCtx, ident, ents, 220, 0)).toBe(null)   // 20px away
		expect(findSnap(planCtx, ident, ents, 220, 0, { radiusPx: 25 })).toEqual({ p: [200, 0], type: 'end' })
	})
	it('skips the excluded (dragged) entity and the inline-edited one', () => {
		expect(findSnap(planCtx, ident, ents, 501, 501, { exclude: 'l' })).toBe(null)
		expect(findSnap(planCtx, ident, ents, 501, 501, { editingId: 'l' })).toBe(null)
		expect(findSnap(planCtx, ident, ents, 501, 501)).toEqual({ p: [500, 500], type: 'end' })
	})
})

describe('drawPoint', () => {
	const ents = [ent({ id: 'r', a: [0, 0], b: [200, 100] })]
	const inp = { osnap: true, snap: false, ortho: false, tool: 'Line', ents }
	it('object snap wins and returns the mark; OSNAP off → raw pointer, no mark', () => {
		expect(drawPoint(planCtx, ident, inp, 203, 2)).toEqual({ p: [200, 0], mark: { p: [200, 0], type: 'end' } })
		expect(drawPoint(planCtx, ident, { ...inp, osnap: false }, 203, 2)).toEqual({ p: [203, 2], mark: null })
	})
	it('no snap hit: shift constrains (15°), ortho locks H/V for Line only, SNAP grid-rounds', () => {
		const base: Pt = [1000, 1000]
		expect(drawPoint(planCtx, ident, { ...inp, ortho: true }, 1300, 1040, base)).toEqual({ p: [1300, 1000], mark: null })
		expect(drawPoint(planCtx, ident, { ...inp, ortho: true, tool: 'Polyline' }, 1300, 1040, base)).toEqual({ p: [1300, 1040], mark: null })
		const s = drawPoint(planCtx, ident, inp, 1300, 1020, base, true)   // shift: ~3.8° → 0°
		expect(s.p[1]).toBeCloseTo(1000); expect(s.mark).toBe(null)
		expect(drawPoint(planCtx, ident, { ...inp, snap: true }, 1349, 1051, base)).toEqual({ p: [1300, 1100], mark: null })
	})
})

// ── slice-1 extras (entSnaps / snapDelta / snapToGrid edge cases; written by eos-18) ──────────────────
// `translate` is only used below; move this import up to the header when folding.

const elevCtx = (elevDir: ViewCtx['elevDir']): ViewCtx => ({ ...planCtx, dir: elevDir, isPlan: false, isElev: true, elevDir })
const pts = (s: { point: Pt }[]) => s.map((x) => x.point)
const sortPts = (p: Pt[]) => [...p].sort((a, b) => a[0] - b[0] || a[1] - b[1])

describe('snapToGrid — non-default steps', () => {
	it('rounds to any step, including fine (25) and coarse (250) grids', () => {
		expect(snapToGrid([149, 151], 25)).toEqual([150, 150])
		expect(snapToGrid([137, 163], 25)).toEqual([125, 175])
		expect(snapToGrid([149, 376], 250)).toEqual([250, 500])
		expect(snapToGrid([10.4, 10.6], 1)).toEqual([10, 11])
	})
	it('rounds negative coordinates toward the nearest grid line (not toward zero)', () => {
		expect(snapToGrid([-149, -151])).toEqual([-100, -200])
		expect(snapToGrid([-260, -240], 100)).toEqual([-300, -200])
	})
	it('a point already on the grid is unchanged', () => {
		expect(snapToGrid([300, -700])).toEqual([300, -700])
		expect(snapToGrid([75, 125], 25)).toEqual([75, 125])
	})
})

describe('snapDelta — keeps the shape', () => {
	it('a rotated rect snaps by its a-point exactly like an unrotated one; rot and b−a survive the move', () => {
		const flat = ent({ a: [10, 10], b: [210, 110] }), rot = ent({ a: [10, 10], b: [210, 110], rot: 45 })
		const d = snapDelta(37, -12, rot, 100)
		expect(d).toEqual(snapDelta(37, -12, flat, 100))
		const moved = translate(rot, d[0], d[1])
		expect(snapToGrid(moved.a!)).toEqual(moved.a)                       // a landed on the grid
		expect([moved.b![0] - moved.a![0], moved.b![1] - moved.a![1]]).toEqual([200, 100])   // shape kept
		expect(moved.rot).toBe(45)
	})
	it('a polyline snaps by its FIRST vertex; every vertex moves by the same delta', () => {
		const pl = ent({ type: 'polyline', a: undefined, b: undefined, pts: [[30, 70], [130, 70], [130, 170]] })
		const d = snapDelta(0, 0, pl, 100)
		expect(d).toEqual([-30, 30])
		const moved = translate(pl, d[0], d[1])
		expect(moved.pts![0]).toEqual([0, 100])
		expect(moved.pts!.map((p, i) => [p[0] - pl.pts![i][0], p[1] - pl.pts![i][1]])).toEqual([[-30, 30], [-30, 30], [-30, 30]])
	})
	it('an entity with neither a nor pts falls back to rounding the delta itself', () => {
		expect(snapDelta(149, 251, ent({ a: undefined, b: undefined }), 100)).toEqual([100, 300])
	})
	it('step 0 is a no-op for every entity shape', () => {
		expect(snapDelta(37, -12, ent({ type: 'polyline', a: undefined, pts: [[30, 70]] }), 0)).toEqual([37, -12])
		expect(snapDelta(37, -12, ent({ a: undefined, b: undefined }), 0)).toEqual([37, -12])
	})
})

describe('entSnaps — shape kinds, plan vs elevation ctx', () => {
	const rect = ent({ a: [0, 0], b: [200, 100] })
	it('an ellipse snaps like a rect: 4 bbox corners + 4 mids + centre', () => {
		const es = entSnaps(planCtx, ent({ type: 'ellipse', a: [0, 0], b: [200, 100] }))
		expect(es).toEqual(entSnaps(planCtx, rect))
		expect(es.filter((s) => s.type === 'end').length).toBe(4)
		expect(es.filter((s) => s.type === 'mid').length).toBe(4)
	})
	it('a rect with reversed a/b gives the same normalised corner set', () => {
		const rev = ent({ a: [200, 100], b: [0, 0] })
		expect(sortPts(pts(entSnaps(planCtx, rev)))).toEqual(sortPts(pts(entSnaps(planCtx, rect))))
	})
	it('in a FRONT elevation a flat rect collapses to the ground line: x-span kept, y = ground ± 2', () => {
		const es = entSnaps(elevCtx('front'), rect)
		expect(es.length).toBe(9)
		expect(es.find((s) => s.type === 'center')?.point).toEqual([100, planCtx.ground])
		for (const p of pts(es)) { expect(p[0]).toBeGreaterThanOrEqual(0); expect(p[0]).toBeLessThanOrEqual(200); expect(Math.abs(p[1] - planCtx.ground)).toBeLessThanOrEqual(2) }
	})
	it('in a RIGHT elevation the span comes from the plan y-extent, re-centred about the plan centre', () => {
		const es = entSnaps(elevCtx('right'), rect)
		const u0 = planCtx.cx + (0 - planCtx.cy), u1 = planCtx.cx + (100 - planCtx.cy)   // elevU('right', y)
		expect(es.find((s) => s.type === 'center')?.point).toEqual([(u0 + u1) / 2, planCtx.ground])
		const xs = pts(es).map((p) => p[0])
		expect(Math.min(...xs)).toBe(u0); expect(Math.max(...xs)).toBe(u1)
	})
	it('a rect drawn NATIVELY in an elevation (plane = that elevation) keeps its own coords there', () => {
		const native = ent({ a: [0, 0], b: [200, 100], plane: 'front' })
		expect(entSnaps(elevCtx('front'), native)).toEqual(entSnaps(planCtx, rect))
	})
	it('a polyline gives every vertex + every segment midpoint; 1 vertex → 1 end; empty → nothing', () => {
		const pl = ent({ type: 'polyline', a: undefined, b: undefined, pts: [[0, 0], [100, 0], [100, 100]] })
		expect(entSnaps(planCtx, pl)).toEqual([
			{ point: [0, 0], type: 'end' }, { point: [100, 0], type: 'end' }, { point: [100, 100], type: 'end' },
			{ point: [50, 0], type: 'mid' }, { point: [100, 50], type: 'mid' },
		])
		expect(entSnaps(planCtx, ent({ type: 'polyline', a: undefined, pts: [[5, 5]] }))).toEqual([{ point: [5, 5], type: 'end' }])
		expect(entSnaps(planCtx, ent({ type: 'polyline', a: undefined, pts: [] }))).toEqual([])
	})
	it('a dim snaps like a line; a text snaps only at its anchor', () => {
		expect(entSnaps(planCtx, ent({ type: 'dim', a: [0, 0], b: [10, 20] }))).toEqual(entSnaps(planCtx, ent({ type: 'line', a: [0, 0], b: [10, 20] })))
		expect(entSnaps(planCtx, ent({ type: 'text', a: [7, 9], b: undefined, text: 'hi' }))).toEqual([{ point: [7, 9], type: 'end' }])
	})
	it('an image with a crop snaps to the VISIBLE crop window, not the full placement', () => {
		const img = ent({ type: 'image', a: [0, 0], b: [1000, 500], crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.5 } })
		const es = entSnaps(planCtx, img)
		expect(es.find((s) => s.type === 'center')?.point).toEqual([350, 225])   // bbox [100,100]-[600,350]
		expect(sortPts(pts(es.filter((s) => s.type === 'end')))).toEqual([[100, 100], [100, 350], [600, 100], [600, 350]])
	})
	it('lines and polylines ignore the view ctx: their snap points are the raw plan coords even in an elevation', () => {
		// NOTE (eos-12): bbox() collapses a flat line to the ground line in an elevation, but entSnaps does not,
		// so in an elevation a plan-plane line offers snap points at (x, plan-y) — away from where it is drawn.
		// This pins the CURRENT behaviour; if that is a bug, flip these to expect the ground-line points.
		const line = ent({ type: 'line', a: [0, 0], b: [10, 20] })
		const pl = ent({ type: 'polyline', a: undefined, b: undefined, pts: [[0, 0], [100, 0]] })
		expect(entSnaps(elevCtx('front'), line)).toEqual(entSnaps(planCtx, line))
		expect(entSnaps(elevCtx('right'), pl)).toEqual(entSnaps(planCtx, pl))
	})
})

// ── graph-node snapping ──
const frontCtx: ViewCtx = { ...planCtx, dir: 'front', isPlan: false, isElev: true, elevDir: 'front' }
const shown = { visible: () => true, locked: () => false }
const wall = (id: string, nodes: GN[]): Obj => ({ type: 'wall', id, h: 2800, thickness: 100, layer: 'walls', nodes, segments: nodes.slice(1).map((n, i) => ({ a: nodes[i].id, b: n.id })) } as Obj)
const withObjs = (ctx: ViewCtx, objects: Obj[]): ViewCtx => ({ ...ctx, mdl: { id: 1, name: 'm', layers: [], levels: {}, objects } as Model })

describe('rndTo', () => {
	it('rounds to the step; step 0 = passthrough', () => {
		expect(rndTo(149, 100)).toBe(100); expect(rndTo(151, 100)).toBe(200); expect(rndTo(149, 0)).toBe(149)
	})
})

describe('snapNode', () => {
	const a: GN = { id: 'a', x: 0, y: 0, z: 0 }, b: GN = { id: 'b', x: 1000, y: 0, z: 0 }, c: GN = { id: 'c', x: 1000, y: 500, z: 0 }
	const ctx = withObjs(planCtx, [wall('w1', [a, b]), wall('w2', [c])])
	it('finds the nearest OTHER visible node within thr, in drawn coords', () => {
		expect(snapNode(ctx, [1004, 3], c, 10, 8, shown)).toEqual([1000, 0])   // b, not c itself
		expect(snapNode(ctx, [1004, 3], b, 10, 8, shown)).toBe(null)          // b excluded; a and c are far
		expect(snapNode(ctx, [1020, 0], c, 10, 8, shown)).toBe(null)          // 20 > thr
		expect(snapNode(ctx, [1004, 3], c, 10, 8, { visible: () => false, locked: () => false })).toBe(null)
		expect(snapNode({ ...ctx, mdl: undefined }, [1004, 3], c, 10, 8, shown)).toBe(null)
	})
	it('DISCONNECT: a partner within brk of the drag origin is skipped', () => {
		expect(snapNode(ctx, [1004, 3], c, 10, 8, shown, [1001, 1])).toBe(null)      // origin sits on b → b skipped
		expect(snapNode(ctx, [1004, 3], c, 10, 8, shown, [1030, 0])).toEqual([1000, 0])   // origin far from b → b snaps
	})
	it('in an elevation, compares drawn (projected) positions: on-axis via elevU, y = ground − z', () => {
		const d: GN = { id: 'd', x: 14100, y: 9999, z: 250 }   // front: u = x, y = ground − z = 10000
		const ectx = withObjs(frontCtx, [wall('w', [d])])
		expect(snapNode(ectx, [14104, 10003], a, 10, 8, shown)).toEqual([14100, 10000])
	})
})

describe('graphNodeApply', () => {
	const noSnap = { snapNode: () => null, rnd: (v: number) => v }
	it('plan: writes x/y in place (grid-rounded via opts.rnd); no node snap → null mark', () => {
		const n: GN = { id: 'n', x: 0, y: 0, z: 0 }
		expect(graphNodeApply(planCtx, n, [149, 251], { snapNode: () => null, rnd: (v) => rndTo(v, 100) })).toBe(null)
		expect([n.x, n.y, n.z]).toEqual([100, 300, 0])
	})
	it('a node snap moves the node onto the partner and returns an end mark', () => {
		const n: GN = { id: 'n', x: 0, y: 0, z: 0 }
		const mark = graphNodeApply(planCtx, n, [996, 4], { ...noSnap, snapNode: () => [1000, 0] })
		expect(mark).toEqual({ p: [1000, 0], type: 'end' })
		expect([n.x, n.y]).toEqual([1000, 0])
	})
	it('elevation (front): the drawn point sets x (on-axis) + z = ground − y, clamped ≥ 0; y untouched', () => {
		const n: GN = { id: 'n', x: 0, y: 777, z: 0 }
		graphNodeApply(frontCtx, n, [14100, 10000], noSnap)   // u=14100 → x=14100; z = 10250 − 10000
		expect([n.x, n.y, n.z]).toEqual([14100, 777, 250])
		graphNodeApply(frontCtx, n, [14100, 10500], noSnap)   // below ground → z clamps to 0
		expect(n.z).toBe(0)
	})
	it('elevation (right): the on-axis coord is y', () => {
		const rctx: ViewCtx = { ...frontCtx, dir: 'right', elevDir: 'right' }
		const n: GN = { id: 'n', x: 555, y: 0, z: 0 }
		graphNodeApply(rctx, n, [14100, 10250], noSnap)   // right: u = cx + (y − cy) → y = cy + 100 = 8850
		expect([n.x, n.y, n.z]).toEqual([555, 8850, 0])
	})
})
