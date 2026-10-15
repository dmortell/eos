import { describe, it, expect } from 'vitest'
import { parseTyped } from './input'
import { insertNode, branchFrom, removeNode, degree } from '../domain/pathEdit'
import { makePath, makeWall } from '../domain/make'
import type { Shape } from '../domain/shapes'

const pt = (r: ReturnType<typeof parseTyped>) => (r.kind === 'point' ? { x: Math.round(r.p.x * 1000) / 1000, y: Math.round(r.p.y * 1000) / 1000 } : r.message)

describe('typed points (the model\'s coordinates, as Properties show them)', () => {
	it('x,y is absolute: in a plan the stored y (down the sheet); in an elevation y is height', () => {
		expect(pt(parseTyped('1000,500', null, null))).toEqual({ x: 1000, y: 500 })
		expect(pt(parseTyped('1000,-2600', null, null))).toEqual({ x: 1000, y: -2600 })
		expect(pt(parseTyped('1000,2600', null, null, true))).toEqual({ x: 1000, y: -2600 })   // 2.6 m up = view y −2600
	})
	it('numpads (User 2026-10-14): `..` works as well as a comma; one `.` is still a decimal point', () => {
		expect(pt(parseTyped('1000..500', null, null))).toEqual({ x: 1000, y: 500 })
		expect(pt(parseTyped('@12.5..-3', { x: 0, y: 0 }, null))).toEqual({ x: 12.5, y: -3 })
		expect(pt(parseTyped('1000,500', null, null))).toEqual({ x: 1000, y: 500 })
	})
	it('@dx,dy is relative to the last point', () => {
		expect(pt(parseTyped('@600,0', { x: 100, y: 200 }, null))).toEqual({ x: 700, y: 200 })
		expect(pt(parseTyped('@0,300', { x: 100, y: 200 }, null))).toEqual({ x: 100, y: 500 })
		expect(pt(parseTyped('@0,300', { x: 100, y: 200 }, null, true))).toEqual({ x: 100, y: -100 })
	})
	it('@d<a is polar, anticlockwise from +x', () => {
		expect(pt(parseTyped('@1000<90', { x: 0, y: 0 }, null))).toEqual({ x: 0, y: -1000 })
		expect(pt(parseTyped('@1000<180', { x: 0, y: 0 }, null))).toEqual({ x: -1000, y: 0 })
	})
	it('a bare number goes that far towards the cursor (direct distance)', () => {
		expect(pt(parseTyped('500', { x: 0, y: 0 }, { x: 0, y: 3000 }))).toEqual({ x: 0, y: 500 })
	})
	it('says what is wrong', () => {
		expect(pt(parseTyped('@100,0', null, null))).toMatch(/no(ne| last)/i)
		expect(pt(parseTyped('500', null, null))).toMatch(/first point/)
		expect(pt(parseTyped('abc', null, null))).toMatch(/Can't read/)
	})
})

const line = (): Shape => makePath({ levelId: 'L' }, [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }])
const g = (s: Shape | null) => (s && s.geom.kind === 'path' ? s.geom : null)!

describe('editing a path graph', () => {
	it('insert splits a segment at the point, keeping z interpolated', () => {
		const s = makePath({ levelId: 'L' }, [{ x: 0, y: 0, z: 0 }, { x: 1000, y: 0, z: 1000 }])
		const r = insertNode(s, g(s).segs[0].id, 0.25, 'n')
		expect(g(r).nodes.find((n) => n.id === 'n')).toMatchObject({ x: 250, y: 0, z: 250 })
		expect(g(r).segs).toHaveLength(2)
	})
	it('branch adds a segment from an existing node; the node becomes a junction', () => {
		const s = line(), mid = g(s).nodes[1].id
		const r = branchFrom(s, mid, { x: 2000, y: 0, z: 0 }, 'b')
		expect(degree(r).get(mid)).toBe(3)
	})
	it('removing a middle node heals the run; removing an end shortens it', () => {
		const s = line(), [a, mid, c] = g(s).nodes.map((n) => n.id)
		const healed = removeNode(s, mid)!
		expect(g(healed).segs.map((x) => [x.a, x.b])).toEqual([[a, c]])
		expect(g(removeNode(s, c)).nodes.map((n) => n.id)).toEqual([a, mid])
	})
	it('a path left with fewer than two nodes is gone (null)', () => {
		const two = makePath({ levelId: 'L' }, [{ x: 0, y: 0 }, { x: 1, y: 0 }])
		expect(removeNode(two, g(two).nodes[0].id)).toBeNull()
	})
	it("removing a wall node drops openings on segments that no longer exist", () => {
		const w = makeWall('L', [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 2000, y: 0 }])
		const seg2 = g(w).segs[1].id
		const withDoor: Shape = { ...w, role: { kind: 'wall', openings: [{ id: 'd', segId: seg2, at: 500, width: 900, z: 0, h: 2100 }] } }
		const r = removeNode(withDoor, g(w).nodes[2].id)!
		expect(r.role?.kind === 'wall' && r.role.openings).toEqual([])
	})
})
