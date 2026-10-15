// Project groups: the pure parts (the Firestore ones are checked live).
import { describe, it, expect, vi } from 'vitest'
vi.mock('./db.svelte', () => ({ firestore: {} }))
import { fullName, groupOf, sortGrouped } from './projectGroups'

describe('project groups', () => {
	it('a grouped project is "Group – Building"; no building, just the group', () => {
		expect(fullName('Project Tourney', 'building1')).toBe('Project Tourney – building1')
		expect(fullName('Project Tourney', ' ')).toBe('Project Tourney')
		expect(groupOf({ name: 'Project Tourney – building1', groupName: 'Project Tourney' })).toBe('Project Tourney')
		expect(groupOf({ name: 'Solo' })).toBe('Solo')
	})
	it('lists each group together, its buildings in order, among the other projects by name', () => {
		const ps = [
			{ id: 'z', name: 'Zeta' },
			{ id: 'b2', name: 'Project Tourney – building2', masterId: 'g', groupName: 'Project Tourney', buildingName: 'building2' },
			{ id: 'a', name: 'Alpha' },
			{ id: 'b1', name: 'Project Tourney – building1', masterId: 'g', groupName: 'Project Tourney', buildingName: 'building1' },
		]
		expect(sortGrouped(ps).map((p) => p.id)).toEqual(['a', 'b1', 'b2', 'z'])
	})
})
