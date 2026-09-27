import { describe, it, expect } from 'vitest'
import { resizeKeepCorner } from './resizeKeep'

// the drawn (rotated) top-left corner of a box
const drawnTL = (x: number, y: number, w: number, d: number, deg: number) => {
	const r = (deg * Math.PI) / 180, cx = x + w / 2, cy = y + d / 2
	return [cx + (-w / 2) * Math.cos(r) - (-d / 2) * Math.sin(r), cy + (-w / 2) * Math.sin(r) + (-d / 2) * Math.cos(r)]
}
describe('resizeKeepCorner (Properties › SIZE keeps the box in place)', () => {
	it('unrotated: the top-left stays', () => { expect(resizeKeepCorner(100, 200, 600, 1000, 0, 800, 1200)).toEqual([100, 200]) })
	it('rotated: the DRAWN top-left corner stays put', () => {
		for (const deg of [30, 90, 180, 270]) {
			const [x2, y2] = resizeKeepCorner(100, 200, 600, 1000, deg, 900, 700)
			const a = drawnTL(100, 200, 600, 1000, deg), b = drawnTL(x2, y2, 900, 700, deg)
			expect(b[0]).toBeCloseTo(a[0], 6); expect(b[1]).toBeCloseTo(a[1], 6)
		}
	})
})
