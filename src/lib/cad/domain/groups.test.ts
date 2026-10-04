// Group / ungroup (Dave, 2026-10-05): shapes that select and move as one.
import { describe, it, expect } from 'vitest'
import { withGroups, groupShapes, ungroupShapes } from './groups'
import { EntityStore } from '../store/store'
import { groupSelection, ungroupSelection, deleteEntities } from '../editor/commands'
import { makeClip, pasteClip } from './clipboard'
import { ProjectIndex } from './project'
import type { Shape } from './shapes'
import type { Entity } from './drawing'

const box = (id: string, x: number, groupId?: string) => ({ type: 'shape', id, levelId: 'L', geom: { kind: 'rect', centre: { x, y: 0 }, size: { x: 100, y: 100 } }, ...(groupId ? { groupId } : {}) }) as Shape
const level = { type: 'level', id: 'L', buildingId: 'B', number: 1, name: '1F', order: 1, elevationMm: 0, heights: { slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2600, plenumMm: 700 } } as Entity

describe('groups', () => {
	it('a member picks its whole group; others stay as they are', () => {
		const shapes = [box('A', 0, 'G'), box('B', 200, 'G'), box('C', 400)]
		expect(withGroups(shapes, ['A']).sort()).toEqual(['A', 'B'])
		expect(withGroups(shapes, ['C'])).toEqual(['C'])
	})
	it('grouping takes shapes out of their old groups (an emptied one goes); ungrouping too', () => {
		const all: Entity[] = [{ type: 'group', id: 'G' }, box('A', 0, 'G'), box('B', 200, 'G'), box('C', 400)]
		const g = groupShapes(all, ['A', 'B', 'C'])
		expect(g.put.filter((e) => e.type === 'shape').map((s) => (s as Shape).groupId)).toEqual([g.group, g.group, g.group])
		expect(g.del).toEqual(['G'])
		expect(groupShapes(all, ['C']).group).toBeUndefined()   // one shape isn't a group
		const u = ungroupShapes(all, ['A'])
		expect(u.put.map((s) => (s as Shape).groupId)).toEqual([undefined])
		expect(u.del).toEqual([])   // B is still in G
	})
	it('as commands: one undo step each; deleting all a group\'s shapes deletes the group', () => {
		const store = new EntityStore()
		store.load([level, box('A', 0), box('B', 200)])
		const r = groupSelection(store, ['A', 'B'])
		expect(r).toEqual({ n: 2 })
		const gid = (store.get('A') as Shape).groupId!
		expect(store.get(gid)?.type).toBe('group')
		expect(ungroupSelection(store, ['A', 'B'])).toBe(2)
		expect(store.get(gid)).toBeUndefined()
		store.undo()   // grouped again
		deleteEntities(store, ['A', 'B'])
		expect(store.get(gid)).toBeUndefined()
	})
	it('a copy of a group is a new group of its own', () => {
		const ents: Entity[] = [level, { type: 'group', id: 'G' }, box('A', 0, 'G'), box('B', 200, 'G')]
		const ix = new ProjectIndex(ents), clip = makeClip(ix, ['A', 'B'], 'P')!
		const r = pasteClip(clip, { pid: 'P', ix, to: { kind: 'level', id: 'L' }, d: { x: 1000, y: 0 } })
		const copies = r.put.filter((e): e is Shape => e.type === 'shape'), newGroup = r.put.find((e) => e.type === 'group')!
		expect(copies.map((s) => s.groupId)).toEqual([newGroup.id, newGroup.id])
		expect(newGroup.id).not.toBe('G')
	})
})
