// Calibrating a floorplan in place (backlog "Calibrate an image in place"): plan points back to page points, and the
// records Uploads keeps (origin, scale, crop in page points).
import { describe, it, expect } from 'vitest'
import { toPage, scaleRecord, cropRecord, CalibrateTool, parsePaperScale, paperScaleRecord, paperOf, ratioOf, PT_MM, type CalibTarget } from './calibrateTool'
import { placementFromCalib } from '../app/pdf.svelte'
import type { Underlay } from '../domain/types'
import type { ToolCtx, PointerIn } from './tools'

const u: Underlay = { type: 'underlay', id: 'U', levelId: 'L', fileId: 'F', origin: { x: 1000, y: 0 } }
const cal = { origin: { x: 50, y: 20 }, sf: 10, provisional: false }
const at = (x: number, y: number): PointerIn => ({ p: { x, y }, shift: false, ctrl: false, alt: false })

describe('calibrate in place', () => {
	it('a plan point → the page point under it (inverse of the placement, with the zone offset)', () => {
		const pl = placementFromCalib({ origin: cal.origin, scale: { scale: cal.sf } }, 600, 400)!
		// the page point (120, 70) is drawn at x + 120·sf (+ the zone's 1000 mm offset)
		const plan = { x: pl.x + 120 * 10 + 1000, y: pl.y + 70 * 10 }
		expect(toPage(plan, u, cal)).toEqual({ x: 120, y: 70 })
	})
	it('scale: mm per point from the real distance (3 dp), the line kept for Uploads; crop: a whole-point box', () => {
		expect(scaleRecord({ x: 0, y: 0 }, { x: 30, y: 40 }, 5000)).toMatchObject({ x1: 0, y1: 0, x2: 30, y2: 40, units: 'mm', distance: 5000, scale: 100 })
		expect(scaleRecord({ x: 0, y: 0 }, { x: 0, y: 0 }, 5000)).toBeNull()
		expect(cropRecord({ x: 300.4, y: 50 }, { x: 10.6, y: 250.2 })).toEqual({ x: 11, y: 50, width: 289, height: 200 })
	})
	it('the tool: origin = one click; scale = two clicks, then the typed distance; it writes and goes back to Select', () => {
		let target: CalibTarget | null = { underlay: u, mode: 'origin' }
		const wrote: [string, unknown][] = []
		let done = 0, asked: ((v: number) => void) | null = null
		const t = new CalibrateTool(() => target, () => cal, (_u, f, v) => wrote.push([f, v]), () => { done++ })
		const ctx = { say: () => {}, ask: (_l: string, _v: number, apply: (v: number) => void) => { asked = apply } } as unknown as ToolCtx
		t.down(at(1000 + 300, 200), ctx)                         // page point (50 + 30, 20 + 20)
		expect(wrote.at(-1)).toEqual(['origin', { x: 80, y: 40 }])
		target = { underlay: u, mode: 'scale' }
		t.down(at(1000, 0), ctx); t.down(at(1000 + 300, 400), ctx)   // 500 mm apart now = 50 points
		asked!(10000)
		expect(wrote.at(-1)).toMatchObject(['scale', { distance: 10000, scale: 200 }])
		expect(done).toBe(2)
	})
})

describe('paper-scale calibration (W5)', () => {
	const A3 = { w: 1190.55, h: 841.89 }   // landscape A3 in points
	it('reads 100, 1:100, 1/100, "100 A1", "1:100 @ a1"; rejects the rest', () => {
		expect(parsePaperScale('100')).toEqual({ n: 100 })
		expect(parsePaperScale(' 1:100 ')).toEqual({ n: 100 })
		expect(parsePaperScale('1/50')).toEqual({ n: 50 })
		expect(parsePaperScale('100 A1')).toEqual({ n: 100, paper: 'A1' })
		expect(parsePaperScale('1:100 @ a1')).toEqual({ n: 100, paper: 'A1' })
		expect(parsePaperScale('1:100 at A3')).toEqual({ n: 100, paper: 'A3' })
		for (const bad of ['', 'abc', '0', '100 A7', '1:']) expect(parsePaperScale(bad)).toBeNull()
	})
	it('A3 at 1:100 → 35.278 mm per point; the line Uploads draws is a round number of metres', () => {
		const r = paperScaleRecord(100, A3)!
		expect(r.scale).toBe(35.278)
		expect(r.paper).toBe('1:100')
		expect(r.distance % 1000).toBe(0)
		expect(Math.abs((r.x2 - r.x1) * (100 * PT_MM) - r.distance)).toBeLessThan(5)   // the line is kept to 0.1 pt
		expect(r.x2).toBeLessThanOrEqual(A3.w)
		expect(ratioOf(r.scale)).toBe(100)
	})
	it('"1:100 at A1" printed on an A3 page: × 841 / 420', () => {
		const r = paperScaleRecord(100, A3, 'A1')!
		expect(r.scale).toBeCloseTo(100 * PT_MM * 841 / (A3.w * PT_MM), 2)
		expect(r.paper).toBe('1:100 at A1')
	})
	it('knows the page size; rejects a zero scale or an empty page', () => {
		expect(paperOf(A3)).toBe('A3')
		expect(paperOf({ w: 595, h: 842 })).toBe('A4')
		expect(paperOf({ w: 612, h: 792 })).toBeUndefined()   // US letter
		expect(paperScaleRecord(0, A3)).toBeNull()
		expect(paperScaleRecord(100, { w: 0, h: 0 })).toBeNull()
	})
})
