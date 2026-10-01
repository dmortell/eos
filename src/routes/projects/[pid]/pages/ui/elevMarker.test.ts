// Phase 4 of elevation-section-plan.md: the ELEVATION MARKER. Pure parts: the marker → its view (it IS a line section
// through its point — pinned against the line / box sections' own elevations), rotation / width / depth, the any-kind
// dispatch the page reads (OClip / Clip / ElevDir), the ONE plan drawing (eltag look) + its per-sheet ref, hit-testing,
// grips, placing (angle snap, numbering), move / title.
import { describe, it, expect } from 'vitest'
import { PLAN_CX, PLAN_CY, frameOf, frameAxis, type Pt } from './geometry'
import { oclipFrame, oclipWidth, inClip, inOClip } from '../3dview/projection'
import { hitSection } from './hit'
import { pickElevGrip } from './grips'
import { lineSectionOClip, moveSection, sectionTitle, ALL_Z } from './sectionLine'
import type { Mapper } from './mapper'
import type { ViewCtx } from './view'
import type { Obj, Clip, ElevMarker, LineSection, BoxSection } from '../3dview/types'
import {
	ELEV_WIDTH, ELEV_DEPTH, isElevMarker, isBoxSection, normDeg, userToPlanAngle, planToUserAngle, elevLook, elevRight, elevMarkerLine, elevMarkerOClip,
	elevMarkerRegion, elevMarkerClip, elevMarkerDir, sectionOClip, sectionClip, sectionDir, sectionAllHeights, elevMarkerNumber, elevMarkerRef,
	elevMarkerMarks, hitElevMarker, elevMarkerGrips, applyElevGrip, lookAngle, elevMarkerObj,
} from './elevMarker'
type Prism = Extract<Obj, { type: 'prism' }>

const C: Pt = [PLAN_CX, PLAN_CY]
const mk = (over: Partial<ElevMarker> = {}): ElevMarker => ({ id: 'e1', kind: 'elev', at: [3000, 4000], angle: 270, width: 4000, depth: 2000, number: '1', ...over })
const prism = (x: number, y: number, over: Partial<Prism> = {}): Prism => ({ type: 'prism', id: `p${x},${y}`, x, y, z: 0, w: 400, d: 300, h: 1000, edges: 4, ...over })
const planCtx: ViewCtx = { dir: 'plan', isPlan: true, isElev: false, isIso: false, elevDir: 'front', cx: PLAN_CX, cy: PLAN_CY, ground: 10250, frameId: 'f', paperMm: 1, mdl: undefined, yaw: 0, pitch: 0 }
const idMapper: Mapper = { toModel: (cx, cy) => [cx, cy], toClient: (x, y) => ({ x, y }), tolMm: (px) => px }
// the box the markers below see: x 1000..5000, y 2000..4000 (drawing coords, y down), z 0..3000
const clip: Clip = { x0: 1000, y0: 2000, z0: 0, x1: 5000, y1: 4000, z1: 3000 }
const probes = [prism(2000, 2500), prism(1000, 1500), prism(3000, 4500), prism(-500, 3000), prism(5500, 3000), prism(4800, 3900), prism(2000, 1800), prism(2000, 3900, { rot: 30 })]

describe('angles', () => {
	it('plan degrees on the drawing: 0 → +x, 90 ↓ +y, 270 ↑ — exact on the axes (no −0); right = the look turned clockwise', () => {
		expect(elevLook({ angle: 0 })).toEqual([1, 0]); expect(elevLook({ angle: 90 })).toEqual([0, 1])
		expect(elevLook({ angle: 180 })).toEqual([-1, 0]); expect(elevLook({ angle: 270 })).toEqual([0, -1])
		expect(elevRight({ angle: 270 })).toEqual([1, 0])   // looking up the sheet, the viewer's right is +x
		expect(elevRight({ angle: 0 })).toEqual([0, 1])
		const l = elevLook({ angle: 30 }); expect(l[0]).toBeCloseTo(Math.sqrt(3) / 2, 12); expect(l[1]).toBeCloseTo(0.5, 12)
	})
	it('normDeg into [0, 360); the command line’s CAD angle (CCW, Y up) ↔ plan', () => {
		expect([normDeg(-90), normDeg(360), normDeg(450.5), normDeg(0)]).toEqual([270, 0, 90.5, 0])
		expect(userToPlanAngle(90)).toBe(270)   // typed 90 = up the sheet
		expect(userToPlanAngle(0)).toBe(0); expect(userToPlanAngle(45)).toBe(315)
		expect(planToUserAngle(userToPlanAngle(123.4))).toBe(123.4)
	})
	it('kinds', () => {
		expect(isElevMarker(mk())).toBe(true); expect(isElevMarker(null)).toBe(false)
		expect(isElevMarker({ id: 'l', kind: 'line', a: [0, 0], b: [1, 0], depth: 1 })).toBe(false)
		expect(isBoxSection({ id: 'b', clip, dir: 'front' })).toBe(true); expect(isBoxSection(mk())).toBe(false)
	})
})

