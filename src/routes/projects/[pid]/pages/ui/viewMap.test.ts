// R7 (review.md §R7): `projection.viewMap` is the ONE model → drawing mapping. These pin it against the
// formulas it replaced (geometry.elevU + GROUND − z, Model3d's per-direction group transform, the iso
// centring hitModelIso / isoGround used), and check that picking now follows the DRAWN outline.
import { describe, it, expect } from 'vitest'
import { viewMap, isoR, isoBounds, DEFAULT_YAW, DEFAULT_PITCH } from '../3dview/projection'
import { elevU, ELEV_BASIS, type ElevDir } from './geometry'
import { hitModel, graphNodeDraw, prismOutline, viewMapOf, hitModelIso } from './hit'
import type { ViewCtx } from './view'
import type { Model, Obj } from '../3dview/types'

const CX = 14000, CY = 8750, GROUND = 10250
const DIRS: ElevDir[] = ['front', 'rear', 'left', 'right']
const P = { x: 12345, y: 6789, z: 1500 }

// Parse `translate(a b) scale(1 -1)` and apply it to an engine (u, v) point.
function applyXform(xf: string, u: number, v: number): [number, number] {
	if (!xf) return [u, v]
	const m = /translate\(([-\d.e]+) ([-\d.e]+)\) scale\(1 -1\)/.exec(xf)!
	return [u + Number(m[1]), Number(m[2]) - v]
}

describe('viewMap', () => {
	it('plan is the identity', () => {
		const vm = viewMap('plan', CX, CY, GROUND)
		expect(vm.toDraw(P)).toEqual([P.x, P.y])
		expect(vm.xform).toBe('')
	})
	it('every elevation matches geometry.elevU on the view axis + GROUND − z (the entity projection)', () => {
		for (const d of DIRS) {
			const [x, y] = viewMap(d, CX, CY, GROUND).toDraw(P)
			const along = ELEV_BASIS[d].axis === 0 ? P.x : P.y
			expect(x).toBeCloseTo(elevU(d, along, CX, CY), 9)
			expect(y).toBeCloseTo(GROUND - P.z, 9)
		}
	})
	it('xform (what Model3d renders with) agrees with uvToDraw (what picking uses)', () => {
		for (const d of ['plan', ...DIRS, 'iso'] as const) {
			const vm = viewMap(d, CX, CY, GROUND, 0.7, 0.4, { icx: 120, icy: -80 })
			const q = { u: 321, v: -654 }
			const [a, b] = vm.uvToDraw(q), [c, e] = applyXform(vm.xform, q.u, q.v)
			expect(a).toBeCloseTo(c, 9); expect(b).toBeCloseTo(e, 9)
		}
	})
	it('iso = isoR + the content-box centring hitModelIso / isoGround used to write by hand', () => {
		const box = { icx: 250, icy: -40 }
		const q = isoR(P, DEFAULT_YAW, DEFAULT_PITCH, CX, CY)
		expect(viewMap('iso', CX, CY, GROUND, DEFAULT_YAW, DEFAULT_PITCH, box).toDraw(P)).toEqual([q.u + CX - box.icx, -q.v + CY + box.icy])
	})
})

const planCtx: ViewCtx = { dir: 'plan', isPlan: true, isElev: false, isIso: false, elevDir: 'front', cx: CX, cy: CY, ground: GROUND, frameId: 'f', paperMm: 1, mdl: undefined, yaw: 0, pitch: 0 }
const frontCtx: ViewCtx = { ...planCtx, dir: 'front', isPlan: false, isElev: true }
const withObjs = (ctx: ViewCtx, objects: Obj[]): ViewCtx => ({ ...ctx, mdl: { id: 'm1', name: 'm', layers: [], levels: {}, objects } as unknown as Model })
const shown = { visible: () => true, locked: () => false }

