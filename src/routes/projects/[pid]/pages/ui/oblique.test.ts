// Phase 2 of elevation-section-plan.md: OBLIQUE views. The projection / clipping / hit-testing take any ElevFrame
// (not just the four dirs): a box seen at 30°, an ORIENTED clip (OClip) keeping / trimming a wall that crosses its
// cut line, a wall panel with an opening seen obliquely, and the Clip → OClip conversion that must reproduce the
// axis trim EXACTLY for the four dirs (existing section views keep their output).
import { describe, it, expect } from 'vitest'
import { type Pt, type Ent, type ElevDir, PLAN_CX, PLAN_CY, GROUND, frameOf, frameAt, frameOnLine, frameAngle, frameU, frameDepth, dotT, dotN, rectPts, flatSpanOf } from './geometry'
import { project, projectPt, viewMap, faces3d, openingCuts, segmentGaps, trimToClip, trimToOClip, inClip, inOClip, oclipOf, oclipFrame, oclipWidth } from '../3dview/projection'
import { ctxFrame, ctxProj, ctxOblique, type ViewCtx } from './view'
import { prismRect, prismOutline, graphNodeDraw, hitModel, flatXSpan } from './hit'
import { fitFrame } from './frameFit'
import type { Obj, Clip, OClip, Model } from '../3dview/types'
type Prism = Extract<Obj, { type: 'prism' }>   // (the Obj variants: with id / layer)
type Wall = Extract<Obj, { type: 'wall' }>
type Conduit = Extract<Obj, { type: 'conduit' }>

const DIRS: ElevDir[] = ['front', 'rear', 'left', 'right']
const C30 = Math.cos(Math.PI / 6), S30 = 0.5
const box = (over: Partial<Prism> = {}): Prism => ({ type: 'prism', id: 'b', x: 1000, y: 2000, z: 300, w: 600, d: 400, h: 1200, edges: 4, ...over })
const span = (a: number[]): [number, number] => [Math.min(...a), Math.max(...a)]

describe('a box projected through a 30° frame', () => {
	const o: Pt = [PLAN_CX, PLAN_CY], f = frameAt(o, 30), b = box()
	const corners = rectPts(b.x, b.y, b.x + b.w, b.y + b.d)
	it('the frame: t = (sin 30°, −cos 30°), n = (cos 30°, sin 30°) — a known corner’s engine u / depth', () => {
		expect(f.t[0]).toBeCloseTo(S30, 12); expect(f.t[1]).toBeCloseTo(-C30, 12)
		expect(f.n[0]).toBeCloseTo(C30, 12); expect(f.n[1]).toBeCloseTo(S30, 12)
		expect(dotT(f, 1000, 2000)).toBeCloseTo(1000 * S30 - 2000 * C30, 9)   // = −1232.05…
		expect(dotN(f, 1000, 2000)).toBeCloseTo(1000 * C30 + 2000 * S30, 9)   // = 1866.03…
		expect(frameAngle(f)).toBe(30)
	})
	it('project(): an upright rectangle over the four corners’ u range × the z range', () => {
		const sh = project(b, f)
		expect(sh).toHaveLength(1); expect(sh[0].closed).toBe(true)
		const want = span(corners.map(([x, y]) => x * S30 - y * C30))
		const [u0, u1] = span(sh[0].pts.map((q) => q.u)), [v0, v1] = span(sh[0].pts.map((q) => q.v))
		expect(u0).toBeCloseTo(want[0], 9); expect(u1).toBeCloseTo(want[1], 9)
		expect(u1 - u0).toBeCloseTo(600 * S30 + 400 * C30, 9)   // the box's width seen at 30°: w·|t.x| + d·|t.y|
		expect([v0, v1]).toEqual([300, 1500])
	})
	it('viewMap draws each corner at frameU (the origin at its own plan x) standing on GROUND; depth = frameDepth', () => {
		const vm = viewMap(f, 0, 0, GROUND)   // an explicit frame carries its own origin (cx / cy unused)
		for (const [x, y] of corners) {
			const [dx, dy] = vm.toDraw({ x, y, z: 300 })
			expect(dx).toBeCloseTo(o[0] + (x - o[0]) * S30 - (y - o[1]) * C30, 6); expect(dx).toBeCloseTo(frameU(f, [x, y]), 6)
			expect(dy).toBe(GROUND - 300)
			expect(dotN(f, x, y) - dotN(f, o[0], o[1])).toBeCloseTo(frameDepth(f, [x, y]), 6)   // Model3d's `far` sorts by this
		}
		expect(frameDepth(f, [b.x + b.w, b.y + b.d])).toBeGreaterThan(frameDepth(f, [b.x, b.y]))   // the far corner is deeper
		expect(projectPt(f, { x: 1000, y: 2000, z: 7 })).toEqual({ u: dotT(f, 1000, 2000), v: 7 })
	})
	it('an explicit AXIS frame equal to a dir’s draws exactly like the dir (ProjDir)', () => {
		const P = { x: 12345.678, y: 6789.01, z: 1500.5 }
		for (const d of DIRS) {
			expect(viewMap(frameOf(d), PLAN_CX, PLAN_CY, GROUND).toDraw(P)).toEqual(viewMap(d, PLAN_CX, PLAN_CY, GROUND).toDraw(P))
			expect(project(box(), frameOf(d))).toEqual(project(box(), d))
		}
	})
})

