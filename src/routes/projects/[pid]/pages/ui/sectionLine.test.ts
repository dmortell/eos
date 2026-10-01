// Phase 3 of elevation-section-plan.md: the SECTION LINE (OpenCad's "O4"). Pure parts: the line → its OClip / view
// frame (incl. flip) — pinned against the box sections' own elevations so both kinds agree —, the ElevDir a dropped
// frame is filed under, the plan marks (end arrows + A / A′), hit-testing the line, its grips (ends + depth handle) and
// move, and the sheet frames linked to it.
import { describe, it, expect } from 'vitest'
import { PLAN_CX, PLAN_CY, frameOf, frameAxis, frameU, type Pt } from './geometry'
import { oclipFrame, oclipOf, oclipWidth, inClip, inOClip, trimToClip, trimToOClip } from '../3dview/projection'
import { hitSection } from './hit'
import { pickLineSectionGrip } from './grips'
import type { Mapper } from './mapper'
import type { ViewCtx } from './view'
import type { Obj, Clip, LineSection, BoxSection } from '../3dview/types'
import {
	ALL_Z, isLineSection, lineLook, lineSectionOClip, lineSectionDir, lineSectionRegion, lineSectionClip, lineSectionMarks, lineSectionLabels,
	sectionTitle, hitLineSection, lineSectionGrips, applyLineGrip, moveSection, sectionLinksOf, linksSummary, type LinkSource,
} from './sectionLine'
type Prism = Extract<Obj, { type: 'prism' }>
type Wall = Extract<Obj, { type: 'wall' }>

const C: Pt = [PLAN_CX, PLAN_CY]
const line = (over: Partial<LineSection> = {}): LineSection => ({ id: 'l1', kind: 'line', a: [1000, 4000], b: [5000, 4000], depth: 2000, name: 'A', ...over })
const prism = (x: number, y: number, over: Partial<Prism> = {}): Prism => ({ type: 'prism', id: `p${x},${y}`, x, y, z: 0, w: 400, d: 300, h: 1000, edges: 4, ...over })
const planCtx: ViewCtx = { dir: 'plan', isPlan: true, isElev: false, isIso: false, elevDir: 'front', cx: PLAN_CX, cy: PLAN_CY, ground: 10250, frameId: 'f', paperMm: 1, mdl: undefined, yaw: 0, pitch: 0 }
const idMapper: Mapper = { toModel: (cx, cy) => [cx, cy], toClient: (x, y) => ({ x, y }), tolMm: (px) => px }
// the box the line sections below are measured against: x 1000..5000, y 2000..4000 (drawing coords, y down)
const clip: Clip = { x0: 1000, y0: 2000, z0: 0, x1: 5000, y1: 4000, z1: 3000 }
// probes around it: inside, above / below / left / right of it, straddling its edges
const probes = [prism(2000, 2500), prism(1000, 1500), prism(3000, 4500), prism(-500, 3000), prism(5500, 3000), prism(4800, 3900), prism(2000, 1800), prism(2000, 3900, { rot: 30 })]

describe('the look direction', () => {
	it('LEFT of a → b as drawn (y down); flip = the right; no −0 components', () => {
		expect(lineLook({ a: [0, 0], b: [10, 0] })).toEqual([0, -1])            // → east: looks up the sheet
		expect(lineLook({ a: [0, 0], b: [10, 0], flip: true })).toEqual([0, 1])
		expect(lineLook({ a: [0, 0], b: [0, 10] })).toEqual([1, 0])             // ↓ down the sheet: looks east
		expect(lineLook({ a: [0, 10], b: [0, 0] })).toEqual([-1, 0])
		const l = lineLook({ a: [0, 0], b: [3, 4] }); expect(l[0]).toBeCloseTo(0.8, 12); expect(l[1]).toBeCloseTo(-0.6, 12)
	})
	it('isLineSection tells the kinds apart (a box has no kind)', () => {
		expect(isLineSection(line())).toBe(true)
		expect(isLineSection({ id: 'b', clip, dir: 'front' } as BoxSection)).toBe(false)
		expect(isLineSection(null)).toBe(false)
	})
})

