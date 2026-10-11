// Calibrating a floorplan in place (backlog "Calibrate an image in place"): plan points back to page points, and the
// records Uploads keeps (origin, scale, crop in page points).
import { describe, it, expect } from 'vitest'
import { toPage, scaleRecord, cropRecord, CalibrateTool, type CalibTarget } from './calibrateTool'
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