describe('an ORIENTED clip (OClip)', () => {
	// the cut line runs 45° from (0, 0) to (3000, 3000): t = (√½, √½), looking along n = (−√½, √½), 1000 deep
	const oc: OClip = { a: [0, 0], b: [3000, 3000], depth: 1000, z0: 0, z1: 3000 }
	const wall: Wall = { type: 'wall', id: 'w', h: 2700, thickness: 100,
		nodes: [{ id: 'n1', x: 1000, y: 500, z: 0 }, { id: 'n2', x: 1000, y: 2500, z: 0 }, { id: 'n3', x: -2000, y: 5000, z: 0 },
			{ id: 'n4', x: 5000, y: 0, z: 0 }, { id: 'n5', x: 6000, y: 0, z: 0 }, { id: 'n6', x: 2800, y: 200, z: 0 }, { id: 'n7', x: 2900, y: 300, z: 0 }],
		segments: [{ id: 's1', a: 'n1', b: 'n2' }, { id: 's2', a: 'n2', b: 'n3' }, { id: 's3', a: 'n4', b: 'n5' }, { id: 's4', a: 'n6', b: 'n7' }] }
	it('its frame / width: the cut line’s direction, looking along the right-hand normal', () => {
		const f = oclipFrame(oc)
		expect(f.t[0]).toBeCloseTo(Math.SQRT1_2, 12); expect(f.t[1]).toBeCloseTo(Math.SQRT1_2, 12)
		expect(f.n[0]).toBeCloseTo(-Math.SQRT1_2, 12); expect(f.n[1]).toBeCloseTo(Math.SQRT1_2, 12)
		expect(frameAngle(f)).toBe(135)
		expect(oclipWidth(oc)).toBeCloseTo(3000 * Math.SQRT2, 9)
		expect(oclipFrame(oc, [5, 6]).o).toEqual([5, 6])
	})
	it('keeps the wall segment that CROSSES the cut line, drops those wholly in front / behind', () => {
		const t = trimToOClip(wall, oc) as Wall
		expect(t.segments.map((s) => s.id)).toEqual(['s1'])   // s1 runs from in front of the line (d < 0) to past the depth
		expect(t.nodes.map((n) => n.id)).toEqual(['n1', 'n2'])
		// s4 sits INSIDE the rect's axis bounding box but in FRONT of the cut — the axis trim of that box would keep it
		const aabb: Clip = { x0: -1000 * Math.SQRT1_2, x1: 3000, y0: 0, y1: 3000 + 1000 * Math.SQRT1_2, z0: 0, z1: 3000 }
		expect((trimToClip(wall, aabb) as Wall).segments.map((s) => s.id)).toContain('s4')
	})
	it('a wall entirely outside (or above the z band) is dropped; a conduit crossing it is kept', () => {
		expect(trimToOClip({ ...wall, segments: [wall.segments[2]] }, oc)).toBe(null)
		expect(trimToOClip({ ...wall, nodes: wall.nodes.map((n) => ({ ...n, z: 4000 })) }, oc)).toBe(null)
		const cd: Conduit = { type: 'conduit', id: 'c', w: 100, h: 50, edges: 4, nodes: [{ id: 'a', x: 2000, y: 1000, z: 2500 }, { id: 'b', x: 1000, y: 2000, z: 2500 }], segments: [{ id: 'ab', a: 'a', b: 'b' }] }
		expect((trimToOClip(cd, oc) as Conduit).segments).toHaveLength(1)   // from in front of the cut (d < 0) to inside it
		expect(trimToOClip({ ...cd, nodes: cd.nodes.map((n) => ({ ...n, z: 3500 })) }, oc)).toBe(null)
	})
	it('a BOX passes whole when its true footprint overlaps the rect (separating axes), else is dropped', () => {
		const inside = box({ x: 500, y: 1200, w: 200, d: 200, z: 0, h: 1000 })
		expect(trimToOClip(inside, oc)).toBe(inside)
		expect(inOClip(box({ x: -3000, y: 6000 }), oc)).toBe(false)   // far behind
		expect(inOClip(box({ x: 2700, y: 100, w: 200, d: 200, z: 0 }), oc)).toBe(false)   // inside the rect's axis bounds, but in front of the cut
		// a long thin box centred 1.8 m in front of the cut: lying along x it stays in front; turned −45° (its length along
		// the look direction) it reaches over the line — the ROTATED footprint decides
		const long = box({ x: 300, y: 195, w: 5000, d: 10, z: 0 })
		expect(inOClip(long, oc)).toBe(false)
		expect(inOClip({ ...long, rot: -45 }, oc)).toBe(true)
		expect(inOClip(box({ x: 500, y: 1200, z: 3500 }), oc)).toBe(false)   // above z1
	})
})

