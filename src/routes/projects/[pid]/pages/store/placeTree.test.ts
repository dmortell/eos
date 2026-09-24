import { describe, it, expect } from 'vitest'
import { seedPlaces, childrenOf, addPlace, updatePlace, movePlace, removePlace, descendantIds } from './places'
import { buildPlaceTree } from './placeTree'
import type { TreeInput, DrawingDoc } from '../projectTree'
import type { NavNode } from '../mock/data'
import type { Place } from './schema'

const P = 'pid'
const input: TreeInput = {
	project: { id: P, name: 'Hibiya', address: 'Hibiya', floors: [
		{ number: 10, serverRoomCount: 1 },
		{ number: 30, serverRoomCount: 2, roomNames: { A: 'IDF1', B: 'IDF2' } },
		{ number: 33, serverRoomCount: 1, areas: [{ id: '3303', label: '3303', legacy: true }, { id: '3307', label: '3307' }] },
	] },
	racks: {}, risers: [{ id: 'ris', name: 'Risers', fromFloor: 30, toFloor: 33 }], drawings: [],
}
const counter = () => { let n = 0; return () => `p${++n}` }
const places = seedPlaces(input, counter())
const id = (name: string) => places.find((p) => p.name === name)!.id
const names = (ps: Place[]) => ps.map((p) => p.name)
const find = (ns: NavNode[], nid: string): NavNode | undefined => { for (const n of ns) { if (n.id === nid) return n; const c = n.children && find(n.children, nid); if (c) return c } }
const labels = (n?: NavNode) => (n?.children ?? []).map((c) => c.label)

describe('place editing (drawings-plan §4)', () => {
	it('addPlace appends a last child; updatePlace renames and sets / clears the icon kind', () => {
		let ps = addPlace(places, { name: 'Lobby', parentId: id('30F'), id: 'x1', kind: 'room' })
		expect(names(childrenOf(ps, id('30F')))).toEqual(['IDF1', 'IDF2', 'Lobby'])
		ps = updatePlace(ps, 'x1', { name: '  Lobby B ', kind: '' })
		expect(ps.find((p) => p.id === 'x1')).toEqual({ id: 'x1', name: 'Lobby B', parentId: id('30F'), order: 2 })
		expect(updatePlace(ps, 'x1', { name: '   ' }).find((p) => p.id === 'x1')!.name).toBe('Lobby B')   // empty name ignored
	})
	it('movePlace: into = last child, before / after = sibling; orders stay 0..n in both parents', () => {
		const into = movePlace(places, id('IDF2'), id('33F'), 'into')!
		expect(names(childrenOf(into, id('33F')))).toEqual(['Zone 3303', 'Zone 3307', 'Room A', 'IDF2'])
		expect(childrenOf(into, id('30F')).map((p) => [p.name, p.order])).toEqual([['IDF1', 0]])
		const before = movePlace(places, id('IDF2'), id('IDF1'), 'before')!
		expect(childrenOf(before, id('30F')).map((p) => [p.name, p.order])).toEqual([['IDF2', 0], ['IDF1', 1]])
		const top = movePlace(places, id('33F'), id('Hibiya'), 'after')!
		expect(names(childrenOf(top, null))).toEqual(['Hibiya', '33F', 'Other building'])
	})
	it('any nesting is allowed, but never into itself or its own subtree', () => {
		expect(movePlace(places, id('Hibiya'), id('IDF1'), 'into')).toBeNull()
		expect(movePlace(places, id('30F'), id('30F'), 'into')).toBeNull()
		const odd = movePlace(places, id('Other building'), id('IDF1'), 'into')!   // a building in a room: fine
		expect(childrenOf(odd, id('IDF1')).map((p) => p.name)).toEqual(['Other building'])
		expect(descendantIds(odd, id('30F')).has(id('10F'))).toBe(true)
	})
	it('removePlace only removes a place with no children, closing the order gap', () => {
		expect(removePlace(places, id('30F'))).toBeNull()
		const r = removePlace(places, id('IDF1'))!
		expect(childrenOf(r, id('30F')).map((p) => [p.name, p.order])).toEqual([['IDF2', 0]])
	})
})

describe('buildPlaceTree', () => {
	const d = (x: Partial<DrawingDoc> & { id: string }): DrawingDoc => ({ toolType: 'outlets', title: x.id, ...x })
	const drawings: DrawingDoc[] = [
		d({ id: 'f33', sourceDocId: `${P}_F33` }),                           // unsuffixed outlets → the legacy area (3303)
		d({ id: 'z3307', sourceDocId: `${P}_F33__3307` }),                   // → Zone 3307
		d({ id: 'rk', toolType: 'racks', sourceDocId: `${P}_F30_RB` }),      // → IDF2
		d({ id: 'fr', toolType: 'frames', sourceDocId: `${P}_F30` }),        // → 30F itself
		d({ id: 'proj', toolType: 'page', sourceDocId: `${P}_abc` }),        // project level
		d({ id: 'far', sourceDocId: `${P}_F200` }),                          // a floor with no place
		d({ id: 'old', sourceDocId: `${P}_F30`, status: 'archived' }),       // hidden
		d({ id: 'sheet', toolType: 'pages', sourceDocId: `${P}_sheet` }),     // Pages sheets aren't hung by legacy
	]
	const tree = buildPlaceTree({ pid: P, places, drawings, risers: input.risers, floors: input.project.floors })
	it('hangs registry drawings on the places their sourceDocId points at', () => {
		expect(labels(find(tree, id('Zone 3303')))).toEqual(['f33'])
		expect(labels(find(tree, id('Zone 3307')))).toEqual(['z3307'])
		expect(labels(find(tree, id('IDF2')))).toEqual(['rk'])
		expect(labels(find(tree, id('30F')))).toEqual(['fr', 'IDF1', 'IDF2'])   // drawings first, then child places
		expect(labels(find(tree, 'g:project'))).toEqual(['proj'])
		expect(labels(find(tree, 'g:orphan'))).toEqual(['far'])
		expect(JSON.stringify(tree)).not.toMatch(/"d:old"|"d:sheet"/)
	})
	it('puts a riser diagram on the nearest place containing every floor in its range', () => {
		expect(labels(find(tree, id('Hibiya')))[0]).toBe('Risers')
	})
	it('floor places open their floor model; other places open none; every place row is marked a place', () => {
		const f = find(tree, id('33F'))!, z = find(tree, id('Zone 3303'))!, b = find(tree, id('Hibiya'))!
		expect([f.modelFloor, f.floorNumber, f.place]).toEqual(['33F', 33, true])
		expect([z.modelFloor, z.floor]).toEqual([null, '33F'])
		expect(b.modelFloor).toBeNull()
		expect(find(tree, 'g:project')!.place).toBeUndefined()
		expect(z.hasModel).toBeUndefined()
	})
	it('a place with a model is marked hasModel (a click opens it, e.g. a zone)', () => {
		const zid = id('Zone 3307')
		const t2 = buildPlaceTree({ pid: P, places, drawings, risers: input.risers, floors: input.project.floors, modelPlaces: new Set([zid]) })
		expect(find(t2, zid)!.hasModel).toBe(true)
	})
})
