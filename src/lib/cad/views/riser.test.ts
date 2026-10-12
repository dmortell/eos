// The riser view: floors, rooms at their racks' x, risers between levels, backbone groups with counts and lengths.
import { describe, it, expect } from 'vitest'
import { ProjectIndex } from '../domain/project'
import { riserDisplayList, riserShafts, backboneKey, mediaColour, withRiserEnd, FIBRE_COLOUR, COPPER_COLOUR } from './riser'
import type { Entity } from '../domain/drawing'

const level = (id: string, name: string, e: number) => ({ type: 'level', id, name, number: 1, elevationMm: e, order: 1, heights: { slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2600, plenumMm: 700 } })
const path = (id: string, levelId: string, pts: [number, number, number, string?][], label?: string) => ({
	type: 'shape', id, levelId, label, section: { w: 100, h: 50 }, role: { kind: 'containment', form: 'trunk', tier: 'low' },
	geom: { kind: 'path', nodes: pts.map(([x, y, z, l], i) => ({ id: `${id}${i}`, x, y, z, ...(l ? { levelId: l } : {}) })), segs: pts.slice(1).map((_, i) => ({ id: `${id}s${i}`, a: `${id}${i}`, b: `${id}${i + 1}` })) },
})
const ents = [
	level('L1', '1F', 0), level('L4', '4F', 11400),
	{ type: 'space', id: 'S1', levelId: 'L1', name: 'IDF1', kind: 'server room' }, { type: 'space', id: 'S4', levelId: 'L4', name: 'Server room A', kind: 'server room' },
	{ type: 'rack', id: 'R1', levelId: 'L1', spaceId: 'S1', order: 1, name: 'P3A', kind: '2-post', heightU: 45, widthMm: 600, depthMm: 520, at: { x: 10495, y: -2727 } },
	{ type: 'rack', id: 'R4', levelId: 'L4', spaceId: 'S4', order: 1, name: '4AR01', kind: '4-post', heightU: 42, widthMm: 700, depthMm: 800, at: { x: 10495, y: -1500 } },
	{ type: 'device', id: 'PP1', rackId: 'R1', name: 'PP1', kind: 'panel', u: 41, heightU: 1, face: 'both', portCount: 24 },
	{ type: 'device', id: 'PP2', rackId: 'R4', name: 'PP2', kind: 'panel', u: 10, heightU: 1, face: 'both', portCount: 24 },
	path('TR1', 'L1', [[7920, -2600, 2600], [10210, -2600, 2600]]),
	path('RA', 'L1', [[10210, -2600, 2600], [10210, -2600, 0, 'L4']], 'Riser A'),
	path('T4', 'L4', [[10210, -2600, 0], [10210, -1500, 0]]),
	...[1, 2].map((n) => ({ type: 'link', id: `B${n}`, kind: 'backbone', a: { on: 'PP1', port: n, face: 'rear' }, b: { on: 'PP2', port: n, face: 'rear' }, cableType: 'cat6a', status: 'design' })),
] as Entity[]

