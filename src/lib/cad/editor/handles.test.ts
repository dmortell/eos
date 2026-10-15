// Handles on the plan: slide / resize an opening, step its swing; move a section's ends, drag its depth.
import { describe, it, expect } from 'vitest'
import { handlesFor, handleAt, segWidthHandles } from './handles'
import { makeWall, makeRun } from '../domain/make'
import { makeOpening } from '../domain/openings'
import type { Shape, Opening } from '../domain/shapes'
import type { SectionCut, Entity } from '../domain/drawing'

const w = makeWall('L', [{ x: 0, y: 0 }, { x: 4000, y: 0 }], 100, 2600)
const seg = w.geom.kind === 'path' ? w.geom.segs[0].id : ''
const wall: Shape = { ...w, role: { kind: 'wall', openings: [makeOpening(seg, 2000, { width: 900, z: 0, h: 2100 })] } }
const op = (s: unknown) => ((s as Shape).role as { openings: Opening[] }).openings[0]

describe('opening handles', () => {
	const [mid, left, right, swing] = handlesFor(wall).handles
	it('sit on the hole: a bar the full width (selects it), both ends, and a round swing grip off its face', () => {
		expect([mid.at, left.at, right.at].map((p) => p.x)).toEqual([2000, 1550, 2450])
		expect(mid).toMatchObject({ shape: 'bar', span: [{ x: 1550, y: 0 }, { x: 2450, y: 0 }], selects: op(wall).id })
		expect(swing.shape).toBe('round')
	})
	it('a press anywhere along the hole takes the bar; at an end the end square wins', () => {
		const hs = handlesFor(wall).handles
		expect(handleAt(hs, { x: 1700, y: 10 }, 30)).toBe(hs[0])
		expect(handleAt(hs, { x: 1560, y: 0 }, 30)).toBe(hs[1])
		expect(handleAt(hs, { x: 1700, y: 200 }, 30)).toBeNull()
	})
	it('dragging the swing grip: the side of the wall picks the face, the half of the hole the hinge; over the wall = none', () => {
		expect(op(swing.drag!({ x: 1800, y: 600 }, false))).toMatchObject({ swing: 'left' })
		expect(op(swing.drag!({ x: 1800, y: 600 }, false)).flip).toBeUndefined()
		expect(op(swing.drag!({ x: 2300, y: -600 }, false))).toMatchObject({ swing: 'right', flip: true })
		expect(op(swing.drag!({ x: 2300, y: 20 }, false)).swing).toBeUndefined()
	})
	it('the middle slides it along (10 mm steps, kept inside the segment); an end resizes with the other end fixed', () => {
		expect(op(mid.drag!({ x: 2734, y: 80 }, false)).at).toBe(2730)
		expect(op(mid.drag!({ x: 3900, y: 0 }, false)).at).toBe(3550)
		expect(op(right.drag!({ x: 2800, y: 0 }, false))).toMatchObject({ width: 1250, at: 2175 })   // 1550 → 2800
		expect(op(left.drag!({ x: 1800, y: 0 }, false))).toMatchObject({ width: 650, at: 2125 })      // 1800 → 2450
		expect(op(left.drag!({ x: 2440, y: 0 }, false)).width).toBe(100)                              // never below 100
	})
	it('a click on the swing grip steps none → left → right → left (other face) → right (other face) → none', () => {
		const seq: string[] = []
		let s: Shape = wall
		for (let i = 0; i < 5; i++) { s = handlesFor(s).handles[3].click!() as Shape; seq.push(`${op(s).swing ?? 'none'}${op(s).flip ? '*' : ''}`) }
		expect(seq).toEqual(['left', 'right', 'left*', 'right*', 'none'])
	})
})

describe('section handles', () => {
	const sec: SectionCut = { type: 'section', id: 'X', levelId: 'L', name: 'A', a: { x: 0, y: 0 }, b: { x: 5000, y: 0 }, depth: 3000 }
	const { handles, decor } = handlesFor(sec)
	it('ends move the cut line; the depth grip sits on the far edge and sets the depth in 100 mm steps', () => {
		expect(handles[2].at).toEqual({ x: 2500, y: -3000 })   // looks up the sheet (−y)
		expect(handles[0].drag!({ x: 12, y: 7 }, false)).toMatchObject({ a: { x: 10, y: 10 } })
		expect(handles[2].drag!({ x: 900, y: -4567 }, false)).toMatchObject({ depth: 4600 })
		expect(handles[2].drag!({ x: 900, y: 500 }, false)).toMatchObject({ depth: 100 })   // never behind the cut
		expect(decor[0].k === 'line' && decor[0].pts).toEqual([{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 5000, y: -3000 }, { x: 0, y: -3000 }])
	})
})

describe('segment width bars (backlog "Segment width grip")', () => {
	const run = makeRun('L', [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 2000 }], { w: 200, h: 50 }, { tier: 'low', form: 'trunk' })
	const g = run.geom.kind === 'path' ? run.geom.segs : []
	const widthOf = (e: unknown, i: number) => { const s = e as Shape; return s.geom.kind === 'path' ? s.geom.segs[i].section?.w ?? s.section?.w : 0 }
	it('a bar on the picked segment\'s edge; dragging sets its width in 10 mm steps (Shift 50, Alt free)', () => {
		const [h] = segWidthHandles(run, [g[0].id])
		expect(h).toMatchObject({ shape: 'bar', span: [{ x: 0, y: 100 }, { x: 2000, y: 100 }] })
		expect(widthOf(h.drag!({ x: 500, y: 163 }, false), 0)).toBe(330)
		expect(widthOf(h.drag!({ x: 500, y: 163 }, false, true), 0)).toBe(350)
		expect(widthOf(h.drag!({ x: 500, y: 163 }, true), 0)).toBe(326)
		expect(widthOf(h.drag!({ x: 500, y: 163 }, false), 1)).toBe(200)   // the other segment keeps the run's
	})
	it('back at the run\'s width the segment drops its own size; too thin at this zoom → no bar', () => {
		const [h] = segWidthHandles(run, [g[0].id])
		const s = h.drag!({ x: 0, y: 100 }, false) as Shape
		expect(s.geom.kind === 'path' && s.geom.segs[0].section).toBeUndefined()
		expect(segWidthHandles(run, [g[0].id], 150)).toEqual([])
		expect(segWidthHandles(run, [])).toEqual([])
	})
})

describe('a section end grip with Shift (Dave 2026-10-15)', () => {
	it('keeps the line level / plumb (15° steps from the other end)', () => {
		const sec = { type: 'section', id: 'S', levelId: 'L', name: 'A', a: { x: 0, y: 0 }, b: { x: 3000, y: 0 }, depth: 2000 } as Entity
		const end = handlesFor(sec).handles[1]
		const free = end.drag!({ x: 3800, y: 70 }, false, false) as { b: { x: number; y: number } }
		expect(free.b.y).toBe(70)
		const level = end.drag!({ x: 3800, y: 70 }, false, true) as { b: { x: number; y: number } }
		expect(level.b.y).toBe(0)
	})
})
