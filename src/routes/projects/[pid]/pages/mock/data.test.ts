import { describe, it, expect } from 'vitest'
import { navDrawingId } from './data'

describe('navDrawingId (B18)', () => {
	it('finds a drawing node id by its label, at any depth', () => {
		expect(navDrawingId('33F — Floorplan')).toBe('f33-plan')
		expect(navDrawingId('IDF1 — Rack Elevation')).toBe('idf1-elev')
	})
	it('is undefined for a folder or an unknown label', () => {
		expect(navDrawingId('33F')).toBeUndefined()
		expect(navDrawingId('30F — Floorplan')).toBeUndefined()
	})
})