describe('marker → its view (a line section through its point)', () => {
	it('looking UP the sheet at the middle of a box’s bottom edge, as wide as it and as deep: EXACTLY its front elevation', () => {
		const m = mk({ z0: 0, z1: 3000 })
		expect(elevMarkerLine(m)).toEqual({ id: 'e1', kind: 'line', a: [1000, 4000], b: [5000, 4000], depth: 2000, z0: 0, z1: 3000 })
		const oc = elevMarkerOClip(m)
		expect(oc).toEqual({ a: [1000, 4000], b: [5000, 4000], depth: -2000, z0: 0, z1: 3000 })   // = the phase-3 line along that edge
		expect(oclipFrame(oc, C)).toEqual(frameOf('front'))
		for (const o of probes) expect(inOClip(o, oc)).toBe(inClip(o, clip))
		expect(elevMarkerDir(m)).toBe('front')
	})
	it('the other three axes: down → rear, east (seen from the left) → left, west (seen from the right) → right (the line sections’ frames)', () => {
		const down = mk({ at: [3000, 2000], angle: 90, z0: 0, z1: 3000 })
		expect(oclipFrame(elevMarkerOClip(down), C)).toEqual(frameOf('rear')); expect(elevMarkerDir(down)).toBe('rear')
		const east = mk({ at: [1000, 3000], angle: 0, width: 2000, depth: 4000, z0: 0, z1: 3000 })   // at the box's LEFT edge, looking +x
		expect(elevMarkerOClip(east)).toEqual(lineSectionOClip({ id: 'x', kind: 'line', a: [1000, 2000], b: [1000, 4000], depth: 4000, z0: 0, z1: 3000 }))
		expect(oclipFrame(elevMarkerOClip(east), C)).toEqual(frameOf('left')); expect(elevMarkerDir(east)).toBe('left')
		const west = mk({ at: [5000, 3000], angle: 180, width: 2000, depth: 4000, z0: 0, z1: 3000 })   // at its RIGHT edge, looking −x
		expect(oclipFrame(elevMarkerOClip(west), C)).toEqual(frameOf('right')); expect(elevMarkerDir(west)).toBe('right')
		for (const m of [down, east, west]) for (const o of probes) expect(inOClip(o, elevMarkerOClip(m))).toBe(inClip(o, clip))
	})
	it('behind the marker is not seen; turning it round (180°) sees that side instead', () => {
		const behind = prism(2800, 4500)
		expect(inOClip(behind, elevMarkerOClip(mk()))).toBe(false)
		expect(inOClip(behind, elevMarkerOClip(mk({ angle: 90 })))).toBe(true)
	})
	it('rotated 30°: an oblique frame, the cut `width` wide across the look, the region `depth` ahead', () => {
		const m = mk({ at: [0, 0], angle: 30, width: 3000, depth: 1000 }), oc = elevMarkerOClip(m), f = oclipFrame(oc, C)
		expect(frameAxis(f)).toBe(null)
		const t = elevRight(m); expect(f.t[0]).toBeCloseTo(t[0], 9); expect(f.t[1]).toBeCloseTo(t[1], 9)   // the view reads left → right for the viewer
		expect(oclipWidth(oc)).toBeCloseTo(3000, 6)
		const L = elevLook(m), r = elevMarkerRegion(m)
		expect(r[2][0] - r[1][0]).toBeCloseTo(L[0] * 1000, 6); expect(r[2][1] - r[1][1]).toBeCloseTo(L[1] * 1000, 6)
		expect(inOClip(prism(L[0] * 500 - 200, L[1] * 500 - 150, { h: 100 }), oc)).toBe(true)     // 500 ahead (the prism's centre)
		expect(inOClip(prism(L[0] * 1500 - 200, L[1] * 1500 - 150, { h: 100 }), oc)).toBe(false)  // past the depth
		expect(elevMarkerDir(m)).toBe('left')   // nearest dir: t mostly +y (looking mostly +x — seen from the left)
	})
	it('no z band = every height; the covering Clip', () => {
		const oc = elevMarkerOClip(mk()); expect([oc.z0, oc.z1]).toEqual([-ALL_Z, ALL_Z])
		expect(elevMarkerClip(mk({ z0: 0, z1: 3000 }))).toEqual(clip)
	})
})

