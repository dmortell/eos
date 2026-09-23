import { describe, it, expect } from 'vitest'
import { resizeSectionClip, pickSectionGrip, prismCorners, gripsLocal, gripsFor, constrainGrip, canRotate, type GripOpts } from './grips'
import type { Mapper } from './mapper'
import type { Clip, Obj } from '../3dview/types'
import type { ViewCtx } from './view'
import type { Ent } from './geometry'

const opts: GripOpts = { gripMm: 10, shift: () => false, imgCropId: null }
const ent = (over: Partial<Ent> = {}): Ent => ({ id: 'e', type: 'rect', a: [0, 0], b: [20, 10], ...over } as Ent)

const clip: Clip = { x0: 0, y0: 0, z0: 0, x1: 100, y1: 100, z1: 10 }
const planCtx: ViewCtx = { dir: 'plan', isPlan: true, isElev: false, isIso: false, elevDir: 'front', cx: 14000, cy: 8750, ground: 10250, frameId: 'f', paperMm: 1, mdl: undefined, yaw: 0, pitch: 0 }

// A trivial mapper: model coords map 1:1 to client px (identity), so a corner at (x,y) is at (x,y) px.
const idMapper: Mapper = { toModel: (cx, cy) => [cx, cy], toClient: (x, y) => ({ x, y }), tolMm: (px) => px }

describe('resizeSectionClip', () => {
	it('normalises the dragged corner + fixed anchor into min/max, keeping z', () => {
		expect(resizeSectionClip(clip, [140, 30], [20, 90])).toEqual({ x0: 20, y0: 30, z0: 0, x1: 140, y1: 90, z1: 10 })
	})
})

describe('pickSectionGrip', () => {
	const sel = { id: 's1', clip }
	it('grabs the corner within 14px and resizes about the opposite one, else null', () => {
		const g = pickSectionGrip(idMapper, sel, 2, 2)   // near the (0,0) corner (gi 0)
		expect(g?.id).toBe('s1')
		// gi 0's opposite corner is (x1,y1) = (100,100); dragging to (10,10) → box (10,10)-(100,100)
		expect(g?.apply([10, 10])).toEqual({ x0: 10, y0: 10, z0: 0, x1: 100, y1: 100, z1: 10 })
		expect(pickSectionGrip(idMapper, sel, 50, 50)).toBe(null)   // centre → no corner
	})
})

describe('prismCorners (plan)', () => {
	const prism: Obj = { type: 'prism', id: 'p', x: 100, y: 100, w: 200, d: 100, h: 500, z: 0, edges: 4, layer: 'l' } as Obj
	it('returns the footprint corners tl,tr,br,bl', () => {
		expect(prismCorners(planCtx, prism)).toEqual([[100, 100], [300, 100], [300, 200], [100, 200]])
	})
	it('is empty for a non-prism', () => {
		expect(prismCorners(planCtx, { type: 'wall', id: 'w', nodes: [], segments: [], h: 2000, thickness: 100, layer: 'l' } as Obj)).toEqual([])
	})
})