describe('Clip → OClip for the four dirs reproduces the axis clip exactly', () => {
	const c: Clip = { x0: 1000, y0: 2000, x1: 5000, y1: 4000, z0: 0, z1: 3000 }
	const want: Record<ElevDir, OClip> = {
		front: { a: [1000, 2000], b: [5000, 2000], depth: 2000, z0: 0, z1: 3000 },   // cut on the near (y0) side, looking +y
		rear: { a: [5000, 4000], b: [1000, 4000], depth: 2000, z0: 0, z1: 3000 },    // near side y1, looking −y
		right: { a: [5000, 2000], b: [5000, 4000], depth: 4000, z0: 0, z1: 3000 },   // near side x1, looking −x
		left: { a: [1000, 4000], b: [1000, 2000], depth: 4000, z0: 0, z1: 3000 },    // near side x0, looking +x
	}
	const objs: Obj[] = [
		{ type: 'wall', id: 'w1', h: 2700, thickness: 100, nodes: [{ id: 'a', x: 0, y: 3000, z: 0 }, { id: 'b', x: 6000, y: 3000, z: 0 }, { id: 'c', x: 6000, y: 6000, z: 0 },
			{ id: 'd', x: 2000, y: 2500, z: 0 }, { id: 'e', x: 3000, y: 2500, z: 0 }, { id: 'f', x: 1000, y: 1000, z: 0 }, { id: 'g', x: 1000, y: 2000, z: 0 }],
			segments: [{ id: 'ab', a: 'a', b: 'b' }, { id: 'bc', a: 'b', b: 'c' }, { id: 'de', a: 'd', b: 'e' }, { id: 'fg', a: 'f', b: 'g' }] },   // crossing / outside / inside / touching a corner
		{ type: 'wall', id: 'w2', h: 2700, thickness: 100, nodes: [{ id: 'a', x: 2000, y: 3000, z: 4000 }, { id: 'b', x: 3000, y: 3000, z: 4000 }], segments: [{ id: 'ab', a: 'a', b: 'b' }] },   // above
		{ type: 'conduit', id: 'c1', w: 100, h: 50, edges: 4, nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 6000, y: 6000, z: 2000 }, { id: 'c', x: 0, y: 0, z: 5000 }, { id: 'd', x: 100, y: 100, z: 5000 }],
			segments: [{ id: 'ab', a: 'a', b: 'b' }, { id: 'cd', a: 'c', b: 'd' }] },   // a sloped run through it / one above it
		box({ id: 'p1', x: 2000, y: 2500, w: 500, d: 500, z: 0 }),   // inside
		box({ id: 'p2', x: 7000, y: 2500, z: 0 }),                     // outside
		box({ id: 'p3', x: 5000, y: 2500, w: 500, d: 500, z: 0 }),    // touching the x1 edge
		box({ id: 'p4', x: 2000, y: 2500, z: 3000 }),                  // standing on z1
		box({ id: 'p5', x: 2000, y: 2500, z: 3001 }),                  // just above
	]
	it('oclipOf(clip, frameOf(dir)) is the clip itself: the near side as the cut line, the far side as the depth', () => {
		for (const d of DIRS) {
			const oc = oclipOf(c, frameOf(d))
			expect(oc).toEqual(want[d])
			const f = oclipFrame(oc)
			expect(f.t).toEqual(frameOf(d).t); expect(f.n).toEqual(frameOf(d).n)   // it looks the way the dir looks
			expect(oclipWidth(oc)).toBe(d === 'front' || d === 'rear' ? 4000 : 2000)   // = the extent along the view axis (dropSectionDir)
		}
	})
	it('trimToOClip / inOClip = trimToClip / inClip on every object, every dir', () => {
		for (const d of DIRS) {
			const oc = oclipOf(c, frameOf(d))
			for (const o of objs) {
				expect(trimToOClip(o, oc)).toEqual(trimToClip(o, c))
				if (o.type === 'prism') expect(inOClip(o, oc)).toBe(inClip(o, c))
			}
		}
		expect((trimToClip(objs[0], c) as Wall).segments.map((s) => s.id)).toEqual(['ab', 'de', 'fg'])   // (what they agree on)
	})
	it('an oblique frame gets the smallest frame-aligned rect around the box', () => {
		const f = frameAt([PLAN_CX, PLAN_CY], 30), oc = oclipOf(c, f), of = oclipFrame(oc)
		expect(of.t[0]).toBeCloseTo(f.t[0], 12); expect(of.t[1]).toBeCloseTo(f.t[1], 12)
		const ts = rectPts(c.x0, c.y0, c.x1, c.y1).map(([x, y]) => dotT(f, x, y)), ds = rectPts(c.x0, c.y0, c.x1, c.y1).map(([x, y]) => dotN(f, x, y))
		expect(oclipWidth(oc)).toBeCloseTo(Math.max(...ts) - Math.min(...ts), 6); expect(oc.depth).toBeCloseTo(Math.max(...ds) - Math.min(...ds), 6)
		for (const o of objs) if (trimToClip(o, c)) expect(trimToOClip(o, oc)).not.toBe(null)   // it covers the box: nothing the box keeps is lost
	})
})

