import { describe, it, expect } from 'vitest'
import { modelUnitToPaperMm, modelUnitToPaperPx, scaleDenom, PT_MM, PAPER_PX_PER_MM } from './constants'

// B2: a paper viewport frame renders at TRUE 1:N scale.
describe('drawing scale on paper (B2)', () => {
	it('1 model unit = 1 paper mm at 1:1', () => {
		expect(modelUnitToPaperMm(1)).toBe(1)
	})
	it('a 1000 mm object in a 1:100 frame is 10 mm on paper', () => {
		expect(1000 * modelUnitToPaperMm(100)).toBeCloseTo(10, 9)
	})
	it('a 1000 mm object in a 1:25 frame is 40 mm on paper', () => {
		expect(1000 * modelUnitToPaperMm(25)).toBeCloseTo(40, 9)
	})
	it('paper px derives from paper mm × PAPER_PX_PER_MM', () => {
		expect(modelUnitToPaperPx(100)).toBeCloseTo(0.01 * PAPER_PX_PER_MM, 9)
	})
	it('guards against a zero/NaN scale (falls back to 1:1)', () => {
		expect(modelUnitToPaperMm(0)).toBe(1)
	})
})

describe('scaleDenom', () => {
	it('reads the N of 1:N', () => {
		expect(scaleDenom('1:100')).toBe(100)
		expect(scaleDenom('1:25')).toBe(25)
		expect(scaleDenom('1:1')).toBe(1)
	})
	it('falls back to 1:1 for a missing, malformed or zero scale', () => {
		expect(scaleDenom(undefined)).toBe(1)
		expect(scaleDenom('')).toBe(1)
		expect(scaleDenom('1:0')).toBe(1)
		expect(scaleDenom('1:')).toBe(1)
		expect(scaleDenom('abc')).toBe(1)
	})
	it('sizes an annotative 10 pt text in model mm at 1:100', () => {
		expect(10 * PT_MM * scaleDenom('1:100')).toBeCloseTo(352.778, 6)
	})
})
