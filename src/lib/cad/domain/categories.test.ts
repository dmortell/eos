import { describe, it, expect } from 'vitest'
import { ProjectIndex } from './project'
import { bom } from './reports'
import { demoProject } from './fixtures'
import { defaultSettings } from './settings'
import { categoryResolver, categoryHeading, headingRank } from './categories'
import { layersOf, layerOf, categoryLayerRecords, CATEGORY_LAYERS } from './layers'
import type { ProjectSettings, Outlet } from './types'
import type { Entity } from './drawing'

/** The demo project with its settings: outlets of usage `desk`, cat6a cable. */
const withSettings = (f: (s: ProjectSettings) => ProjectSettings, extra: Entity[] = []) => {
	const s = defaultSettings()
	const st = f({ ...s, usages: [...s.usages, { id: 'desk', label: 'Desk', color: '#000' }] })
	return new ProjectIndex([...demoProject().filter((e) => e.type !== 'settings'), st, ...extra])
}
const power = (s: ProjectSettings): ProjectSettings => ({ ...s, cableTypes: s.cableTypes.map((t) => (t.id === 'cat6a' ? { ...t, category: 'power' as const } : t)) })

describe('cabling categories (backlog 57)', () => {
	it('an outlet takes its usage’s category, else its cable type’s; a link its cable type’s; none = Data', () => {
		const st = power(defaultSettings())
		const cat = categoryResolver({ ...st, usages: [...st.usages, { id: 'cam', label: 'Camera', color: '#000', category: 'security' }] })
		const o = (usage: string, cableType: string) => ({ type: 'outlet', id: 'o', levelId: 'L', label: 'x', tier: 'low', usage, mount: 'wall', ports: [{ port: 1, label: 'x.A', cableType }] }) as Outlet
		expect(cat(o('cam', 'cat6a'))).toBe('security')
		expect(cat(o('AP', 'cat6a'))).toBe('power')
		expect(cat(o('AP', 'om4'))).toBeUndefined()
		expect(categoryResolver(defaultSettings())(o('AP', 'cat6a'))).toBeUndefined()
	})
	it('a category’s outlets layer is listed once the project has its record, and its outlets go on it', () => {
		const ix0 = withSettings(power)
		expect(layersOf(ix0.layers).some((l) => l.id === 'sys:cat-power')).toBe(false)
		const known0 = new Set(layersOf(ix0.layers).map((l) => l.id))
		expect(layerOf(ix0.get('O1')!, known0, ix0.categoryOf)).toBe('sys:outlets-low')   // no layer yet: as before
		const recs = categoryLayerRecords(ix0.layers, ['power', 'power', 'data', undefined])
		expect(recs.map((r) => r.id)).toEqual(['sys:cat-power'])
		const ix = withSettings(power, recs)
		expect(categoryLayerRecords(ix.layers, ['power'])).toEqual([])
		const known = new Set(layersOf(ix.layers).map((l) => l.id))
		expect(known.has('sys:cat-power')).toBe(true)
		expect(layerOf(ix.get('O1')!, known, ix.categoryOf)).toBe('sys:cat-power')
		expect(CATEGORY_LAYERS.find((l) => l.id === 'sys:cat-power')?.name).toBe('Power outlets')
	})
	it('the BOM files a category’s outlets, jacks and cable under it, after Data’s lines', () => {
		const lines = bom(withSettings(power))
		const head = (item: string) => lines.find((l) => l.item === item)?.category
		expect(head('2-port outlet (floor)')).toBe('Power · Outlets')
		expect(head('Jack / module CAT6A')).toBe('Power · Outlets')
		expect(head('CAT6A (incl. 10% waste)')).toBe('Power · Cable')
		expect(head('Patch panel 24-port RJ45 1U')).toBe('Panels')
		const firstPower = lines.findIndex((l) => l.category.startsWith('Power · '))
		expect(lines.slice(firstPower).every((l) => l.category.startsWith('Power · '))).toBe(true)
		// a Data project's BOM is as before
		expect(bom(withSettings((s) => s)).some((l) => l.category.includes(' · '))).toBe(false)
	})
	it('headings', () => {
		expect(categoryHeading(undefined, 'Cable')).toBe('Cable')
		expect(categoryHeading('av', 'Cable')).toBe('AV · Cable')
		expect(headingRank('Cable')).toBe(0)
		expect(headingRank('EMS · Cable')).toBeGreaterThan(headingRank('Power · Cable'))
	})
})
