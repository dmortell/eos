// Run edits shared by one run's and several runs' Properties (Dave, 2026-10-05).
import { describe, it, expect } from 'vitest'
import { makePath, toContainment } from './make'
import { convertRun, kindOf, placeNow, setRunPlace, mainZ, servableRooms, toggleServes } from './runEdit'
import { ProjectIndex } from './project'
import type { Entity } from './drawing'
import type { Shape } from './shapes'

const heights = { raisedFloorMm: 300, clearHeightMm: 2700, plenumMm: 600 }
const trunk = (z: number) => toContainment(makePath({ levelId: 'L' }, [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 0, z: 300 }], { z }), { w: 100, h: 50 }, { tier: 'low', form: 'trunk' })

describe('which server rooms a run serves (Dave: Journey TV07 / TV08 — the high conduits served 33IDF1 only)', () => {
	const room = (id: string, levelId: string, kind = 'server room') => ({ type: 'space', id, levelId, kind, name: id })
	const conduit = (serves?: string[]) => ({ ...trunk(3000), id: 'C', role: { kind: 'containment', form: 'conduit', tier: 'high', ...(serves ? { serves } : {}) } }) as Shape
	const ix = (s: Shape) => new ProjectIndex([room('IDF2', 'L'), room('IDF1', 'L'), room('OFFICE', 'L', 'office'), room('IDF9', 'L9'), s] as Entity[])
	it('offers the server rooms on its level, by name, and any it serves already from elsewhere', () => {
		expect(servableRooms(ix(conduit()), conduit()).map((r) => r.id)).toEqual(['IDF1', 'IDF2'])
		expect(servableRooms(ix(conduit(['IDF9'])), conduit(['IDF9'])).map((r) => r.id)).toEqual(['IDF1', 'IDF2', 'IDF9'])
	})
	it('ticking adds a room; unticking the last one drops `serves` (every room)', () => {
		const one = toggleServes(conduit(['IDF1']), 'IDF2', true)
		expect(one.role).toMatchObject({ serves: ['IDF1', 'IDF2'] })
		const none = toggleServes(toggleServes(one, 'IDF1', false), 'IDF2', false)
		expect(none.role && 'serves' in none.role).toBe(false)
	})
})

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
		// W31: a ladder is its own kind (it showed as Tray)
		const l = convertRun(s, 'ladder')
		expect(kindOf(l)).toBe('ladder')
		expect(l.role).toMatchObject({ kind: 'containment', form: 'ladder' })
	})
})
