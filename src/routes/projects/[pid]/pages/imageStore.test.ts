import { describe, it, expect } from 'vitest'
import { internImage, imageSrc } from './imageStore'

describe('imageStore (P3 short term)', () => {
	const data = 'data:image/png;base64,' + 'A'.repeat(5000)
	it('interns a data-URL as a short key that resolves back to the data', () => {
		const key = internImage(data)
		expect(key.startsWith('img:')).toBe(true)
		expect(key.length).toBeLessThan(20)
		expect(imageSrc(key)).toBe(data)
	})
	it('reuses the key for the same image', () => {
		expect(internImage(data)).toBe(internImage(data))
	})
	it('passes plain URLs through, both ways', () => {
		expect(internImage('/trump-juvenile.jpg')).toBe('/trump-juvenile.jpg')
		expect(imageSrc('/trump-juvenile.jpg')).toBe('/trump-juvenile.jpg')
	})
	it('an unknown key (e.g. after a reload) renders as empty, never as the key', () => {
		expect(imageSrc('img:missing')).toBe('')
		expect(imageSrc(undefined)).toBe('')
	})
})