describe('a wall with an opening seen obliquely', () => {
	// a wall along +x (0..4000, 100 thick, 2700 high) with a door 1000..1900 (900 wide, 2100 high) through it
	const w: Wall = { type: 'wall', id: 'w', h: 2700, thickness: 100, nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 4000, y: 0, z: 0 }], segments: [{ id: 'ab', a: 'a', b: 'b' }] }
	const door = box({ id: 'd', x: 1000, y: -100, w: 900, d: 200, z: 0, h: 2100, open: 'door' })
	const cuts = openingCuts([door], () => true)
	const f = frameAt([PLAN_CX, PLAN_CY], 60)   // looking 60° off +x (30° off square-on to the wall): t = (0.866, −0.5)
	const T = f.t[0], HALF = 50 * Math.abs(f.t[1])   // along-wall scale, and the ±50 mm thickness seen at this angle
	// the wall's panels (openingCuts → segmentGaps → wallBoxes): faces3d gives 6 faces per box, bottom ring first
	const boxes = () => { const fs = faces3d(w, cuts), out: { u: [number, number]; z: [number, number] }[] = []
		for (let i = 0; i < fs.length; i += 6) { const bot = fs[i].pts, top = fs[i + 1].pts; out.push({ u: span(bot.map((p) => dotT(f, p.x, p.y))), z: [bot[0].z, top[0].z] }) }
		return out }
	it('the opening’s gap along the wall is frame-independent (plan space)', () => {
		const g = segmentGaps({ x: 0, y: 0 }, { x: 4000, y: 0 }, 50, 0, 2700, cuts)
		expect(g).toHaveLength(1)
		expect(g[0].s0).toBeCloseTo(1000, 6); expect(g[0].s1).toBeCloseTo(1900, 6); expect([g[0].z0, g[0].z1]).toEqual([0, 2100])
	})
	it('panels: two full-height jambs + a header (no sill under a door); the hole between the jambs narrows by the reveals', () => {
		const bs = boxes()
		expect(bs).toHaveLength(3)
		const full = bs.filter((b) => b.z[0] === 0 && b.z[1] === 2700).sort((a, b) => a.u[0] - b.u[0]), head = bs.find((b) => b.z[0] === 2100)!
		expect(full).toHaveLength(2); expect(head.z).toEqual([2100, 2700])
		expect(full[0].u[0]).toBeCloseTo(0 * T - HALF, 6); expect(full[0].u[1]).toBeCloseTo(1000 * T + HALF, 6)
		expect(full[1].u[0]).toBeCloseTo(1900 * T - HALF, 6); expect(full[1].u[1]).toBeCloseTo(4000 * T + HALF, 6)
		expect(full[1].u[0] - full[0].u[1]).toBeCloseTo(900 * T - 2 * HALF, 6)   // the see-through gap: foreshortened, minus the jambs' reveals
		expect(head.u[0]).toBeCloseTo(1000 * T - HALF, 6); expect(head.u[1]).toBeCloseTo(1900 * T + HALF, 6)
	})
	it('the door’s projected hole (Model3d masks it over the wall) covers the gap, and the wall outline spans the jambs', () => {
		const [h0, h1] = span(project(door, f)[0].pts.map((q) => q.u))
		const full = boxes().filter((b) => b.z[1] - b.z[0] === 2700).sort((a, b) => a.u[0] - b.u[0])
		expect(h0).toBeLessThanOrEqual(full[0].u[1]); expect(h1).toBeGreaterThanOrEqual(full[1].u[0])
		const [w0, w1] = span(project(w, f).flatMap((s) => s.pts.map((q) => q.u)))
		expect(w0).toBeCloseTo(-HALF, 6); expect(w1).toBeCloseTo(4000 * T + HALF, 6)
	})
})

