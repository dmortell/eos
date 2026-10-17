// A sheet from an EMPTY floor's plan (Round 8 #5): the floor's sheet at 1:100 filling the drawing area, not a strip
// the size of the pane.
import { describe, it, expect } from 'vitest'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { blankSheet, viewViewport } from './sheet'
import type { Entity } from '../domain/drawing'

describe('a sheet from an empty plan', () => {
	it('fills the drawing area at 1:100', () => {
		const L = { type: 'level', id: 'LE', buildingId: 'B', number: 40, name: '40F', order: 40, elevationMm: 150000 } as Entity
		const ix = new ProjectIndex([...demoProject(), L])
		const sheet = blankSheet([], 'SH')
		const vp = viewViewport(ix, sheet, { levelId: 'LE', spec: { kind: 'plan' } }, { x0: 0, y0: 0, x1: 28300, y1: 10500 }, 'V')
		const full = viewViewport(ix, sheet, { levelId: 'LE', spec: { kind: 'plan' } }, { x0: 0, y0: 0, x1: 900000, y1: 900000 }, 'V')
		expect(vp.scale).toBe(100)
		expect(vp.rect).toEqual(full.rect)   // the whole area, as a zoomed-out floor gets
	})
})