describe('any section kind (what a linked frame reads)', () => {
	const box: BoxSection = { id: 'b', clip, dir: 'left' }
	const line: LineSection = { id: 'l', kind: 'line', a: [1000, 4000], b: [5000, 4000], depth: 2000, z0: 0, z1: 3000 }
	it('OClip: a line’s, a marker’s; none for a box', () => {
		expect(sectionOClip(line)).toEqual(lineSectionOClip(line)); expect(sectionOClip(mk())).toEqual(elevMarkerOClip(mk()))
		expect(sectionOClip(box)).toBe(null)
	})
	it('Clip / ElevDir / every-height', () => {
		expect(sectionClip(box)).toBe(clip); expect(sectionClip(line)).toEqual(clip); expect(sectionClip(mk({ z0: 0, z1: 3000 }))).toEqual(clip)
		expect(sectionDir(box)).toBe('left'); expect(sectionDir(box, 'rear')).toBe('rear'); expect(sectionDir(line, 'rear')).toBe('front'); expect(sectionDir(mk({ angle: 90 }))).toBe('rear')
		expect([sectionAllHeights(box), sectionAllHeights(line), sectionAllHeights(mk()), sectionAllHeights(mk({ z0: 0, z1: 10 }))]).toEqual([false, false, true, false])
	})
})

describe('numbering + the callout', () => {
	it('the first free number among the model’s markers (other kinds don’t count)', () => {
		expect(elevMarkerNumber([])).toBe('1')
		expect(elevMarkerNumber([mk({ number: '1' }), mk({ id: 'e3', number: '3' }), { id: 'l', kind: 'line', a: [0, 0], b: [1, 0], depth: 1, name: '2' }])).toBe('2')
	})
	it('per sheet: linked → its first viewport’s number over that sheet’s; unlinked → its own', () => {
		expect(elevMarkerRef(mk(), [{ frame: '3', sheet: 'A-201' }, { frame: '1', sheet: 'A-202' }])).toEqual({ num: '3', sheet: 'A-201' })
		expect(elevMarkerRef(mk({ number: '4' }), [])).toEqual({ num: '4' })
		expect(elevMarkerRef({}, [])).toEqual({ num: '?' })
	})
	it('titles: its name, else "Elevation N"', () => {
		expect(sectionTitle(mk())).toBe('Elevation 1'); expect(sectionTitle(mk({ name: 'North wall' }))).toBe('North wall')
	})
})

describe('the plan drawing (eltag look)', () => {
	it('a circle (4u) on the point, a filled triangle pointing the look (tip 1.55 radii out), the number inside', () => {
		const g = elevMarkerMarks(mk(), 10, { num: '1' })
		expect(g.prims[0]).toEqual({ k: 'circle', c: [3000, 4000], r: 40 })
		const tri = g.prims[1] as { k: 'poly'; pts: Pt[]; fill?: boolean }
		expect(tri.fill).toBe(true)
		expect(tri.pts[0][0]).toBeCloseTo(3000, 9); expect(tri.pts[0][1]).toBeCloseTo(3938, 9)   // up the sheet
		for (const q of tri.pts.slice(1)) { expect(Math.hypot(q[0] - 3000, q[1] - 4000)).toBeCloseTo(40, 9); expect(q[1]).toBeLessThan(4000) }   // base on the circle
		expect(g.tip).toEqual(tri.pts[0])
		expect(g.prims.filter((p) => p.k === 'text')).toEqual([{ k: 'text', p: [3000, 4000], text: '1', size: 26 }])
	})
	it('linked: number over a divider over the sheet number — upright at any angle', () => {
		const g = elevMarkerMarks(mk({ angle: 37 }), 10, { num: '2', sheet: 'A-201' })
		const texts = g.prims.filter((p) => p.k === 'text') as { p: Pt; text: string }[]
		expect(texts.map((t) => t.text)).toEqual(['2', 'A-201'])
		expect(texts[0].p[1]).toBeLessThan(4000); expect(texts[1].p[1]).toBeGreaterThan(4000); expect(texts.every((t) => t.p[0] === 3000)).toBe(true)
		expect(g.prims.some((p) => p.k === 'line')).toBe(true)
	})
})

