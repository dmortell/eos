import { describe, it, expect } from 'vitest'
import { gridLevels, gridAlpha, gridPath, gridPaths, GRID_MIN_PX, GRID_RATIO, GRID_MAX_LINES } from './grid'

describe('grid levels for a zoom', () => {
	it('minor = the snap step while it is at least GRID_MIN_PX apart on screen', () => {
		const lv = gridLevels(10, 2)!   // 10 mm = 20 px
		expect(lv.minor.step).toBe(10)
		expect(lv.major.step).toBe(10 * GRID_RATIO)
	})
	it('zoomed out, the minor steps up by ×10 until it is at least GRID_MIN_PX apart', () => {
		const lv = gridLevels(10, 0.02)!   // 10 mm = 0.2 px → 100 = 2 px → 1000 = 20 px
		expect(lv.minor.step).toBe(1000)
		expect(lv.major.step).toBe(10000)
		expect(lv.minor.step * 0.02).toBeGreaterThanOrEqual(GRID_MIN_PX)
	})
	it('never denser than GRID_MIN_PX at any zoom', () => {
		for (const px of [1e-5, 0.003, 0.07, 0.59, 0.6, 0.61, 4, 55]) {
			const lv = gridLevels(44.45, px)!   // 1U steps
			expect(lv.minor.step * px).toBeGreaterThanOrEqual(GRID_MIN_PX - 1e-9)
			expect(lv.minor.step * px).toBeLessThan(Math.max(GRID_MIN_PX * GRID_RATIO, 44.45 * px) + 1e-9)
		}
	})
	it('minor lines fade in as they open up; majors are full strength', () => {
		expect(gridAlpha(GRID_MIN_PX)).toBe(0)
		expect(gridAlpha(GRID_MIN_PX * GRID_RATIO)).toBeCloseTo(1)
		expect(gridAlpha(20)).toBeGreaterThan(0)
		expect(gridAlpha(20)).toBeLessThan(1)
		expect(gridAlpha(1000)).toBe(1)
		expect(gridLevels(10, 0.9)!.minor.alpha).toBeGreaterThan(gridLevels(10, 0.7)!.minor.alpha)   // 9 px vs 7 px
		expect(gridLevels(10, 0.7)!.major.alpha).toBe(1)
	})
	it('continuous at the switch-over: the old major becomes the new minor at the same strength', () => {
		const before = gridLevels(10, 0.6001)!, after = gridLevels(10, 0.5999)!
		expect(before.minor.step).toBe(10)
		expect(after.minor.step).toBe(100)
		expect(before.minor.alpha).toBeCloseTo(0, 3)
		expect(after.minor.alpha).toBeCloseTo(before.major.alpha, 3)
	})
	it('a bad step or scale → null', () => {
		expect(gridLevels(0, 1)).toBeNull()
		expect(gridLevels(10, 0)).toBeNull()
		expect(gridLevels(10, NaN)).toBeNull()
	})
})

describe('grid paths', () => {
	it('lines at multiples of the step across the box, as one path', () => {
		expect(gridPath(10, 5, 5, 25, 25)).toBe('M10 5V25M20 5V25M5 10H25M5 20H25')
	})
	it('skips the major multiples (drawn by their own path), negatives included', () => {
		const d = gridPath(10, -150, -5, 150, 5, 100)
		expect(d).not.toContain('M-100 ')
		expect(d).not.toContain('M0 ')
		expect(d).not.toContain('M100 ')
		expect(d).toContain('M-90 ')
		expect(d).toContain('M90 ')
	})
	it('empty for an empty box, or one that would need too many lines', () => {
		expect(gridPath(10, 0, 0, 0, 10)).toBe('')
		expect(gridPath(1, 0, 0, GRID_MAX_LINES, GRID_MAX_LINES)).toBe('')
	})
	it('gridPaths: no minor path while it is invisible', () => {
		const g = gridPaths(10, 0.6, [0, 0, 1000, 1000])!   // minor exactly GRID_MIN_PX apart → alpha 0
		expect(g.minor).toBe('')
		expect(g.major).toContain('M100 0V1000')
	})
})