describe('entity grips', () => {
	it('gripsLocal gives a rect its 4 corner grips, a 2-point polyline (a migrated line) its 2 ends, text its anchor', () => {
		expect(gripsLocal(planCtx, ent({ a: [0, 0], b: [20, 10] }), opts).map((g) => [g.x, g.y]))
			.toEqual([[0, 0], [20, 10], [0, 10], [20, 0]])
		expect(gripsLocal(planCtx, ent({ type: 'polyline', pts: [[1, 2], [8, 9]] }), opts).map((g) => [g.x, g.y]))
			.toEqual([[1, 2], [8, 9]])
		expect(gripsLocal(planCtx, ent({ type: 'text', a: [5, 5], text: 'hi' }), opts).length).toBe(1)
	})
	it('a rect corner grip resizes the box', () => {
		const g = gripsLocal(planCtx, ent({ a: [0, 0], b: [20, 10] }), opts)[1]   // the (20,10) corner
		expect(g.apply([30, 16])).toMatchObject({ a: [0, 0], b: [30, 16] })
	})
	it('a 2-point polyline endpoint grip carries anchor/resize (world-anchored, like the old line type)', () => {
		const g = gripsLocal(planCtx, ent({ type: 'polyline', pts: [[1, 2], [8, 9]] }), opts)[0]   // the (1,2) end
		expect(g.anchor).toEqual([8, 9])
		expect(g.resize?.([0, 0], [8, 9])).toMatchObject({ pts: [[0, 0], [8, 9]] })
		expect(g.apply([5, 5])).toMatchObject({ pts: [[5, 5], [8, 9]] })
	})
	it('a 3+ point polyline gets a plain per-vertex grip (no anchor/resize)', () => {
		const gs = gripsLocal(planCtx, ent({ type: 'polyline', pts: [[0, 0], [10, 0], [10, 10]] }), opts)
		expect(gs.map((g) => [g.x, g.y])).toEqual([[0, 0], [10, 0], [10, 10]])
		expect(gs.every((g) => g.anchor === undefined && g.resize === undefined)).toBe(true)
	})
	it('gripsFor adds a rotate handle for a rotatable ent, and a 2-point polyline (a migrated line)', () => {
		expect(gripsFor(planCtx, ent(), opts).some((g) => g.rotate)).toBe(true)
		expect(gripsFor(planCtx, ent({ type: 'polyline', pts: [[0, 0], [1, 1]] }), opts).some((g) => g.rotate)).toBe(true)
		expect(gripsFor(planCtx, ent({ type: 'polyline', pts: [[0, 0], [1, 1], [2, 2]] }), opts).some((g) => g.rotate)).toBe(false)
	})
	it('canRotate gates rotatable kinds + excludes an image being cropped', () => {
		expect(canRotate(planCtx, ent(), null)).toBe(true)
		expect(canRotate(planCtx, ent({ type: 'dim' }), null)).toBe(false)
		expect(canRotate(planCtx, ent({ type: 'polyline', pts: [[0, 0], [1, 1]] }), null)).toBe(true)   // 2-point = a migrated line
		expect(canRotate(planCtx, ent({ type: 'polyline', pts: [[0, 0], [1, 1], [2, 2]] }), null)).toBe(false)   // 3+ points = a real polyline
		expect(canRotate(planCtx, ent({ type: 'image', id: 'img' }), 'img')).toBe(false)   // mid-crop
		expect(canRotate(planCtx, ent({ type: 'image', id: 'img' }), null)).toBe(true)
	})
	it('constrainGrip squares a rect corner about its opposite, and no-ops without Shift', () => {
		const r = ent({ a: [0, 0], b: [20, 10] })
		expect(constrainGrip(planCtx, r, 1, [26, 30], false, opts)).toEqual([26, 30])   // shift off → unchanged
		// gi 1 = corner (20,10), opposite anchor (0,0); square about (0,0) with s=max(26,30)=30
		expect(constrainGrip(planCtx, r, 1, [26, 30], true, opts)).toEqual([30, 30])
	})
	it('constrainGrip snaps a dim / 2-point-polyline endpoint to 15° about the other end', () => {
		// gi 1 drags the far end (anchor stays at [0,0]); dragging to [10,6] (≈31°) snaps to 30° at the same
		// distance from the anchor — [len·cos30°, len·sin30°] with len = hypot(10,6).
		const d = ent({ type: 'dim', a: [0, 0], b: [10, 0] })
		const rd = constrainGrip(planCtx, d, 1, [10, 6], true, opts)
		expect(rd[0]).toBeCloseTo(10.0995, 3); expect(rd[1]).toBeCloseTo(5.8310, 3)
		const p = ent({ type: 'polyline', pts: [[0, 0], [10, 0]] })
		const rp = constrainGrip(planCtx, p, 1, [10, 6], true, opts)   // same math, keyed by pts
		expect(rp[0]).toBeCloseTo(10.0995, 3); expect(rp[1]).toBeCloseTo(5.8310, 3)
	})
})
