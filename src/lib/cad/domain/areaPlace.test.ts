// The whole-floor plan (backlog 6): area plans placed on their floor's main plan by two point pairs; routing reads
// them in the main plan's coordinates, so a run drawn on the whole floor joins an area's run to another area's.
import { describe, it, expect } from 'vitest'
import { ProjectIndex } from './project'
import { mainLevelOf, placeOf, toMain, fromMain, placedAreas, solvePlace, makeAreaOf } from './areaPlace'
import { routeLinks, panelZ } from './routing'
import type { Entity } from './drawing'
import type { Level } from './types'
import type { Shape } from './shapes'
import { planDisplayList, AREA_GHOST } from '../views/plan'
import { snapAt } from '../editor/snap'
import { applyLayers } from '../views/layers'

const H = { slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2600, plenumMm: 700 }
const lv = (id: string, o: Partial<Level> = {}): Level => ({ type: 'level', id, buildingId: 'B', number: 33, name: id, order: 33, elevationMm: 0, heights: H, ...o })
function run(id: string, levelId: string, pts: [number, number][]): Shape {
	const nodes = pts.map(([x, y], i) => ({ id: `${id}n${i}`, x, y, z: 0 }))
	return { type: 'shape', id, levelId, geom: { kind: 'path', nodes, segs: nodes.slice(1).map((n, i) => ({ id: `${id}s${i}`, a: nodes[i].id, b: n.id })) }, section: { w: 100, h: 50 }, role: { kind: 'containment', form: 'trunk', tier: 'low' } } as Shape
}
const DEV = { type: 'device', rackId: 'R1', kind: 'panel', u: 40, heightU: 1, face: 'front', portCount: 24 }
const DROP = 500 + panelZ(DEV as never)
const rack = (id: string, levelId: string, spaceId: string) => ({ type: 'rack', id, levelId, spaceId, order: 1, name: id, kind: '4-post', heightU: 42, widthMm: 600, depthMm: 1000, at: { x: 0, y: 0 } })

/** 33F: the whole floor M; areas 3303 (A, not moved) and 3307 (C, 50 m along and turned 90°). A rack in each area
 *  beside its own trunk; the link run on the whole floor from T1's end to T2's end (where C's placement puts it). */
function floor(placeC = true, link = true) {
	const C = toMain({ x: 50000, y: 0, rot: 90 }, { x: 10000, y: 500 })   // (49500, 10000)
	return new ProjectIndex([
		lv('M', { name: '33F' }), lv('A', { name: '33F 3303', area: '3303', place: { x: 0, y: 0, rot: 0 } }),
		lv('C', { name: '33F 3307', area: '3307', ...(placeC ? { place: { x: 50000, y: 0, rot: 90 } } : {}) }),
		{ type: 'space', id: 'S1', levelId: 'A', name: '33IDF1', kind: 'server room' }, { type: 'space', id: 'S2', levelId: 'C', name: 'IDF3307', kind: 'server room' },
		rack('R1', 'A', 'S1'), rack('R2', 'C', 'S2'), { ...DEV, id: 'P1', rackId: 'R1', name: 'P1' }, { ...DEV, id: 'P2', rackId: 'R2', name: 'P2' },
		run('T1', 'A', [[0, 500], [10000, 500]]), run('T2', 'C', [[0, 500], [10000, 500]]),
		...(link ? [run('X', 'M', [[10000, 500], [10000, 20000], [C.x, 20000], [C.x, C.y]])] : []),
		{ type: 'link', id: 'K', kind: 'backbone', a: { on: 'P1', port: 1 }, b: { on: 'P2', port: 1 }, cableType: 'cat6a', status: 'design' },
	] as Entity[])
}

describe('area placement', () => {
	it('two point pairs give the turn and shift; points go there and back; the scale is checked', () => {
		const pl = { x: 1234, y: -567, rot: 30 }
		const a1 = { x: 100, y: 200 }, a2 = { x: 5100, y: 3200 }
		const s = solvePlace(a1, a2, toMain(pl, a1), toMain(pl, a2))!
		expect(s.place.rot).toBeCloseTo(30)
		expect(s.place.x).toBeCloseTo(1234, 0)
		expect(s.place.y).toBeCloseTo(-567, 0)
		expect(s.scale).toBeCloseTo(1)
		const p = { x: 777, y: -88 }
		const back = fromMain(pl, toMain(pl, p))
		expect(back.x).toBeCloseTo(p.x)
		expect(back.y).toBeCloseTo(p.y)
		expect(solvePlace(a1, a1, a1, a2)).toBeNull()
		expect(solvePlace(a1, a2, { x: 0, y: 0 }, { x: 2 * 5000, y: 2 * 3000 })!.scale).toBeCloseTo(2)   // drawn at another scale
	})
	it('the main plan of an area; only placed areas; a main plan made into an area keeps its id and name', () => {
		const ix = floor(false)
		expect(mainLevelOf(ix, ix.getOf('level', 'C'))?.id).toBe('M')
		expect(placeOf(ix, 'C')).toBeNull()
		expect(placeOf(ix, 'M')).toBeNull()
		expect(placedAreas(ix, 'M').map((l) => l.id)).toEqual(['A'])
		const made = makeAreaOf(lv('L', { name: '33F 3303' }), '3303', '33F', 'NEW')!
		expect(made.area).toMatchObject({ id: 'L', name: '33F 3303', area: '3303' })
		expect(made.main).toMatchObject({ id: 'NEW', name: '33F', number: 33, buildingId: 'B' })
		expect(made.main.area).toBeUndefined()
		expect(makeAreaOf(made.area, 'x', '33F', 'N2')).toBeNull()
	})
	it('a backbone routes from one area through the whole floor\'s run into the other area — not until it is placed', () => {
		const r = routeLinks(floor(), { slackM: 0, wastePct: 0 }).get('K')!
		expect(r.problem).toBeUndefined()
		expect(r.routeMm).toBeCloseTo(DROP + 10000 + 19500 + 39500 + 10000 + 10000 + DROP)
		expect(r.segs.map((s) => s.shape)).toEqual(['T2', 'X', 'X', 'X', 'T1'])   // listed from the b end
		expect(routeLinks(floor(false), { slackM: 0, wastePct: 0 }).get('K')!.routeMm).toBeUndefined()
	})
	it('the whole floor shows its placed areas greyed and not pickable, and snaps to their run ends', () => {
		const ix = floor(true, false)
		const ghosts = planDisplayList(ix, 'M', { scale: 100 }).filter((p) => p.color === AREA_GHOST)
		expect(ghosts.length).toBeGreaterThan(0)
		expect(ghosts.every((p) => !p.src)).toBe(true)
		expect(snapAt(ix, 'M', { x: 49480, y: 10030 }, 100)).toMatchObject({ kind: 'node', p: { x: 49500, y: 10000 } })
		expect(planDisplayList(ix, 'A', { scale: 100 }).some((p) => p.color === AREA_GHOST)).toBe(false)
// on its own layer: hiding that layer hides it on the whole floor too (User: 3303's desks with Furniture hidden)		const rs = ghosts.filter((p) => p.layer === 'sys:racks' || p.layer === 'sys:trunks')		expect(rs.length).toBeGreaterThan(0)		const hid = new Set(rs.map((p) => p.layer!))		expect(applyLayers(planDisplayList(ix, 'M', { scale: 100 }), ix, { hidden: hid }).draw.some((p) => p.layer && hid.has(p.layer))).toBe(false)
	})
})
