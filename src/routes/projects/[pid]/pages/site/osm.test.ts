import { describe, it, expect } from 'vitest'
import { parseLen, heightsOf, joinRings, toBuildings, pickTarget, partsOf, factsOf, inRing, overpassQuery, type OverpassJson } from './osm'

const sq = (lat: number, lon: number, d: number) => [{ lat, lon }, { lat, lon: lon + d }, { lat: lat + d, lon: lon + d }, { lat: lat + d, lon }, { lat, lon }]

describe('site OSM data', () => {
	it('lengths and heights from tags (Simple 3D Buildings)', () => {
		expect(parseLen('45')).toBe(45); expect(parseLen('45.5 m')).toBe(45.5); expect(parseLen('100 ft')).toBeCloseTo(30.48); expect(parseLen('tall')).toBeUndefined()
		expect(heightsOf({ height: '120' }, false)).toMatchObject({ minH: 0, h: 120, roofH: 0 })
		expect(heightsOf({ 'building:levels': '10' }, false)).toMatchObject({ h: 32, levels: 10 })
		expect(heightsOf({ 'building:levels': '5', 'building:min_level': '2' }, true)).toMatchObject({ minH: 6.4, h: 16 })
		expect(heightsOf({ height: '20', 'roof:shape': 'gabled', 'roof:height': '4' }, false)).toMatchObject({ h: 16, roofH: 4 })
		expect(heightsOf({}, false).h).toBeCloseTo(9.6)   // untagged: 3 storeys
	})
	it('multipolygon pieces join into closed rings (either direction)', () => {
		const a = [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }], b = [{ lat: 1, lon: 1 }, { lat: 0, lon: 1 }], c = [{ lat: 1, lon: 1 }, { lat: 1, lon: 0 }, { lat: 0, lon: 0 }]
		const [r] = joinRings([a, b, c]); expect(r).toHaveLength(5); expect(r[0]).toEqual(r[4])
	})
	it('elements → local-metre footprints; the target is the one at the site; parts belong to it; facts', () => {
		const js: OverpassJson = { elements: [
			{ type: 'way', id: 1, tags: { building: 'office', name: 'Tower', height: '100', 'building:levels': '25' }, geometry: sq(-0.0005, -0.0005, 0.001) },
			{ type: 'way', id: 2, tags: { 'building:part': 'yes', 'building:levels': '30' }, geometry: sq(-0.0002, -0.0002, 0.0004) },
			{ type: 'way', id: 3, tags: { building: 'yes' }, geometry: sq(0.002, 0.002, 0.0005) },
			{ type: 'way', id: 4, tags: { highway: 'residential' }, geometry: sq(0, 0, 0.001) },
		] }
		const bs = toBuildings(js, 0, 0)
		expect(bs).toHaveLength(3)
		const t = pickTarget(bs)!; expect(t.id).toBe('way/1')
		expect(t.outer).toHaveLength(4); expect(inRing([0, 0], t.outer)).toBe(true)
		expect(Math.abs(t.outer[1][0] - t.outer[0][0])).toBeCloseTo(111.32, 1)   // 0.001° of longitude at the equator
		expect(pickTarget(bs, { osmType: 'way', osmId: 3 })!.id).toBe('way/3')
		const ps = partsOf(bs, t); expect(ps.map((p) => p.id)).toEqual(['way/2'])
		const f = Object.fromEntries(factsOf(t, ps)); expect(f.Name).toBe('Tower'); expect(f.Levels).toBe('30'); expect(f.Height).toBe('100 m')
	})
	it('the Overpass query asks for buildings + parts around the point with geometry', () => {
		const q = overpassQuery(35.6, 139.7, 200)
		expect(q).toContain('way["building"](35.598191,139.697790,35.601809,139.702210)'); expect(q).toContain('building:part'); expect(q).toContain('out geom tags')
		expect(overpassQuery(35.6, 139.7, 200, { osmType: 'relation', osmId: 3816171 })).toContain('relation(3816171);')   // THE building, whatever the area
	})
	it('never picks a canopy / roof / sliver as the building (the Shin-Marunouchi entrance roof)', () => {
		const js: OverpassJson = { elements: [
			{ type: 'way', id: 9, tags: { building: 'roof' }, geometry: sq(-0.00001, -0.00001, 0.00002) },
			{ type: 'way', id: 10, tags: { building: 'commercial', height: '198' }, geometry: sq(-0.0006, -0.0003, 0.0009) },
		] }
		expect(pickTarget(toBuildings(js, 0, 0))!.id).toBe('way/10')
	})
})
