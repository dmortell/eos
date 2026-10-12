// Containment fill from routed cables: d² against the inside area, per segment, the 40 % limit, tones, packing.
import { describe, it, expect } from 'vitest'
import { ProjectIndex } from './project'
import { fillBySegment, fillByRun, fillTone, packCables, sectionArea, cableOd } from './fill'
import type { Route } from './routing'
import type { Entity } from './drawing'

const run = { type: 'shape', id: 'T1', levelId: 'L1', section: { w: 100, h: 50 }, role: { kind: 'containment', form: 'trunk', tier: 'low' },
	geom: { kind: 'path', nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 1000, y: 0, z: 0 }, { id: 'c', x: 2000, y: 0, z: 0 }], segs: [{ id: 's0', a: 'a', b: 'b' }, { id: 's1', a: 'b', b: 'c', section: { w: 50, h: 50 } }] } }
const settings = { type: 'settings', id: 'settings', portSuffix: 'alpha', usages: [], defaults: {}, cableTypes: [{ id: 'cat6a', label: 'Cat6A', media: 'copper', color: '', diameterMm: 8 }, { id: 'os2', label: 'OS2', media: 'fibre', color: '' }] }
const link = (id: string, cableType: string) => ({ type: 'link', id, kind: 'horizontal', a: { on: 'P', port: 1 }, b: { on: 'O', port: 1 }, cableType, status: 'design' })

describe('fill', () => {
	const ix = new ProjectIndex([run, settings, ...Array.from({ length: 20 }, (_, i) => link(`K${i}`, i < 18 ? 'cat6a' : 'os2'))] as Entity[])
	const routes = new Map<string, Route>([...ix.links].map((l, i) => [l.id, { linkId: l.id, segs: i < 10 ? [{ shape: 'T1', seg: 's0' }, { shape: 'T1', seg: 's1' }] : [{ shape: 'T1', seg: 's0' }] }]))
	it('cables as d² against the inside area; a segment section overrides the run; the 40 % limit', () => {
		const f = fillBySegment(ix, routes)
		const s0 = f.get('T1:s0')!, s1 = f.get('T1:s1')!
		expect(s0.cables).toEqual({ cat6a: 18, os2: 2 })
		expect(s0.cableMm2).toBe(18 * 64 + 2 * 9)           // Cat6A set to 8 mm; OS2 none set → 3 mm
		expect(s0.pct).toBeCloseTo((18 * 64 + 18) / (94 * 44) * 100)   // inside a 3 mm wall: 28.3 %
		expect(s1.pct).toBeCloseTo((10 * 64) / (44 * 44) * 100)        // 33.1 % in the narrower 50×50
		expect(fillByRun(f).get('T1')!.seg).toBe('s1')
		expect(fillBySegment(ix, routes, 20).get('T1:s0')!.over).toBe(true)
	})
	it('cables added by hand: on every segment or one, with their own Ø, before any route (T080)', () => {
		const hand = { ...run, role: { ...run.role, extra: [{ type: 'power', n: 4, d: 10 }, { type: 'cat6a', n: 2, seg: 's1' }, { type: 'coax', n: 0 }] } }
		const f = fillBySegment(new ProjectIndex([hand, settings] as Entity[]), new Map())
		expect(f.get('T1:s0')!.cables).toEqual({ power: 4 })
		expect(f.get('T1:s1')!).toMatchObject({ cables: { power: 4, cat6a: 2 }, hand: { power: 4, cat6a: 2 }, od: { power: 10 }, cableMm2: 4 * 100 + 2 * 64 })
		// added to the routed ones
		const both = fillBySegment(new ProjectIndex([hand, settings, ...ix.links] as Entity[]), routes).get('T1:s0')!
		expect(both.cables).toEqual({ cat6a: 18, os2: 2, power: 4 })
		expect(both.cableMm2).toBe(18 * 64 + 2 * 9 + 400)
	})
	it('round conduits use πr²; tones; unknown types fall back by media', () => {
		expect(sectionArea({ w: 20, h: 20, round: true })).toBeCloseTo(Math.PI * 49)   // Ø20 less a 3 mm wall: Ø14
		expect(sectionArea({ w: 100, h: 50, inner: { w: 90, h: 40 } })).toBe(90 * 40)   // its own inside size wins
		expect(sectionArea({ w: 100, h: 50 })).toBe(94 * 44)   // else 3 mm walls (legacy Fill rate)
		expect([fillTone(10), fillTone(31), fillTone(41)]).toEqual(['ok', 'warn', 'over'])
		expect(cableOd(undefined, 'cat6')).toBe(7)
	})
	it('packs cables without overlap inside the section, lowest first', () => {
		const p = packCables({ w: 100, h: 50 }, { cat6a: 10 }, () => 9)
		expect(p.cables).toHaveLength(10)
		expect(p.dropped).toBe(0)
		for (const a of p.cables) {
			expect(Math.abs(a.x) + a.r).toBeLessThanOrEqual(47.01); expect(Math.abs(a.y) + a.r).toBeLessThanOrEqual(22.01)   // inside the walls
			for (const b of p.cables) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r - 0.06)
		}
		expect(Math.max(...p.cables.map((c) => c.y))).toBeCloseTo(22 - 4.5)   // settled on the inside bottom
		expect(packCables({ w: 20, h: 20, round: true }, { cat6a: 50 }, () => 9).dropped).toBeGreaterThan(40)
	})
	it('cables past the drawing cap are counted as capped, not as "don’t fit" (Q27)', () => {
		const p = packCables({ w: 600, h: 600 }, { cat6a: 450 }, () => 2)
		expect([p.cables.length, p.dropped, p.capped]).toEqual([400, 0, 50])
		expect(packCables({ w: 100, h: 50 }, { cat6a: 10 }, () => 9).capped).toBe(0)
	})
})
