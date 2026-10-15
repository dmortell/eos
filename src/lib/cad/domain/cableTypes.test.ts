// Cable types editor rules (User, 2026-10-05).
import { describe, it, expect } from 'vitest'
import { ProjectIndex } from './project'
import { demoProject } from './fixtures'
import { cableTypeUses, cantDelete, newCableTypeId, cableTypeOf, cableTypeLabel, cableMedia } from './cableTypes'
import { cableOd } from './fill'
import type { ProjectSettings, Link } from './types'

const settings = { type: 'settings', id: 'settings', portSuffix: 'alpha', usages: [],
	cableTypes: [{ id: 'cat6a', label: 'Cat6A', media: 'copper', color: '#3b82f6' }, { id: 'om4', label: 'OM4', media: 'fibre', color: '#22d3ee' }, { id: 'cat5e', label: 'Cat5e', media: 'copper', color: '#999999' }],
	defaults: { outletCableType: 'cat6a', cordCableType: 'om4', cordColour: '#3b82f6', panelPorts: 24 } } as ProjectSettings

describe('cable types', () => {
	const ix = new ProjectIndex(demoProject())
	it('a type in use (ports, cords) or set as a default can\'t be deleted; an unused one can', () => {
		const u = cableTypeUses(ix, settings, 'cat6a')
		expect(u.ports).toBeGreaterThan(0)
		expect(cantDelete(u)).toMatch(/^used by \d+ outlet ports/)
		expect(cantDelete(cableTypeUses(ix, settings, 'om4'))).toBe('the default for new outlets or cords')
		expect(cantDelete(cableTypeUses(ix, settings, 'cat5e'))).toBeNull()
	})
	it('a type only links use can\'t be deleted either (Review 2 Q11)', () => {
		const tie: Link = { type: 'link', id: 'T1', kind: 'tie', a: { on: 'X', port: 1 }, b: { on: 'Y', port: 1 }, cableType: 'cat5e', status: 'design' }
		const u = cableTypeUses(new ProjectIndex([...demoProject(), tie]), settings, 'cat5e')
		expect(u).toMatchObject({ ports: 0, links: 1, cords: 0 })
		expect(cantDelete(u)).toBe('used by 1 link')
		expect(cantDelete({ ports: 2, links: 3, cords: 1, isDefault: false })).toBe('used by 2 outlet ports, 3 links and 1 cord')
	})
	it('a new type\'s id comes from its label, made unique', () => {
		expect(newCableTypeId('Cat6A STP', [])).toBe('cat6a-stp')
		expect(newCableTypeId('OM4', ['om4', 'om4-2'])).toBe('om4-3')
	})
})

describe('the one cable type lookup', () => {
	it('finds by id, then by label; the label falls back to the id', () => {
		expect(cableTypeOf(settings, 'om4')?.label).toBe('OM4')
		expect(cableTypeOf(settings, 'OM4')?.id).toBe('om4')
		expect(cableTypeOf(settings, 'nope')).toBeUndefined()
		expect(cableTypeOf(undefined, 'om4')).toBeUndefined()
		expect(cableTypeLabel(settings, 'cat6a')).toBe('Cat6A')
		expect(cableTypeLabel(settings, 'nope')).toBe('nope')
	})
	it('media: the type\'s own, else guessed from the name', () => {
		expect(cableMedia(settings, 'om4')).toBe('fibre')
		expect(cableMedia(undefined, 'OS2 24c')).toBe('fibre')
		expect(cableMedia(undefined, 'SM 12')).toBe('fibre')
		expect(cableMedia(undefined, 'Cat6 STP')).toBe('copper')
		expect(cableMedia(undefined, 'smart thing')).toBeUndefined()
		expect(cableMedia(settings, undefined)).toBeUndefined()
	})
	it('the outer diameter of an unlisted fibre-ish name is the fibre default, not the copper one', () => {
		expect(cableOd(undefined, 'smf-24')).toBe(3)
		expect(cableOd(undefined, 'mystery')).toBe(7)
		expect(cableOd(settings, 'cat6a')).toBe(9)
	})
})