describe('line section → its view (OClip + frame), agreeing with the box sections', () => {
	it('along a box’s BOTTOM edge (A left → A′ right), depth = its height: EXACTLY the box’s front elevation', () => {
		const oc = lineSectionOClip(line({ z0: 0, z1: 3000 }))
		expect(oc).toEqual({ a: [1000, 4000], b: [5000, 4000], depth: -2000, z0: 0, z1: 3000 })
		expect(oclipFrame(oc, C)).toEqual(frameOf('front'))   // the frame the Viewport draws with — bit for bit the front one
		expect(oclipWidth(oc)).toBe(4000)
		for (const o of probes) expect(inOClip(o, oc)).toBe(inClip(o, clip))
		expect(lineSectionDir(line())).toBe('front')
	})
	it('flipped along the TOP edge = the box’s REAR elevation (looks down the sheet, t = −x)', () => {
		const s = line({ a: [1000, 2000], b: [5000, 2000], flip: true, z0: 0, z1: 3000 }), oc = lineSectionOClip(s)
		expect(oc.a).toEqual([5000, 2000]); expect(oc.b).toEqual([1000, 2000]); expect(oc.depth).toBe(-2000)   // ends swapped
		expect(oclipFrame(oc, C)).toEqual(frameOf('rear'))
		for (const o of probes) expect(inOClip(o, oc)).toBe(inClip(o, clip))
		expect(lineSectionDir(s)).toBe('rear')
	})
	it('up the RIGHT edge (seen from the right, looking −x) = the box’s RIGHT elevation; down the LEFT edge = its LEFT one', () => {
		const up = line({ a: [5000, 4000], b: [5000, 2000], depth: 4000, z0: 0, z1: 3000 })
		expect(oclipFrame(lineSectionOClip(up), C)).toEqual(frameOf('right')); expect(lineSectionDir(up)).toBe('right')
		const down = line({ a: [1000, 2000], b: [1000, 4000], depth: 4000, z0: 0, z1: 3000 })
		expect(oclipFrame(lineSectionOClip(down), C)).toEqual(frameOf('left')); expect(lineSectionDir(down)).toBe('left')
		for (const s of [up, down]) for (const o of probes) expect(inOClip(o, lineSectionOClip(s))).toBe(inClip(o, clip))
		// … and the same frames the box sections' own oclipOf gives
		expect(oclipFrame(oclipOf(clip, frameOf('left')), C)).toEqual(frameOf('left'))
		expect(oclipFrame(oclipOf(clip, frameOf('right')), C)).toEqual(frameOf('right'))
	})
	it('a flip turns the view round: the other side of the line, the horizontal reversed', () => {
		const s = line(), f0 = oclipFrame(lineSectionOClip(s), C), f1 = oclipFrame(lineSectionOClip({ ...s, flip: true }), C)
		expect(f1.t).toEqual([0 - f0.t[0], 0 - f0.t[1]])
		const behind = prism(2000, 4500)   // just below the line (y > 4000): only the flipped view sees it
		expect(inOClip(behind, lineSectionOClip(s))).toBe(false)
		expect(inOClip(behind, lineSectionOClip({ ...s, flip: true }))).toBe(true)
		// u of two points along the line swaps order when flipped (the elevation reads the other way)
		const ua = frameU(f0, s.a), ub = frameU(f0, s.b), fa = frameU(f1, s.a), fb = frameU(f1, s.b)
		expect(ub).toBeGreaterThan(ua); expect(fa).toBeGreaterThan(fb)
	})
	it('no z band = every height; a band trims to it', () => {
		const oc = lineSectionOClip(line())
		expect([oc.z0, oc.z1]).toEqual([-ALL_Z, ALL_Z])
		const tall = prism(2000, 2500, { z: 20000, h: 500 })
		expect(inOClip(tall, oc)).toBe(true)
		expect(inOClip(tall, lineSectionOClip(line({ z0: 0, z1: 3000 })))).toBe(false)
	})
	it('at 30°: an oblique frame (3D objects edit along its t — obliqueEdit.test.ts); a wall crossing the line is trimmed to the region', () => {
		const r = Math.PI / 6, s = line({ a: [0, 0], b: [4000 * Math.cos(r), -4000 * Math.sin(r)], depth: 1000 })
		const oc = lineSectionOClip(s), f = oclipFrame(oc, C)
		expect(frameAxis(f)).toBe(null)
		expect(f.t[0]).toBeCloseTo(Math.cos(r), 9); expect(f.t[1]).toBeCloseTo(-Math.sin(r), 9)
		expect(lineSectionDir(s)).toBe('front')   // nearest dir: t mostly +x
		const L = lineLook(s)   // up-left of the line
		// a wall from 500 in front of the line (the look side) to 500 behind it, through the line's middle
		const m: Pt = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2]
		const w: Wall = { type: 'wall', id: 'w', h: 2700, thickness: 100, nodes: [{ id: 'n1', x: m[0] + L[0] * 500, y: m[1] + L[1] * 500, z: 0 }, { id: 'n2', x: m[0] - L[0] * 500, y: m[1] - L[1] * 500, z: 0 }, { id: 'n3', x: m[0] - L[0] * 2000, y: m[1] - L[1] * 2000, z: 0 }],
			segments: [{ id: 's1', a: 'n1', b: 'n2' }, { id: 's2', a: 'n2', b: 'n3' }] }
		const t = trimToOClip(w, oc) as Wall
		expect(t.segments.map((x) => x.id)).toEqual(['s1'])   // the segment wholly behind the line (the unseen side) goes
		expect(trimToOClip(w, lineSectionOClip({ ...s, flip: true }))).not.toBe(null)   // flipped: the far side is seen
	})
})

