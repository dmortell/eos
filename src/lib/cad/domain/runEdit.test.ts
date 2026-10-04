// Run edits shared by one run's and several runs' Properties (Dave, 2026-10-05).
import { describe, it, expect } from 'vitest'
import { makePath, toContainment } from './make'
import { convertRun, kindOf, placeNow, setRunPlace, mainZ } from './runEdit'
import type { Shape } from './shapes'

const heights = { raisedFloorMm: 300, clearHeightMm: 2700, plenumMm: 600 }
const trunk = (z: number) => toContainment(makePath({ levelId: 'L' }, [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 0, z: 300 }], { z }), { w: 100, h: 50 }, { tier: 'low', form: 'trunk' })

describe('run edits', () => {
	it('location: the main-height nodes move, a drop keeps its end; the tier follows', () => {
		const s = trunk(-150)
		expect(placeNow(s, heights)).toBe('floor')
		const up = setRunPlace(s, heights, 'plenum') as Shape
		expect(up.role).toMatchObject({ tier: 'high' })
		expect(mainZ(up)).toBe(3000)
		expect(up.geom.kind === 'path' && up.geom.nodes.map((n) => n.z)).toEqual([3000, 3000, 300])
		expect(placeNow(up, heights)).toBe('plenum')
		expect(setRunPlace(s, undefined, 'plenum')).toBeNull()   // a level without heights
	})
	it('convert keeps the geometry and the width; a conduit is round', () => {
		const s = trunk(-150), c = convertRun(s, 'conduit')
		expect(kindOf(c)).toBe('conduit')
		expect(c.section).toMatchObject({ w: 100, h: 100, round: true })
		expect(c.geom).toEqual(s.geom)
		expect(kindOf(convertRun(s, 'line'))).toBe('line')
	})
})