describe('hitModel follows the drawn outline (R7)', () => {
	it('a plan prism rotated 45° picks inside its rotated footprint, not its old AABB corner', () => {
		const o = { type: 'prism', id: 'r', x: 0, y: 0, w: 1000, d: 1000, h: 500, z: 0, edges: 4, rot: 45 } as Obj
		const ctx = withObjs(planCtx, [o])
		expect(hitModel(ctx, [500, 500], 5, shown)).toBe('r')   // centre
		expect(hitModel(ctx, [20, 20], 5, shown)).toBe(null)    // the unrotated square's corner — outside the diamond
		expect(hitModel(ctx, [500, -150], 5, shown)).toBe('r')  // a diamond tip pokes above y = 0
	})
	it('an elevation prism rotated about z picks its full drawn silhouette (wider than w)', () => {
		const o = { type: 'prism', id: 'r', x: 0, y: 0, w: 1000, d: 1000, h: 500, z: 0, edges: 4, rot: 45 } as Obj
		const ctx = withObjs(frontCtx, [o])
		const [xLeft] = viewMapOf(ctx).toDraw({ x: -150, y: 0, z: 0 })
		expect(hitModel(ctx, [xLeft, GROUND - 250], 5, shown)).toBe('r')   // beyond x = 0, inside the rotated silhouette
		expect(prismOutline(ctx, o as Extract<Obj, { type: 'prism' }>).length).toBe(4)
	})
	it('a hexagonal prism misses the corners of its bounding box', () => {
		const o = { type: 'prism', id: 'h', x: 0, y: 0, w: 1000, d: 1000, h: 500, z: 0, edges: 6 } as Obj
		const ctx = withObjs(planCtx, [o])
		expect(hitModel(ctx, [500, 500], 5, shown)).toBe('h')
		expect(hitModel(ctx, [10, 10], 5, shown)).toBe(null)
	})
	it('graph nodes map through the same viewMap', () => {
		const n = { id: 'n', x: 15000, y: 9000, z: 2600 }
		expect(graphNodeDraw(frontCtx, n)).toEqual(viewMap('front', CX, CY, GROUND).toDraw(n))
		expect(graphNodeDraw(planCtx, n)).toEqual([n.x, n.y])
	})
	it('3D: a device slab INSIDE a cabinet picks (what is painted on top wins), not the cabinet', () => {
		// The Rack A demo shape: a cabinet box and a thinner device slab inside it near the front.
		const cab = { type: 'prism', id: 'cab', x: 13700, y: 8450, z: 0, w: 600, d: 1000, h: 2000, edges: 4 } as Obj
		const dev = { type: 'prism', id: 'dev', x: 13730, y: 8490, z: 1000, w: 540, d: 920, h: 180, edges: 4 } as Obj
		const ctx = withObjs({ ...planCtx, dir: 'iso', isPlan: false, isIso: true, yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH }, [cab, dev])
		const b = isoBounds([cab, dev], DEFAULT_YAW, DEFAULT_PITCH, CX, CY)!
		const vm = viewMap('iso', CX, CY, GROUND, DEFAULT_YAW, DEFAULT_PITCH, b)
		// Iso paints faces by mean depth (Model3d's painter's algorithm), which draws the slab's TOP face over the
		// cabinet's sides — the teal bands you see. Wherever that band shows, a click must pick the slab.
		const hits = new Set<string | null>()
		for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) hits.add(hitModelIso(ctx, vm.toDraw({ x: 13730 + 540 * i / 8, y: 8490 + 920 * j / 8, z: 1180 }), shown))
		expect(hits.has('dev')).toBe(true)
		const onCab = vm.toDraw({ x: 13700 + 300, y: 8450, z: 300 })     // cabinet face, well below the slab
		expect(hitModelIso(ctx, onCab, shown)).toBe('cab')
	})
	it('isoBounds + viewMap centre an iso model on (cx, cy)', () => {
		const o = { type: 'prism', id: 'c', x: 13000, y: 8000, w: 2000, d: 1500, h: 1000, z: 0, edges: 4 } as Obj
		const b = isoBounds([o], DEFAULT_YAW, DEFAULT_PITCH, CX, CY)!
		const vm = viewMap('iso', CX, CY, GROUND, DEFAULT_YAW, DEFAULT_PITCH, b)
		expect(vm.uvToDraw({ u: b.icx, v: b.icy })).toEqual([CX, CY])
	})
})
