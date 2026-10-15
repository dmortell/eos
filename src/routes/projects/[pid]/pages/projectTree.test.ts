import { describe, it, expect } from 'vitest'
import { buildProjectTree, drawingPlace, drawingKind, buildingOf, findNodePath, OTHER_BUILDING, type TreeInput } from './projectTree'
import type { NavNode } from './mock/data'

const P = 'pid'
// Shaped like the live building1 project (docs/firestore-structure.md): 10F outside the riser range, 33F with areas.
const input: TreeInput = {
	project: { id: P, name: 'building1', address: 'building1', floors: [
		{ number: 10, label: 'L10 building2', serverRoomCount: 1 },
		{ number: 12, serverRoomCount: 1 },
		{ number: 30, serverRoomCount: 2, roomNames: { A: 'IDF1', B: 'IDF2' } },
		{ number: 33, serverRoomCount: 3, roomNames: { A: 'IDF1', B: 'IDF2', C: 'IDF3307' }, areas: [{ id: '3303', label: '3303', legacy: true, primary: true }, { id: '3307', label: '3307' }] },
	] },
	racks: { [`${P}_F30_RB`]: { rows: [{ id: 'ra', label: 'Row A' }, { id: 'rb', label: 'Row B' }], racks: [{ rowId: 'ra' }, { rowId: 'ra' }, { rowId: 'rb' }] } },
	risers: [{ id: P, name: '12F-33F Risers', fromFloor: 12, toFloor: 33 }],
	drawings: [
		{ id: 'd1', toolType: 'racks', title: 'Front Elevation 30F Room B', sourceDocId: `${P}_F30_RB` },
		{ id: 'd2', toolType: 'outlets', title: 'Low Level 33F', sourceDocId: `${P}_F33` },
		{ id: 'd3', toolType: 'outlets', title: 'Low Level 3307', sourceDocId: `${P}_F33__3307` },
		{ id: 'd4', toolType: 'page', title: '3303 Plan', sourceDocId: `${P}_4e10cfee-281` },
		{ id: 'd5', toolType: 'racks', title: 'Front Elevation 200F', sourceDocId: `${P}_F200_RA` },
		{ id: 'd6', toolType: 'outlets', title: 'Old', sourceDocId: `${P}_F10`, status: 'archived' },
	],
}
const find = (ns: NavNode[], id: string): NavNode | undefined => { for (const n of ns) { if (n.id === id) return n; const c = n.children && find(n.children, id); if (c) return c } }
const labels = (ns?: NavNode[]) => (ns ?? []).map((n) => n.label)

describe('projectTree helpers', () => {
	it('drawingPlace parses floor / area / room from sourceDocId', () => {
		expect(drawingPlace(P, `${P}_F30_RB`)).toEqual({ floor: 30, area: undefined, room: 'B' })
		expect(drawingPlace(P, `${P}_F33__3307`)).toEqual({ floor: 33, area: '3307', room: undefined })
		expect(drawingPlace(P, `${P}_F-1`)).toEqual({ floor: -1, area: undefined, room: undefined })
		expect(drawingPlace(P, P).floor).toBeNull()
		expect(drawingPlace(P, `${P}_4e10cfee-281`).floor).toBeNull()
	})
	it('drawingKind maps tool types to navigator kinds', () => {
		expect(drawingKind('racks')).toBe('elevation'); expect(drawingKind('outlets')).toBe('plan'); expect(drawingKind('page')).toBe('sheet')
	})
	it('buildingOf: explicit building > inside a riser range > Other building', () => {
		const r = [{ id: 'r', fromFloor: 12, toFloor: 33 }]
		expect(buildingOf({ number: 30 }, r, 'building1')).toBe('building1')
		expect(buildingOf({ number: 10 }, r, 'building1')).toBe(OTHER_BUILDING)
		expect(buildingOf({ number: 10, building: 'building2' }, r, 'building1')).toBe('building2')
	})
})

describe('buildProjectTree (building1-shaped)', () => {
	const { project, tree } = buildProjectTree(input)
	it('project label + buildings: the riser building first, 10F apart', () => {
		expect(project.label).toBe('building1')
		expect(labels(tree).slice(0, 2)).toEqual(['building1', OTHER_BUILDING])
		expect(labels(find(tree, 'b:building1')!.children)).toEqual(['12F-33F Risers', '33F', '30F', '12F'])
		expect(labels(find(tree, `b:${OTHER_BUILDING}`)!.children)).toEqual(['10F — L10 building2'])
	})
	it('33F: areas as zones, the legacy area takes the unsuffixed outlets drawing; server rooms by name', () => {
		const f33 = find(tree, 'f:33')!
		expect(labels(f33.children)).toEqual(['Zone 3303', 'Zone 3307', 'IDF1', 'IDF2', 'IDF3307'])
		expect(labels(find(tree, 'a:33:3303')!.children)).toEqual(['Low Level 33F'])
		expect(labels(find(tree, 'a:33:3307')!.children)).toEqual(['Low Level 3307'])
		expect(f33.floor).toBe('33F'); expect(f33.floorNumber).toBe(33)
	})
	it('30F Room B: its drawing, then its rows with rack counts', () => {
		const rb = find(tree, 'r:30:B')!
		expect(labels(rb.children)).toEqual(['Front Elevation 30F Room B', 'Row A', 'Row B'])
		expect(rb.children!.map((n) => n.meta)).toEqual([undefined, '2 racks', '1 rack'])
		expect(rb.children![0]).toMatchObject({ drawing: 'elevation', docId: 'drawing:d1' })
	})
	it('saved buildings come first in their order, empty ones included; an explicit floor building wins', () => {
		const { tree: t } = buildProjectTree({ ...input, project: { ...input.project, buildings: ['building2', 'building1', 'Annex'],
			floors: [...(input.project.floors as object[]).filter((f) => (f as { number: number }).number !== 10), { number: 10, label: 'L10 building2', serverRoomCount: 1, building: 'building2' }] as never } })
		expect(labels(t).slice(0, 3)).toEqual(['building2', 'building1', 'Annex'])
		expect(labels(find(t, 'b:building2')!.children)).toEqual(['10F — L10 building2'])
		expect(find(t, 'b:Annex')).toMatchObject({ children: [], meta: 'drag floors here' })
		expect(find(t, `b:${OTHER_BUILDING}`)).toBeUndefined()
	})
	it('findNodePath finds a node by id, or a drawing by docId, with its ancestors', () => {
		const r = findNodePath(tree, { id: 'row:30:B:rb' })!
		expect(r.node.label).toBe('Row B'); expect(r.ancestors.map((n) => n.id)).toEqual(['b:building1', 'f:30', 'r:30:B'])
		const d = findNodePath(tree, { docId: 'drawing:d1' })!
		expect(d.node.label).toBe('Front Elevation 30F Room B'); expect(d.ancestors.at(-2)!.floor).toBe('30F')
		expect(findNodePath(tree, { id: 'nope' })).toBeNull()
	})
	it('project-level and orphan drawings get their own groups; archived ones are dropped', () => {
		expect(labels(find(tree, 'g:project')!.children)).toEqual(['3303 Plan'])
		expect(labels(find(tree, 'g:orphan')!.children)).toEqual(['Front Elevation 200F'])
		expect(find(tree, 'd:d6')).toBeUndefined()
	})
})
