import { describe, it, expect } from 'vitest'
import { normTag, mergeTags, withoutTags, hasTag, tagSuggestions, suggestSheetMeta } from './tags'

describe('tags', () => {
	it('normalises and merges case-insensitively (first spelling wins)', () => {
		expect(normTag('  high   level ')).toBe('high level')
		expect(mergeTags(['AV', 'riser'], ['av', ' Rack ', '', 'rack'])).toEqual(['AV', 'riser', 'Rack'])
		expect(withoutTags(['AV', 'riser'], ['av'])).toEqual(['riser'])
		expect(hasTag(['High-Level'], 'high-level')).toBe(true)
	})
	it('suggests from every pool, minus the item\'s tags, prefix matches first', () => {
		const pools = [['high-level', 'low-level', 'AV'], ['av', 'level-3', 'server-room']]
		expect(tagSuggestions(pools, 'lev', [])).toEqual(['level-3', 'high-level', 'low-level'])
		expect(tagSuggestions(pools, '', ['AV'])).toEqual(['high-level', 'level-3', 'low-level', 'server-room'])
		expect(tagSuggestions(pools, 'x')).toEqual([])
		expect(tagSuggestions(pools, '', [], 2)).toHaveLength(2)
	})
})

describe('suggestSheetMeta', () => {
	const f = (direction: string, modelId?: string) => ({ direction, modelId })
	const kinds: Record<string, string> = { r: 'rack', b: 'building', z: 'zone' }
	const mk = (id: string) => kinds[id]
	it('side views of a rack row → an elevation of racks; of a building → risers', () => {
		expect(suggestSheetMeta({ title: 'Sheet', tags: [], frames: [f('front', 'r'), f('rear', 'r')] }, mk)).toEqual({ kind: 'elevation', category: 'racks', tags: [] })
		expect(suggestSheetMeta({ title: 'Sheet', tags: [], frames: [f('front', 'b')] }, mk)).toEqual({ kind: 'elevation', category: 'risers', tags: [] })
		expect(suggestSheetMeta({ title: 'Sheet', tags: [], frames: [f('left', 'z')] }, mk)).toEqual({ kind: 'elevation', tags: [] })
	})
	it('titles → kinds + tags; only for fields the sheet doesn\'t have yet', () => {
		expect(suggestSheetMeta({ title: 'Outlets 33F high level + AV', tags: [], frames: [f('plan', 'z')] }, mk)).toEqual({ kind: 'outlets', tags: ['high-level', 'AV'] })
		expect(suggestSheetMeta({ title: 'Trunks LL', tags: ['low-level'], frames: [] }, mk)).toEqual({ kind: 'trunks', tags: [] })
		expect(suggestSheetMeta({ title: 'Floor plan', kind: 'plan', tags: [], frames: [f('plan')] }, mk)).toEqual({ tags: [] })
		expect(suggestSheetMeta({ title: 'Rack elevations', kind: 'elevation', category: 'Racks', tags: [], frames: [f('front', 'r')] }, mk)).toEqual({ tags: [] })
		expect(suggestSheetMeta({ title: 'New sheet', tags: [], frames: [] })).toEqual({ tags: [] })
	})
})
