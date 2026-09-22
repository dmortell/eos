import { describe, it, expect } from 'vitest'
import { resizeSectionClip, pickSectionGrip } from './grips'
import type { Mapper } from './mapper'
import type { Clip } from '../3dview/types'

const clip: Clip = { x0: 0, y0: 0, z0: 0, x1: 100, y1: 100, z1: 10 }

// A trivial mapper: model coords map 1:1 to client px (identity), so a corner at (x,y) is at (x,y) px.
const idMapper: Mapper = { toModel: (cx, cy) => [cx, cy], toClient: (x, y) => ({ x, y }), tolMm: (px) => px }

describe('resizeSectionClip', () => {
	it('normalises the dragged corner + fixed anchor into min/max, keeping z', () => {
		expect(resizeSectionClip(clip, [140, 30], [20, 90])).toEqual({ x0: 20, y0: 30, z0: 0, x1: 140, y1: 90, z1: 10 })
	})
})

describe('pickSectionGrip', () => {
	const sel = { id: 's1', clip }
	it('grabs the corner within 14px and resizes about the opposite one, else null', () => {
		const g = pickSectionGrip(idMapper, sel, 2, 2)   // near the (0,0) corner (gi 0)
		expect(g?.id).toBe('s1')
		// gi 0's opposite corner is (x1,y1) = (100,100); dragging to (10,10) → box (10,10)-(100,100)
		expect(g?.apply([10, 10])).toEqual({ x0: 10, y0: 10, z0: 0, x1: 100, y1: 100, z1: 10 })
		expect(pickSectionGrip(idMapper, sel, 50, 50)).toBe(null)   // centre → no corner
	})
})
