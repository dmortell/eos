import { describe, it, expect } from 'vitest'
import { sectionBand, hitBand, bandGrips, applyBandGrip } from './sectionElev'
import type { LineSection, BoxSection } from '../3dview/types'

// a FRONT elevation: u = x, drawing y = ground − z (ground 10000)
const toDraw = (p: { x: number; y: number; z: number }): [number, number] => [p.x, 10000 - p.z]
const model = { z0: 0, z1: 3200 }
const line: LineSection = { id: 'A', kind: 'line', a: [1000, 0], b: [5000, 0], depth: 2000, name: 'A' }

describe('sections seen in an elevation', () => {
	it('a line section that sees every height spans the model; its width = the cut region along the view', () => {
		const b = sectionBand(line, toDraw, model)
		expect(b).toMatchObject({ u0: 1000, u1: 5000, top: 10000 - 3200, bot: 10000, all: true, z0: 0, z1: 3200, label: 'Section A–A′' })
		const banded = sectionBand({ ...line, z0: 500, z1: 2400 }, toDraw, model)
		expect([banded.top, banded.bot, banded.all]).toEqual([7600, 9500, false])
	})
	it('picks on its outline; the handles sit mid top / bottom edge', () => {
		const b = sectionBand(line, toDraw, model)
		expect(hitBand(b, [3000, 6800], 20)).toBe(true)    // on the top edge
		expect(hitBand(b, [3000, 8000], 20)).toBe(false)   // inside, away from the edges
		expect(bandGrips(b)).toEqual([{ key: 'z1', p: [3000, 6800] }, { key: 'z0', p: [3000, 10000] }])
	})
	it('dragging a handle sets an explicit band that never inverts; a box section moves its clip', () => {
		const b = sectionBand(line, toDraw, model)
		expect(applyBandGrip(line, b, 'z1', 2400.4)).toEqual({ z0: 0, z1: 2400 })
		expect(applyBandGrip(line, b, 'z0', 5000)).toEqual({ z0: 3199, z1: 3200 })
		const box: BoxSection = { id: 'B', clip: { x0: 0, y0: 0, z0: 0, x1: 100, y1: 100, z1: 3000 }, dir: 'front' }
		expect(applyBandGrip(box, sectionBand(box, toDraw, model), 'z0', 300)).toEqual({ clip: { x0: 0, y0: 0, z0: 300, x1: 100, y1: 100, z1: 3000 } })
	})
})