describe('hit-testing', () => {
	it('the circle or the arrow (the region stays free); through hitSection with the other kinds', () => {
		expect(hitElevMarker(mk(), [3030, 4010], 10, 5)).toBe(true)     // inside the circle
		expect(hitElevMarker(mk(), [3000, 3945], 10, 5)).toBe(true)     // on the arrow
		expect(hitElevMarker(mk(), [3000, 3000], 10, 5)).toBe(false)    // in the seen region
		expect(hitElevMarker(mk(), [3000, 4100], 10, 5)).toBe(false)    // behind it
		const box: BoxSection = { id: 'b1', clip, dir: 'front' }
		expect(hitSection(planCtx, [box, mk()], [3010, 4000], 5, 10)).toBe('e1')
		expect(hitSection(planCtx, [box, mk()], [2000, 4001], 5, 10)).toBe('b1')
		expect(hitSection({ ...planCtx, isPlan: false }, [mk()], [3000, 4000], 5, 10)).toBe(null)
	})
})

describe('grips', () => {
	it('turn (the arrow tip), the band’s two ends, depth (straight ahead)', () => {
		const g = elevMarkerGrips(mk(), 10)
		expect(g.map((x) => x.key)).toEqual(['rot', 'wa', 'wb', 'depth'])
		expect(g[0].p[0]).toBeCloseTo(3000, 9); expect(g[0].p[1]).toBeCloseTo(3938, 9)
		expect(g.slice(1).map((x) => x.p)).toEqual([[1000, 4000], [5000, 4000], [3000, 2000]])
	})
	it('turn: the angle to the pointer (0.1°), Shift = 15° steps; onto the point itself = ignored', () => {
		expect(applyElevGrip(mk(), 'rot', [4000, 4000])).toEqual({ angle: 0 })
		expect(applyElevGrip(mk(), 'rot', [3000 + 1000, 4000 - 577.35])).toEqual({ angle: 330 })   // ≈ −30° → 330
		expect(applyElevGrip(mk(), 'rot', [3000 + 1000, 4000 + 200])).toEqual({ angle: 11.3 })
		expect(applyElevGrip(mk(), 'rot', [3000 + 1000, 4000 + 200], true)).toEqual({ angle: 15 })
		expect(applyElevGrip(mk(), 'rot', [3000, 4000])).toEqual({})
	})
	it('a band end: width = twice the distance across the look (stays centred); depth: along it; ≥ 1 mm', () => {
		expect(applyElevGrip(mk(), 'wb', [6000.4, 3500])).toEqual({ width: 6001 })
		expect(applyElevGrip(mk(), 'wa', [2500, 1000])).toEqual({ width: 1000 })
		expect(applyElevGrip(mk(), 'depth', [3300, 2499.6])).toEqual({ depth: 1500 })
		expect(applyElevGrip(mk(), 'depth', [3000, 5000])).toEqual({ depth: 1 })
		expect(applyElevGrip(mk(), 'wb', [3000, 1000])).toEqual({ width: 1 })
	})
	it('pickElevGrip: 14px around each grip (identity mapper), applied to the press-time copy; Shift read live', () => {
		const m = mk(), g = pickElevGrip(idMapper, m, 3003, 2005, 10)
		expect(g?.id).toBe('e1'); expect(g?.apply([3000, 1000])).toEqual({ depth: 3000 })
		expect(pickElevGrip(idMapper, m, 3000, 3000, 10)).toBe(null)
		let shift = false; const r = pickElevGrip(idMapper, m, 3000, 3940, 10, () => shift)!
		expect(r.apply([4000, 4200])).toEqual({ angle: 11.3 }); shift = true; expect(r.apply([4000, 4200])).toEqual({ angle: 15 })
	})
})

describe('placing + moving', () => {
	it('lookAngle: 90° steps by default, 15° with Shift, exact with 0', () => {
		expect(lookAngle([0, 0], [100, -10])).toBe(0); expect(lookAngle([0, 0], [10, -100])).toBe(270); expect(lookAngle([0, 0], [-100, 60])).toBe(180)
		expect(lookAngle([0, 0], [100, 30], 15)).toBe(15)
		expect(lookAngle([0, 0], [100, 100], 0)).toBe(45)
	})
	it('elevMarkerObj: whole-mm point, normalised angle, defaults, every height', () => {
		expect(elevMarkerObj([10.4, 20.6], -90, 'e9', '2')).toEqual({ id: 'e9', kind: 'elev', at: [10, 21], angle: 270, width: ELEV_WIDTH, depth: ELEV_DEPTH, number: '2' })
		expect(elevMarkerObj([0, 0], 0, 'e', '1', 0, -5)).toMatchObject({ width: 1, depth: 1 })
	})
	it('moveSection moves its point (whole mm, from the press-time copy)', () => {
		expect(moveSection(mk(), 100.4, -50.6)).toEqual({ at: [3100, 3949] })
	})
})
