// hacky-code review #3: a typed lookup that checks the type, not one that labels whatever has the id.
import { describe, it, expect } from 'vitest'
import { ProjectIndex } from './project'
import { demoProject } from './fixtures'
import { settingsOf } from './settings'

describe('getOf / settingsOf', () => {
	it('returns the entity only when it is of that type', () => {
		const ix = new ProjectIndex(demoProject())
		expect(ix.getOf('rack', 'R1')?.name).toBeDefined()
		expect(ix.getOf('device', 'R1')).toBeUndefined()   // R1 is a rack, not a device
		expect(ix.getOf('rack', undefined)).toBeUndefined()
		expect(settingsOf((id) => ix.get(id))).toBe(ix.getOf('settings', 'settings'))
		expect(settingsOf(() => ix.get('R1'))).toBeUndefined()   // something else under the id: not settings
	})
})