describe('hit-testing + fit through an explicit (oblique) ViewCtx frame', () => {
	const f = frameAt([PLAN_CX, PLAN_CY], 30), b = box()
	const mdl: Model = { id: 'm', name: 'M', objects: [b, { type: 'wall', id: 'w', h: 2700, thickness: 100, nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 4000, y: 0, z: 0 }], segments: [{ id: 'ab', a: 'a', b: 'b' }] }] }
	const base: ViewCtx = { dir: 'front', isPlan: false, isElev: true, isIso: false, elevDir: 'front', cx: PLAN_CX, cy: PLAN_CY, ground: GROUND, paperMm: 1, mdl, yaw: 0, pitch: 0 }
	const ctx: ViewCtx = { ...base, frame: f }
	const ml = { visible: () => true, locked: () => false }
	it('ctxFrame / ctxProj / ctxOblique: the explicit frame wins; without one, the dir as before', () => {
		expect(ctxFrame(ctx)).toBe(f); expect(ctxProj(ctx)).toBe(f); expect(ctxOblique(ctx)).toBe(true)
		expect(ctxFrame(base)).toBe(frameOf('front')); expect(ctxProj(base)).toBe('front'); expect(ctxOblique(base)).toBe(false)
		expect(ctxOblique({ ...base, frame: frameOf('left') })).toBe(false)   // an explicit AXIS frame isn't oblique
		expect(ctxProj({ ...base, dir: 'plan', isPlan: true, isElev: false, frame: f })).toBe('plan')   // only an elevation uses it
	})
	it('graphNodeDraw / prismRect / prismOutline map through the frame', () => {
		const q = graphNodeDraw(ctx, { id: 'n', x: 4000, y: 0, z: 500 })
		expect(q[0]).toBeCloseTo(frameU(f, [4000, 0]), 6); expect(q[1]).toBe(GROUND - 500)
		const r = prismRect(ctx, b)!, us = rectPts(b.x, b.y, b.x + b.w, b.y + b.d).map((p) => frameU(f, p))
		expect(r.x0).toBeCloseTo(Math.min(...us), 6); expect(r.x1).toBeCloseTo(Math.max(...us), 6)
		expect([r.y0, r.y1]).toEqual([GROUND - 1500, GROUND - 300])
		const ol = prismOutline(ctx, b), [o0, o1] = span(ol.map((p) => p[0]))
		expect(o0).toBeCloseTo(r.x0, 6); expect(o1).toBeCloseTo(r.x1, 6)
	})
	it('hitModel picks the box / wall where the OBLIQUE view draws them (not where the front view would)', () => {
		const r = prismRect(ctx, b)!, mid: Pt = [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2]
		expect(hitModel(ctx, mid, 5, ml)).toBe('b')
		const fr = prismRect(base, b)!   // the front view draws the box elsewhere in u — nothing there in the oblique view
		const only = { ...mdl, objects: [b] }, at: Pt = [(fr.x0 + fr.x1) / 2, mid[1]]
		expect(hitModel({ ...base, mdl: only }, at, 5, ml)).toBe('b'); expect(hitModel({ ...ctx, mdl: only }, at, 5, ml)).toBe(null)
		const wu = frameU(f, [3000, 0])
		expect(hitModel(ctx, [wu, GROUND - 2000], 5, ml)).toBe('w')   // on the wall's face, 2 m up
	})
	it('a flat plan shape’s ground line spans its along-t extent', () => {
		const e: Ent = { id: 'l', type: 'polyline', pts: [[0, 0], [1000, 1000]] }
		const want = span([frameU(f, [0, 0]), frameU(f, [1000, 1000])])
		expect(flatXSpan(ctx, e)).toEqual(flatSpanOf(e, f))
		expect(flatXSpan(ctx, e)[0]).toBeCloseTo(want[0], 6); expect(flatXSpan(ctx, e)[1]).toBeCloseTo(want[1], 6)
	})
	it('fitFrame centres the drawing as the oblique view draws it (the `frame` option)', () => {
		const fit = fitFrame([b], 'front', { w: 200, h: 100 }, { frame: f })!
		const us = rectPts(b.x, b.y, b.x + b.w, b.y + b.d).map((p) => frameU(f, p)), mid = (Math.min(...us) + Math.max(...us)) / 2
		expect(fit.view.x).toBeCloseTo(-(mid - PLAN_CX) / fit.n, 6)
		expect(fitFrame([b], 'front', { w: 200, h: 100 })!.view.x).not.toBeCloseTo(fit.view.x, 3)   // the front view centres elsewhere
	})
	it('frameOnLine: axis-aligned lines give exact unit components (so a converted Clip stays on the fast path)', () => {
		expect(frameOnLine([5, 5], [100, 5]).t).toEqual([1, 0]); expect(frameOnLine([100, 5], [5, 5]).t).toEqual([-1, 0])
		expect(frameOnLine([5, 5], [5, 100]).t).toEqual([0, 1]); expect(frameOnLine([5, 100], [5, 5]).n).toEqual([1, 0])
	})
})
