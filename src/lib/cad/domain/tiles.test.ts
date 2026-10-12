import { describe, it, expect } from 'vitest'
import { tileOffsets, tileLinesLocal, tilesTooFine, DEFAULT_TILES, MAX_TILE_LINES } from './tiles'
import { shapePrims } from '../views/plan'
import { gridStepOf } from '../editor/snap'
import { displayListToDxf } from '../render/dxf'
import type { Shape } from './shapes'

const box = (extra: Partial<Shape> = {}, rot = 0): Shape => ({ type: 'shape', id: 'B1', levelId: 'L1', geom: { kind: 'rect', centre: { x: 1000, y: 500 }, size: { x: 2000, y: 1300 }, rot }, ...extra }) as Shape

describe('a box’s floor-tile grid', () => {
	it('lines every tile from the left edge, none on the edges themselves', () => {
		expect(tileOffsets(2000, 600, 0)).toEqual([600, 1200, 1800])
		expect(tileOffsets(1800, 600, 0)).toEqual([600, 1200])
	})
	it('an offset slides the first line (only its remainder matters, either way)', () => {
		expect(tileOffsets(2000, 600, 100)).toEqual([100, 700, 1300, 1900])
		expect(tileOffsets(2000, 600, 700)).toEqual([100, 700, 1300, 1900])
		expect(tileOffsets(2000, 600, -500)).toEqual([100, 700, 1300, 1900])
	})
	it('the step is the typed grid step: the same rule as the status bar’s', () => {
		expect(gridStepOf(DEFAULT_TILES.mm)).toBe(600)
		expect(gridStepOf('0')).toBeNull()
		expect(tileOffsets(2000, gridStepOf('450,5')!, 0)).toEqual([450.5, 901, 1351.5, 1802])
	})
	it('a grid too fine to draw is left off', () => {
		expect(tileOffsets(100_000, 100, 0)).toEqual([])
		expect(tilesTooFine({ x: 100_000, y: 1000 }, { mm: 100, dx: 0, dy: 0 })).toBe(true)
		expect(tilesTooFine({ x: 2000, y: 1000 }, DEFAULT_TILES)).toBe(false)
		expect(MAX_TILE_LINES).toBeGreaterThan(50)
	})
	it('local lines: vertical ones run the box’s height, horizontal ones its width', () => {
		const ls = tileLinesLocal({ x: 2000, y: 1300 }, DEFAULT_TILES)
		expect(ls.length).toBe(3 + 2)
		expect(ls[0]).toEqual([{ x: -400, y: -650 }, { x: -400, y: 650 }])
		expect(ls[3]).toEqual([{ x: -1000, y: -50 }, { x: 1000, y: -50 }])
	})
	it('a box on the plan draws its tiles inside itself; a box without tiles draws none', () => {
		const lines = (s: Shape) => shapePrims(s, 1).filter((p) => p.k !== 'image' && p.cls === 'tile-line')
		expect(lines(box()).length).toBe(0)
		const t = lines(box({ tiles: DEFAULT_TILES }))
		expect(t.length).toBe(5)
		// the first line at 600 from the box’s left edge (x 0 → 600), spanning its height (y 0 → 1300 → 150..1150)
		const p = t[0]
		expect(p.k === 'line' && p.pts).toEqual([{ x: 600, y: -150 }, { x: 600, y: 1150 }])
		expect(t.every((q) => q.src === 'B1')).toBe(true)
	})
	it('a turned box turns its tiles with it', () => {
		const t = shapePrims(box({ tiles: { mm: 1000, dx: 0, dy: 0 } }, 90), 1).filter((p) => p.k !== 'image' && p.cls === 'tile-line')
		expect(t.length).toBe(1 + 1)   // 2000 wide → one line at 1000; 1300 tall → one at 1000
		const first = t[0]
		// the vertical (local) line is horizontal once turned a quarter
		expect(first.k === 'line' && Math.abs(first.pts[0].y - first.pts[1].y) < 1e-6).toBe(true)
	})
	it('the DXF puts them on their own layer', () => {
		const r = displayListToDxf(shapePrims(box({ tiles: DEFAULT_TILES }), 1))
		expect(r.text).toContain('A-FLOR-TILE')
	})
})
