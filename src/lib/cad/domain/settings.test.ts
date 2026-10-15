import { describe, it, expect } from 'vitest'
import { defaultSettings } from './settings'

describe('defaultSettings (a new project)', () => {
	it('has the usages and cable types Dave chose, and the outlet default is one of them', () => {
		const s = defaultSettings()
		expect(s.usages.map((u) => u.label)).toEqual(['AP', 'AV', 'CCTV'])
		expect(s.cableTypes.map((t) => t.label)).toEqual(['CAT6A', 'CAT6', 'OS2', 'OM4'])
		expect(s.cableTypes.find((t) => t.id === s.defaults.outletCableType)?.label).toBe('CAT6A')
		expect(s.cableTypes.find((t) => t.id === s.defaults.cordCableType)).toBeTruthy()
		expect(new Set(s.cableTypes.map((t) => t.id)).size).toBe(4)
	})
	it('its title block is the default one without the "J" placeholder logo text (W10)', () => {
		const s = defaultSettings()
		expect(s.titleBlock?.logo).toBeUndefined()
		expect(s.titleBlock?.fields.length).toBeGreaterThan(0)
	})
	it('is a fresh copy each time (an edit to one never leaks into the next project)', () => {
		const a = defaultSettings()
		a.usages.push({ id: 'X', label: 'X', color: '#000' })
		expect(defaultSettings().usages).toHaveLength(3)
	})
})
