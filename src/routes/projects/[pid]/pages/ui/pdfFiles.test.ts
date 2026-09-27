import { describe, it, expect } from 'vitest'
import { replacedPdf, replacedImage } from './pdfFiles'
import type { Ent } from './geometry'

const img: Ent = { id: 'e1', type: 'image', a: [100, 200], b: [1100, 900], src: 'pdf:old.pdf#1', layer: 'floorplan', opacity: 0.6, live: true, crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } }
describe('replacedPdf (Replace PDF…)', () => {
	it('a calibrated page goes where Uploads calibrated it (crop too); layer / opacity / live stay', () => {
		const e = replacedPdf(img, 'new.pdf', 2, { origin: { x: 10, y: 20 }, scale: { scale: 2 }, crop: { x: 0, y: 0, width: 50, height: 25 } }, 100, 50)
		expect(e).toMatchObject({ src: 'pdf:new.pdf#2', a: [-20, -40], b: [180, 60], crop: { x: 0, y: 0, w: 0.5, h: 0.5 }, layer: 'floorplan', opacity: 0.6, live: true })
	})
	it('an uncalibrated page keeps the left / top and width, takes the new aspect, drops the crop', () => {
		const e = replacedPdf(img, 'new.pdf', 1, undefined, 200, 100)
		expect(e.a).toEqual([100, 200]); expect(e.b).toEqual([1100, 700]); expect(e.crop).toBeUndefined()
	})
	it('a picture (an uploaded URL) replaces the source the same way', () => {
		expect(replacedImage(img, 'https://x/plan.png', undefined, 400, 400)).toMatchObject({ src: 'https://x/plan.png', a: [100, 200], b: [1100, 1200] })
	})
})