describe('riser view', () => {
	const ix = new ProjectIndex(ents)
	it('finds risers: vertical runs between levels', () => {
		expect(riserShafts(ix).map((s) => [s.s.id, s.z0, s.z1])).toEqual([['RA', 2600, 11400]])
	})
	it('draws floors, rooms, the riser and one backbone group through it', () => {
		const ps = riserDisplayList(ix)
		expect(ps.filter((p) => p.k === 'line' && p.cls === 'riser-ffl').map((p) => p.k === 'line' && p.pts[0].y)).toEqual([-0, -11400])
		expect(ps.filter((p) => p.k === 'line' && p.cls === 'riser-room').map((p) => p.src)).toEqual(['S1', 'S4'])
		const bb = ps.filter((p) => p.k === 'line' && p.cls === 'backbone')
		expect(bb).toHaveLength(1)
		expect(bb[0].k === 'line' && bb[0].pts.length).toBe(6)   // room → down into the floor void (low runs) → riser → up → void → room
		const label = ps.find((p) => p.k === 'text' && p.cls === 'backbone-label')
		expect(label?.k === 'text' && label.text).toMatch(/^2 × cat6a · \d+m$/)
	})
	it('hide empty floors: floors with no server room squeeze into one break band; the riser and rooms follow', () => {
		const more = [...ents, level('L2', '2F', 3800), level('L3', '3F', 7600)] as Entity[]
		const ps = riserDisplayList(new ProjectIndex(more), { hideEmpty: true })
		const ffl = ps.filter((p) => p.k === 'line' && p.cls === 'riser-ffl').map((p) => (p.k === 'line' ? -p.pts[0].y : 0))
		expect(ffl).toEqual([0, 3800 + 1200])                                      // 1F, then 4F right after one 1200 break (2F + 3F)
		expect(ps.some((p) => p.k === 'text' && p.text === '2F – 3F not shown')).toBe(true)
		const shaft = ps.find((p) => p.k === 'line' && p.cls === 'riser-shaft')
		expect(shaft?.k === 'line' && Math.min(...shaft.pts.map((q) => q.y))).toBe(-(3800 + 1200))   // the riser now ends at 4F's squeezed FFL
		expect(riserDisplayList(new ProjectIndex(more)).filter((p) => p.k === 'line' && p.cls === 'riser-ffl')).toHaveLength(4)   // off: all floors
	})
	it('hide empty floors also squeezes floors that have no level at all (1F → 4F with nothing between)', () => {
		const ps = riserDisplayList(new ProjectIndex(ents), { hideEmpty: true })
		expect(ps.filter((p) => p.k === 'line' && p.cls === 'riser-ffl').map((p) => (p.k === 'line' ? -p.pts[0].y : 0))).toEqual([0, 3800 + 1200])
		expect(ps.some((p) => p.k === 'text' && p.text === 'floors with no level')).toBe(true)
	})
	it('each storey stacks as a section: slab under the raised floor, white voids, the room to the ceiling, the roof slab', () => {
		const ps = riserDisplayList(ix)
		const ys = (cls: string) => ps.filter((p) => p.k === 'line' && p.cls === cls).map((p) => (p.k === 'line' ? [-Math.max(...p.pts.map((q) => q.y)), -Math.min(...p.pts.map((q) => q.y))] : []))
		// 1F (FFL 0): slab −500…−300 (top at FFL − raised floor); 4F (FFL 11400): slab 10900…11100; the roof slab above 4F
		expect(ys('riser-slab')).toEqual(expect.arrayContaining([[-500, -300], [10900, 11100], [11400 + 2600 + 700, 11400 + 2600 + 700 + 200], [3300, 3500]]))   // 1F gets one too: 4F's slab isn't on it
		// stacked floors share one slab: a 1F at 0 and a 2F at 3800 (slab 3300…3500) — no second slab drawn
		const stacked = riserDisplayList(new ProjectIndex([...ents, level('L2', '2F', 3800)] as Entity[]))
			.filter((p) => p.k === 'line' && p.cls === 'riser-slab' && Math.abs(-Math.max(...p.pts.map((q) => q.y)) - 3300) < 1)
		expect(stacked).toHaveLength(1)   // 2F's own slab only
		// the voids stay white (no shading)
		expect(ys('riser-void')).toEqual([])
		// a room fills its storey up to the ceiling
		const room = ps.find((p) => p.k === 'line' && p.cls === 'riser-room')
		expect(room?.k === 'line' && -Math.min(...room.pts.map((q) => q.y))).toBe(2600)
	})
	it('says so when there is nothing to show', () => {
		const ps = riserDisplayList(new ProjectIndex([level('L1', '1F', 0)] as Entity[]))
		expect(ps[0]).toMatchObject({ k: 'text', text: 'No risers or placed server rooms yet' })
	})

	it('riser view control: the floor range, an EPS box where a riser passes a floor, HIGH / LOW on its label', () => {
		const numbered = ents.map((e) => (e.type === 'level' ? { ...e, number: e.id === 'L1' ? 1 : 4 } : e)) as Entity[]
		const mid = [...numbered, { ...level('L2', '2F', 3800), number: 2 }] as Entity[]
		const settings = (riser: object) => ({ type: 'settings', id: 'settings', cableTypes: [], usages: [], defaults: {}, riser }) as unknown as Entity
		const all = riserDisplayList(new ProjectIndex(mid))
		expect(all.filter((p) => p.k === 'line' && p.cls === 'riser-eps')).toHaveLength(1)   // on 2F (1F and 4F: inside their server rooms)
		expect(all.some((p) => p.k === 'text' && p.text === 'Riser A · LOW')).toBe(true)
		const cut = riserDisplayList(new ProjectIndex([...mid, settings({ from: 1, to: 2 })]))
		expect(cut.filter((p) => p.k === 'line' && p.cls === 'riser-ffl')).toHaveLength(2)    // 1F, 2F
		expect(cut.filter((p) => p.k === 'line' && p.cls === 'riser-room').map((p) => p.src)).toEqual(['S1'])
		const shaft = cut.find((p) => p.k === 'line' && p.cls === 'riser-shaft')
		expect(shaft?.k === 'line' && -Math.min(...shaft.pts.map((q) => q.y))).toBe(3800 + 2600 + 700 + 200)   // cut at 2F's slab above
		expect(cut.some((p) => p.k === 'line' && p.cls === 'backbone')).toBe(false)   // its other end (4F) isn't shown
	})
	it('a backbone group: its own label and color; else fibre amber / copper blue; each hop in the floor void for low runs', () => {
		const key = backboneKey(new ProjectIndex(ents), ents.find((e) => e.id === 'B1') as never)!
		expect(key).toBe('R1|R4|cat6a')
		const plain = riserDisplayList(new ProjectIndex(ents))
		expect(plain.find((p) => p.k === 'line' && p.cls === 'backbone')?.color).toBe(COPPER_COLOUR)
		const line = plain.find((p) => p.k === 'line' && p.cls === 'backbone')
		const ys = line?.k === 'line' ? line.pts.map((q) => -q.y) : []
		expect(ys[1]).toBeLessThan(0)                   // 1F (FFL 0): down into the void under it
		expect(ys[1]).toBeGreaterThan(-300)
		const own = riserDisplayList(new ProjectIndex([...ents, { type: 'settings', id: 'settings', cableTypes: [], usages: [], defaults: {}, riser: { groups: { [key]: { label: 'Backbone A', color: '#16a34a' } } } } as unknown as Entity]))
		expect(own.find((p) => p.k === 'text' && p.cls === 'backbone-label')).toMatchObject({ text: 'Backbone A', color: '#16a34a' })
		expect(mediaColour(new ProjectIndex(ents), 'OM4 24c')).toBe(FIBRE_COLOUR)
	})
	it('the floor range (riser view Properties): one end set or cleared, the other and the groups kept (Review 2 Q51)', () => {
		const groups = { k: { label: 'A' } }
		expect(withRiserEnd(undefined, 'from', 3)).toEqual({ from: 3 })
		expect(withRiserEnd({ from: 3, groups }, 'to', 12)).toEqual({ from: 3, to: 12, groups })
		expect(withRiserEnd({ from: 3, to: 12, groups }, 'from', null)).toEqual({ to: 12, groups })
	})
})
