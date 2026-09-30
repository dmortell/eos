import { describe, it, expect } from 'vitest'
import { hiLoOf, defaultZ, withHiLo, zPresets, boxZ, HIGH_Z_FALLBACK } from './hiLo'
import type { Ent } from './geometry'

// levels are stored above the SLAB (Risers); FL±0 = the raised floor's top (ui/levels.ts)
const lv = { floorSlab: 0, raisedFloor: 100, ceilingTile: 2800, ceilingSlab: 3700 }
const outlet = (over: Partial<Ent> = {}): Ent => ({ id: 'o', type: 'insert', block: 'outlet-box', a: [0, 0], color: '#2563eb', attrs: { LABEL: '4A1', PORTS: '2', TYPE: 'printer' }, ...over })

describe('high / low level', () => {
	it('reads an outlet\'s level from its own field, else its fill; other shapes only from the field', () => {
		expect(hiLoOf(outlet({ fill: '#3b82f6' }))).toBe('low')
		expect(hiLoOf(outlet())).toBe('high')
		expect(hiLoOf(outlet({ fill: '#3b82f6', level: 'high' }))).toBe('high')
		expect(hiLoOf({ type: 'rect' })).toBeUndefined()
		expect(hiLoOf({ type: 'rect', level: 'low' })).toBe('low')
	})
	it('default heights above FL: low on the raised floor (a wall outlet +300), high mid-plenum', () => {
		expect(defaultZ('low', lv)).toBe(0)
		expect(defaultZ('low', lv, { wall: true })).toBe(300)
		expect(defaultZ('high', lv)).toBe(3150)   // ceiling 2700, slab above 3600 (from FL)
		expect(defaultZ('high', { raisedFloor: 100, ceilingTile: 2800 })).toBe(2800)   // no slab: 100 above the ceiling
		expect(defaultZ('high', null)).toBe(HIGH_Z_FALLBACK)
	})
	it('setting a level sets z and an outlet\'s fill (usage colour when low, none when high)', () => {
		const hi = withHiLo(outlet({ fill: '#3b82f6', z: 50 }), 'high', lv)
		expect([hi.level, hi.z, hi.fill]).toEqual(['high', 3150, 'none'])
		const lo = withHiLo(hi, 'low', lv)
		expect([lo.level, lo.z, lo.fill]).toEqual(['low', undefined, '#f97316'])   // printer orange; z 0 = not stored
		expect(withHiLo(outlet({ fill: '#123456' }), 'low', lv).fill).toBe('#123456')   // a filled one keeps its colour
		expect(withHiLo(outlet({ block: 'outlet-wall' }), 'low', lv).z).toBe(300)
		const r = withHiLo({ id: 'r', type: 'rect', a: [0, 0], b: [1, 1] }, 'high', lv)
		expect([r.level, r.z, r.fill]).toEqual(['high', 3150, undefined])
	})
	it('a 3D box: low on the floor, high centred in the plenum but never below the ceiling', () => {
		expect(boxZ('low', lv, 500)).toBe(0)
		expect(boxZ('high', lv, 300)).toBe(3000)    // plenum 2700..3600: middle 3150 − 150
		expect(boxZ('high', lv, 2000)).toBe(2700)   // too tall for the plenum: sits on the ceiling
	})
	it('Z presets per level', () => {
		expect(zPresets('low', lv).map((p) => p.z)).toEqual([0, 300, 1200])
		expect(zPresets('high', lv).map((p) => p.z)).toEqual([3150, 2700])
	})
})