describe('its plan region / covering clip', () => {
	it('the rectangle a, b, then depth along the look; the covering axis Clip (+ band, else every height)', () => {
		expect(lineSectionRegion(line())).toEqual([[1000, 4000], [5000, 4000], [5000, 2000], [1000, 2000]])
		expect(lineSectionClip(line({ z0: 0, z1: 3000 }))).toEqual(clip)
		expect(lineSectionClip(line({ flip: true }))).toEqual({ x0: 1000, y0: 4000, z0: -ALL_Z, x1: 5000, y1: 6000, z1: ALL_Z })
		expect(trimToClip(prism(2000, 2500), lineSectionClip(line()))).not.toBe(null)
	})
})

describe('the plan marks (OpenCad look)', () => {
	it('an arrow at each end along the look (shaft 7u, head 2.6u long × 2.6u wide); labels past the ends', () => {
		const mk = lineSectionMarks(line(), 10)
		expect(mk.arrows[0].end).toEqual([1000, 4000]); expect(mk.arrows[0].tip).toEqual([1000, 3930])
		expect(mk.arrows[1].end).toEqual([5000, 4000]); expect(mk.arrows[1].tip).toEqual([5000, 3930])
		expect(mk.arrows[0].head[0]).toEqual([1000, 3930])
		const [, h1, h2] = mk.arrows[0].head
		expect(h1[1]).toBeCloseTo(3956, 9); expect(h2[1]).toBeCloseTo(3956, 9); expect(Math.abs(h1[0] - h2[0])).toBeCloseTo(26, 9)
		expect(mk.labels).toEqual([{ p: [970, 4000], text: 'A' }, { p: [5030, 4000], text: 'A′' }])
		const fl = lineSectionMarks(line({ flip: true }), 10)
		expect(fl.arrows[0].tip).toEqual([1000, 4070])   // flipped: the arrows point the other way
		expect(fl.labels.map((l) => l.text)).toEqual(['A', 'A′'])   // … the labels stay at their ends
	})
	it('labels / titles', () => {
		expect(lineSectionLabels({ name: 'B' })).toEqual(['B', 'B′'])
		expect(lineSectionLabels({})).toEqual(['?', '?′'])
		expect(sectionTitle(line())).toBe('Section A–A′')
		expect(sectionTitle({ id: 'b', clip, dir: 'front', name: 'Section C' })).toBe('Section C')
		expect(sectionTitle({ id: 'b', clip, dir: 'front' })).toBe('Section')
	})
})

describe('hit-testing', () => {
	it('the cut line within the tolerance (not the region); through hitSection with box sections', () => {
		expect(hitLineSection(line(), [3000, 4003], 5)).toBe(true)
		expect(hitLineSection(line(), [3000, 3000], 5)).toBe(false)   // inside the region: free for model picks
		expect(hitLineSection(line(), [5010, 4000], 5)).toBe(false)   // past the end
		const box: BoxSection = { id: 'b1', clip, dir: 'front' }
		expect(hitSection(planCtx, [box, line()], [3000, 4002], 5)).toBe('l1')   // topmost (last) first — both lie there
		expect(hitSection(planCtx, [box, line()], [3000, 2001], 5)).toBe('b1')
		expect(hitSection({ ...planCtx, isPlan: false }, [line()], [3000, 4000], 5)).toBe(null)
	})
})

