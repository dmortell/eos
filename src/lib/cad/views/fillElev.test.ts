// Fill rates in an elevation / section (User 2026-10-17): risers and vertical runs get their band and % too.
import { describe, it, expect } from 'vitest'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import { fillBandsElev } from './overlays'
import { spaceOf } from './space'
import type { Entity } from '../domain/drawing'

const L34 = { type: 'level', id: 'L34', buildingId: 'B', number: 34, name: '34F', order: 34, elevationMm: 136000 } as Entity
const riser = { type: 'shape', id: 'RS', levelId: 'L33', role: { kind: 'containment', form: 'trunk', tier: 'high' }, section: { w: 100, h: 50 },
	geom: { kind: 'path', nodes: [{ id: 'n0', x: 500, y: 500, z: 2900 }, { id: 'n1', x: 500, y: 500, z: 0, levelId: 'L34' }], segs: [{ id: 's0', a: 'n0', b: 'n1' }] } } as Entity

describe('fill bands in an elevation', () => {
	it('a riser gets its band and %; end-on in a plan it would not', () => {
		const ix = new ProjectIndex([...demoProject(), L34, riser])
		const out = fillBandsElev(ix, [{ shape: 'RS', seg: 's0', pct: 42 }], 'L33', spaceOf({ kind: 'elevation', dir: 'front' }), 100)
		expect(out.filter((p) => p.k === 'text').map((p) => (p.k === 'text' ? p.text : ''))).toEqual(['42%'])
		const band = out.find((p) => p.k === 'line')
		expect(band?.k === 'line' && Math.abs(band.pts[0].y - band.pts[1].y)).toBeGreaterThan(1000)   // drawn upright
		// a section whose cut misses it: nothing
		expect(fillBandsElev(ix, [{ shape: 'RS', seg: 's0', pct: 42 }], 'L33', spaceOf({ kind: 'elevation', dir: 'front' }), 100, { near: 50, far: -50, u0: 5000, u1: 9000 })).toEqual([])
	})
})
