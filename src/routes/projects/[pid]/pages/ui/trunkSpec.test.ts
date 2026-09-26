import { describe, it, expect } from 'vitest'
import { specProfile, specZ, type TrunkSpec } from './trunkSpec.svelte'

describe('F1 trunk spec', () => {
	const s: TrunkSpec = { cat: 'TK300', shape: 'rect', w: 300, h: 150, loc: 'ceiling', z: 0 }
	it('a location sets the underside from the levels; the node sits at the profile centre', () => {
		expect(specZ(s, { ceilingTile: 2700 })).toBe(2500)
		expect(specProfile(s, { ceilingTile: 2700 })).toEqual({ w: 300, h: 150, edges: 4, z: 2575 })
		expect(specZ({ ...s, loc: 'plenum' }, undefined)).toBe(2650)
		expect(specZ({ ...s, loc: 'custom', z: 1200 }, undefined)).toBe(1200)
	})
	it('a round run is W × W with 16 edges', () => {
		expect(specProfile({ ...s, shape: 'round', w: 27, h: 999, loc: 'underfloor' }, undefined)).toEqual({ w: 27, h: 27, edges: 16, z: 14 })
	})
})