describe('grips + move', () => {
	it('both ends + the depth handle (the far side’s middle)', () => {
		expect(lineSectionGrips(line())).toEqual([{ key: 'a', p: [1000, 4000] }, { key: 'b', p: [5000, 4000] }, { key: 'depth', p: [3000, 2000] }])
		expect(lineSectionGrips(line({ flip: true }))[2].p).toEqual([3000, 6000])
	})
	it('the depth handle: the distance along the look, whole mm, ≥ 1 — the line stays', () => {
		expect(applyLineGrip(line(), 'depth', [2500.4, 1499.6])).toEqual({ depth: 2500 })   // sideways drift ignored
		expect(applyLineGrip(line(), 'depth', [3000, 4800])).toEqual({ depth: 1 })         // dragged past the line
	})
	it('an end moves (whole mm); Shift = 15° steps about the other end; a collapse is ignored', () => {
		expect(applyLineGrip(line(), 'b', [6000.6, 4100.2])).toEqual({ b: [6001, 4100] })
		const q = applyLineGrip(line(), 'b', [5000, 3000], true).b!   // ~−14° from a → snaps to −15°
		const ang = (Math.atan2(q[1] - 4000, q[0] - 1000) * 180) / Math.PI
		expect(Math.abs(ang + 15)).toBeLessThan(0.05)
		expect(applyLineGrip(line(), 'a', [5000.3, 4000.2])).toEqual({})
	})
	it('pickLineSectionGrip: 14px around each grip (identity mapper), applying to the press-time copy', () => {
		const s = line(), g = pickLineSectionGrip(idMapper, s, 3004, 2006)
		expect(g?.id).toBe('l1')
		expect(g?.apply([3000, 1000])).toEqual({ depth: 3000 })
		expect(pickLineSectionGrip(idMapper, s, 998, 4003)?.apply([900, 4000])).toEqual({ a: [900, 4000] })
		expect(pickLineSectionGrip(idMapper, s, 3000, 3000)).toBe(null)
		let shift = false; const gb = pickLineSectionGrip(idMapper, s, 5000, 4000, () => shift)!
		shift = true; expect(gb.apply([5000, 3000]).b).not.toEqual([5000, 3000])   // Shift read live
	})
	it('moveSection: a line’s ends, a box’s clip — from the press-time copy, whole mm', () => {
		expect(moveSection(line(), 100.4, -50.6)).toEqual({ a: [1100, 3949], b: [5100, 3949] })
		expect(moveSection({ id: 'b', clip, dir: 'front' }, 10, 20)).toEqual({ clip: { ...clip, x0: 1010, x1: 5010, y0: 2020, y1: 4020 } })
	})
})

describe('the frames a section drives (several, across sheets)', () => {
	const fr = (id: string, section?: string, label?: string, seq?: number) => ({ id, ...(section ? { section } : {}), ...(label ? { label } : {}), ...(seq != null ? { seq } : {}) })
	it('loaded drawings first (fresher), then stored sheets not loaded; sheet = number else title; frame = label else seq', () => {
		const loaded: LinkSource[] = [{ did: 'sheet:s1', sheetId: 's1', title: 'Level 3', number: 'A-201', frames: [fr('v1', 'l1', '2'), fr('v2', 'x'), fr('v3', 'l1')] },
			{ did: 'mock', title: 'Scratch', frames: [fr('v9', 'l1', undefined, 4)] }]
		const stored: LinkSource[] = [{ did: 'sheet:s1', sheetId: 's1', title: 'Level 3', number: 'A-201', frames: [fr('old', 'l1')] },   // stale copy: skipped
			{ did: 'sheet:s2', sheetId: 's2', title: 'Sections', frames: [fr('v4', 'l1', 'B')] }]
		const links = sectionLinksOf('l1', loaded, stored)
		expect(links).toEqual([
			{ did: 'sheet:s1', sheetId: 's1', frameId: 'v1', frame: '2', sheet: 'A-201' },
			{ did: 'sheet:s1', sheetId: 's1', frameId: 'v3', frame: '?', sheet: 'A-201' },
			{ did: 'mock', frameId: 'v9', frame: '4', sheet: 'Scratch' },
			{ did: 'sheet:s2', sheetId: 's2', frameId: 'v4', frame: 'B', sheet: 'Sections' },
		])
		expect(sectionLinksOf('none', loaded, stored)).toEqual([])
		expect(linksSummary(links, 2)).toBe('4 viewports — A-201 · 2, A-201 · ? …')
		expect(linksSummary(links.slice(0, 1))).toBe('1 viewport — A-201 · 2')
		expect(linksSummary([])).toBe('')
	})
})
