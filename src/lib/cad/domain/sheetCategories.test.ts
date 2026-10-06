// Sheet categories: derived from viewports, the global list's add / move / retire, stray typed kinds.
import { describe, it, expect } from 'vitest'
import { DEFAULT_SHEET_CATEGORIES, derivedCategory, categoryOf, addCategory, moveCategory, ordered, strayKinds } from './sheetCategories'

const vp = (kind: string) => ({ view: { levelId: 'L', spec: { kind } } }) as never

describe('sheet categories', () => {
	it('derives from what the viewports show', () => {
		expect(derivedCategory({ viewports: [vp('plan'), vp('plan')] })).toBe('plans')
		expect(derivedCategory({ viewports: [vp('row')] })).toBe('rack-elevations')
		expect(derivedCategory({ viewports: [vp('plan'), vp('row')] })).toBe('general')
		expect(derivedCategory({ viewports: [] })).toBe('general')
	})
	it('adds with a unique slug at the end; moves renumber the order', () => {
		const l = addCategory(addCategory(DEFAULT_SHEET_CATEGORIES, 'Plans'), 'Cable routes', 'CR')
		expect(l.at(-2)!.id).toBe('plans-2')
		expect(l.at(-1)).toMatchObject({ id: 'cable-routes', code: 'CR' })
		const m = moveCategory(l, 'cable-routes', -1)
		expect(ordered(m).slice(-2).map((c) => c.id)).toEqual(['cable-routes', 'plans-2'])
	})
	it('a retired category is left out of pickers but still names its sheets', () => {
		const l = DEFAULT_SHEET_CATEGORIES.map((c) => (c.id === 'details' ? { ...c, retired: true } : c))
		expect(ordered(l).some((c) => c.id === 'details')).toBe(false)
		expect(categoryOf({ kind: 'details', viewports: [] }, l)).toMatchObject({ label: 'Details', auto: false })
	})
	it('typed kinds not in the list (matched by id or label) are strays', () => {
		expect(strayKinds([{ kind: 'plans' }, { kind: 'Details' }, { kind: 'Cable routes' }, {}], DEFAULT_SHEET_CATEGORIES)).toEqual(['Cable routes'])
	})
})
