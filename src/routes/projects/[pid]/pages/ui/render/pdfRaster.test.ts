import { describe, it, expect, vi } from 'vitest'
// pdf.js / Firestore aren't needed for the pure helpers — stub the two heavy imports
vi.mock('$lib', () => ({ Firestore: class {} }))
vi.mock('../../../uploads/parts/PdfState.svelte', () => ({ PdfState: class {} }))
const { placementFromCalib, pdfSrc, parsePdfSrc } = await import('./pdfRaster.svelte')

describe('floorplan placement from the Outlets / Uploads calibration', () => {
	it('puts the calibrated origin at model (0,0) with scale = mm per rendered px', () => {
		expect(placementFromCalib({ origin: { x: 100, y: 50 }, scale: { scale: 10 } }, 2000, 1000)).toEqual({ a: [-1000, -500], b: [19000, 9500] })
	})
	it('a page with a scale but no origin sits with its top-left at (0,0); no scale → not placed', () => {
		expect(placementFromCalib({ scale: { scale: 2 } }, 100, 50)).toEqual({ a: [0, 0], b: [200, 100] })
		expect(placementFromCalib({ origin: { x: 1, y: 1 } }, 100, 50)).toBeNull()
		expect(placementFromCalib(undefined, 100, 50)).toBeNull()
	})
	it('turns the page crop (px) into the image shape\'s normalized crop', () => {
		expect(placementFromCalib({ scale: { scale: 1 }, crop: { x: 50, y: 25, width: 100, height: 50 } }, 200, 100)!.crop).toEqual({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 })
	})
	it('pdf image src round-trips', () => {
		expect(pdfSrc('Plan.pdf', 2)).toBe('pdf:Plan.pdf#2')
		expect(parsePdfSrc('pdf:Plan.pdf#2')).toEqual({ fileId: 'Plan.pdf', page: 2 })
		expect(parsePdfSrc('img:x')).toBeNull()
	})
})
