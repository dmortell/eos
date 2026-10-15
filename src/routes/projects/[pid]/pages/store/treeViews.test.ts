import { describe, it, expect } from 'vitest'
import { treeItems, buildGroupedTree, buildCustomTree, matchesFilter, groupPatch, viewById, BUILTIN_VIEWS, POOL_ID,
	addFolder, renameFolder, removeFolder, moveFolder, dropRefs, removeRefs, setFolderFilter, folderChildren, newCustomView, type TreeItem } from './treeViews'
import { newSheetDoc } from './mappers'
import type { NavNode } from '../mock/data'
import type { CustomFolderDoc, PagesSheetDoc, Place } from './schema'

const places: Place[] = [
	{ id: 'b', name: 'building1', kind: 'building', parentId: null, order: 0 },
	{ id: 'f34', name: '34F', kind: 'floor', parentId: 'b', order: 1 },
	{ id: 'f33', name: '33F', kind: 'floor', parentId: 'b', order: 0 },
	{ id: 'z1', name: 'Zone 3303', kind: 'zone', parentId: 'f33', order: 0 },
	{ id: 'r1', name: 'Server room', kind: 'room', parentId: 'f33', order: 1 },
	{ id: 'lf', name: '5F', parentId: null, order: 1, legacy: { floor: 5 } },   // a floor known only by its legacy link
]
const sheet = (id: string, over: Partial<PagesSheetDoc> = {}): PagesSheetDoc =>
	({ ...newSheetDoc({ pid: 'P', id, title: id, placeId: 'z1', sortOrder: 0, user: 'u', now: '2026-09-27' }), ...over })
const sheets = [
	sheet('O33H', { title: 'Outlets 33F HL', kind: 'outlets', tags: ['high-level'], drawingNumber: 'E-10', discipline: 'Electrical' }),
	sheet('O33L', { title: 'Outlets 33F LL', kind: 'outlets', tags: ['Low-Level', 'AV'], drawingNumber: 'E-2', discipline: 'Electrical' }),
	sheet('O34', { title: 'Outlets 34F', kind: 'outlets', tags: [], placeId: 'f34' }),
	sheet('T33', { title: 'Trunks 33F', kind: 'trunks', tags: ['high-level'], placeId: 'f33' }),
	sheet('E1', { title: 'Rack elevations', kind: 'elevation', category: 'Racks', placeId: 'r1', discipline: 'AV' }),
	sheet('E2', { title: 'Riser', kind: 'elevation', category: 'Risers', placeId: 'b' }),
	sheet('X', { title: 'Loose note', placeId: null }),
	sheet('ARCH', { title: 'Old', kind: 'outlets', status: 'archived' }),
]
const models = [
	{ id: 'm33', name: '33F', placeId: 'f33' },
	{ id: 'mz', name: 'Zone 3303', placeId: 'z1' },
	{ id: 'mold', name: 'Gone', placeId: 'f34', archived: true },
]
const items = treeItems(sheets, models, places)
const labels = (ns: NavNode[] | undefined) => (ns ?? []).map((n) => n.label)
const find = (ns: NavNode[], ...path: string[]): NavNode => {
	let cur: NavNode | undefined, list = ns
	for (const l of path) { cur = list.find((n) => n.label === l); if (!cur) throw new Error(`no ${l} in ${labels(list)}`); list = cur.children ?? [] }
	return cur!
}
const refs = (ns: NavNode[] | undefined) => (ns ?? []).filter((n) => n.ref).map((n) => n.ref)

describe('treeItems', () => {
	it('lists live sheets + models, located in the place tree', () => {
		expect(items.map((i) => i.ref).sort()).toEqual(['m:m33', 'm:mz', 's:E1', 's:E2', 's:O33H', 's:O33L', 's:O34', 's:T33', 's:X'])
		const o = items.find((i) => i.ref === 's:O33H')!
		expect([o.building?.name, o.floor?.name, o.zone?.name, o.place?.path]).toEqual(['building1', '33F', 'Zone 3303', 'building1 › 33F › Zone 3303'])
		expect(o.within).toEqual(['b', 'f33', 'z1'])
		expect(o.docId).toBe('sheet:O33H')
		const m = items.find((i) => i.ref === 'm:m33')!
		expect([m.type, m.kind, m.docId, m.floor?.name, m.zone]).toEqual(['model', 'model', 'model:m33', '33F', undefined])
		expect(items.find((i) => i.ref === 's:X')!.placeId).toBeNull()
	})
	it('a floor place with no kind is still a floor by its legacy link; floors order as the place tree does', () => {
		const it5 = treeItems([sheet('S', { placeId: 'lf' })], [], places)[0]
		expect(it5.floor?.name).toBe('5F')
		const f33 = items.find((i) => i.ref === 's:T33')!.floor!, f34 = items.find((i) => i.ref === 's:O34')!.floor!
		expect(f33.order).toBeLessThan(f34.order)   // 33F has order 0 under building1 → shown first
	})
})

describe('filters', () => {
	const it1 = (ref: string) => items.find((i) => i.ref === ref)!
	it('any-of within a field, all-of across; case-insensitive', () => {
		expect(matchesFilter(it1('s:O33L'), { tags: ['low-level'] })).toBe(true)
		expect(matchesFilter(it1('s:O33L'), { kinds: ['outlets'], tags: ['high-level'] })).toBe(false)
		expect(matchesFilter(it1('s:O33H'), { kinds: ['trunks', 'outlets'], disciplines: ['electrical'] })).toBe(true)
		expect(matchesFilter(it1('s:E1'), { categories: ['racks'] })).toBe(true)
	})
	it('places = at or under; models pass a kinds filter only with "model"', () => {
		expect(matchesFilter(it1('s:O33H'), { places: ['f33'] })).toBe(true)
		expect(matchesFilter(it1('s:O34'), { places: ['f33'] })).toBe(false)
		expect(matchesFilter(it1('m:m33'), { kinds: ['outlets'] })).toBe(false)
		expect(matchesFilter(it1('m:m33'), { kinds: ['model'] })).toBe(true)
		expect(matchesFilter(it1('m:m33'), undefined)).toBe(true)
	})
})

describe('buildGroupedTree', () => {
	it('By drawing type: kind › floor, Models first, "(no type)" last; counts on folders', () => {
		const t = buildGroupedTree(items, viewById([], 'tpl:type'))
		expect(labels(t)).toEqual(['Models', 'Outlets', 'Trunks', 'Elevations', '(no type)'])
		expect(labels(find(t, 'Outlets').children)).toEqual(['33F', '34F'])
		expect(find(t, 'Outlets').meta).toBe('3')
		expect(labels(find(t, 'Elevations').children)).toEqual(['33F', '(no floor)'])   // the building-level riser has no floor
		expect(refs(find(t, 'Models', '33F').children)).toEqual(['m:m33', 'm:mz'])
	})
	it('sheets sort by drawing number (natural, blanks last) then title', () => {
		const t = buildGroupedTree(items, viewById([], 'tpl:type'))
		expect(refs(find(t, 'Outlets', '33F').children)).toEqual(['s:O33L', 's:O33H'])   // E-2 before E-10
	})
	it('Outlets / trunks by level: the filter, the tag set, (no tag) for the rest; an item under each of its tags', () => {
		const t = buildGroupedTree(items, viewById([], 'tpl:level'))
		expect(labels(t)).toEqual(['Outlets', 'Trunks'])
		expect(labels(find(t, 'Outlets').children)).toEqual(['high-level', 'Low-Level', '(no tag)'])   // tag-set order; stored spelling
		expect(refs(find(t, 'Outlets', '(no tag)', '34F').children)).toEqual(['s:O34'])
		const both = buildGroupedTree(items, { id: 't', levels: ['tag'] })
		expect(labels(both)).toEqual(['AV', 'high-level', 'Low-Level', '(no tag)'])
		expect(refs(find(both, 'AV').children)).toEqual(['s:O33L'])
		expect(refs(find(both, 'Low-Level').children)).toEqual(['s:O33L'])
	})
	it('Elevations by category: category › place path', () => {
		const t = buildGroupedTree(items, viewById([], 'tpl:elev'))
		expect(labels(t)).toEqual(['Racks', 'Risers'])
		expect(labels(find(t, 'Racks').children)).toEqual(['building1 › 33F › Server room'])
	})
	it('a folder holding models AND sheets lists the models first under sub-headings', () => {
		const t = buildGroupedTree(items, { id: 'z', levels: ['zone'] })
		const z = find(t, 'Zone 3303').children!
		expect(z.map((n) => (n.subhead ? `[${n.label}]` : n.ref))).toEqual(['[Models]', 'm:mz', '[Sheets]', 's:O33L', 's:O33H'])
		expect(z[1]).toMatchObject({ model: 'mz', docId: 'model:mz' })
		expect(z[3]).toMatchObject({ sheet: true, drawing: 'sheet', number: 'E-2', docId: 'sheet:O33L' })
		expect(labels(t).at(-1)).toBe('(no zone)')
	})
	it('row ids are unique per position; folders carry their level / value path', () => {
		const t = buildGroupedTree(items, { id: 't', levels: ['tag'] })
		const ids: string[] = []
		const walk = (ns: NavNode[]) => { for (const n of ns) { ids.push(n.id); if (n.children) walk(n.children) } }
		walk(t)
		expect(new Set(ids).size).toBe(ids.length)
		const f = find(buildGroupedTree(items, viewById([], 'tpl:level')), 'Outlets', 'high-level')
		expect(f.vgroup?.path).toEqual([{ level: 'kind', value: 'outlets' }, { level: 'tag', value: 'high-level' }])
	})
	it('no levels = a flat list; empty items = no rows', () => {
		expect(refs(buildGroupedTree(items, { id: 'x', filter: { kinds: ['trunks'] } }))).toEqual(['s:T33'])
		expect(buildGroupedTree([], viewById([], 'tpl:type'))).toEqual([])
	})
	it('an unknown view id falls back to By place', () => {
		expect(viewById([], 'gone').id).toBe('places')
		expect(BUILTIN_VIEWS[0].kind).toBe('places')
	})
})

describe('groupPatch (drop onto a group)', () => {
	const cur = { kind: 'outlets' as const, discipline: '', category: '', tags: ['AV'] }
	it('sets kind / discipline / category, adds a tag (case-insensitive), never touches places', () => {
		expect(groupPatch([{ level: 'kind', value: 'outlets' }, { level: 'tag', value: 'high-level' }, { level: 'floor', value: 'f33' }], cur)).toEqual({ tags: ['AV', 'high-level'] })
		expect(groupPatch([{ level: 'tag', value: 'av' }], cur)).toBeNull()
		expect(groupPatch([{ level: 'kind', value: 'trunks' }, { level: 'discipline', value: 'Electrical' }], cur)).toEqual({ kind: 'trunks', discipline: 'Electrical' })
		expect(groupPatch([{ level: 'category', value: '' }], { ...cur, category: 'Racks' })).toEqual({ category: '' })
		expect(groupPatch([{ level: 'kind', value: '' }, { level: 'kind', value: 'model' }], cur)).toBeNull()
	})
})

describe('custom views', () => {
	let fs: CustomFolderDoc[] = []
	fs = addFolder(fs, { id: 'a', name: 'Issue 1', parentId: null })
	fs = addFolder(fs, { id: 'b', name: 'Client', parentId: null })
	fs = addFolder(fs, { id: 'c', name: 'HL', parentId: null, filter: { tags: ['high-level'] } })
	it('folders nest, reorder and rename; a folder can\'t move into itself', () => {
		expect(folderChildren(fs, null).map((f) => f.id)).toEqual(['a', 'b', 'c'])
		const m = moveFolder(fs, 'c', 'a', 'before')!
		expect(folderChildren(m, null).map((f) => f.id)).toEqual(['c', 'a', 'b'])
		const into = moveFolder(fs, 'b', 'a', 'into')!
		expect(folderChildren(into, 'a').map((f) => f.id)).toEqual(['b'])
		expect(folderChildren(into, null).map((f) => [f.id, f.order])).toEqual([['a', 0], ['c', 1]])
		expect(moveFolder(into, 'a', 'b', 'into')).toBeNull()
		expect(renameFolder(fs, 'a', '  Issue 2 ').find((f) => f.id === 'a')!.name).toBe('Issue 2')
		expect(renameFolder(fs, 'a', ' ').find((f) => f.id === 'a')!.name).toBe('Issue 1')
	})
	it('items are references: add, reorder, move, copy (an item in several folders), remove', () => {
		let x = dropRefs(fs, { refs: ['s:O33H', 's:T33'], to: 'a' })!
		expect(x.find((f) => f.id === 'a')!.items).toEqual(['s:O33H', 's:T33'])
		x = dropRefs(x, { refs: ['s:T33'], to: 'a', from: 'a', target: 's:O33H', zone: 'before' })!
		expect(x.find((f) => f.id === 'a')!.items).toEqual(['s:T33', 's:O33H'])
		const copied = dropRefs(x, { refs: ['s:T33'], to: 'b', from: 'a', copy: true })!
		expect([copied.find((f) => f.id === 'a')!.items, copied.find((f) => f.id === 'b')!.items]).toEqual([['s:T33', 's:O33H'], ['s:T33']])
		const moved = dropRefs(x, { refs: ['s:T33'], to: 'b', from: 'a' })!
		expect([moved.find((f) => f.id === 'a')!.items, moved.find((f) => f.id === 'b')!.items]).toEqual([['s:O33H'], ['s:T33']])
		expect(dropRefs(x, { refs: ['s:X'], to: 'c' })).toBeNull()   // smart folders fill themselves
		expect(removeRefs(x, 'a', ['s:O33H']).find((f) => f.id === 'a')!.items).toEqual(['s:T33'])
	})
	it('the tree: folders, smart matches (models first), stale refs skipped, "Not in a folder" pool last', () => {
		const withItems = dropRefs(fs, { refs: ['s:T33', 'm:m33', 's:deleted'], to: 'a' })!
		const t = buildCustomTree(items, { folders: withItems })
		expect(labels(t)).toEqual(['Issue 1', 'Client', 'HL', 'Not in a folder'])
		expect(refs(find(t, 'Issue 1').children)).toEqual(['s:T33', 'm:m33'])   // a plain folder keeps its own order
		expect(find(t, 'Issue 1').meta).toBe('2')
		expect(find(t, 'HL')).toMatchObject({ smart: true, cfolder: 'c' })
		expect(refs(find(t, 'HL').children)).toEqual(['s:O33H', 's:T33'])   // sorted: numbered sheets first
		const pool = t.at(-1)!
		expect(pool.id).toBe(POOL_ID)
		expect(refs(pool.children)).not.toContain('s:T33')
		expect(refs(pool.children)).toContain('s:O33H')   // only in a SMART folder → still unfiled
		expect(pool.children![0]).toMatchObject({ subhead: true, label: 'Models' })   // models first, under a sub-heading
		expect(refs(pool.children)[0]).toBe('m:mz')
	})
	it('sub-folders list before a folder\'s items; deleting a folder takes its sub-folders; smart filter on / off', () => {
		let x = addFolder(fs, { id: 'a1', name: 'Sub', parentId: 'a' })
		x = dropRefs(x, { refs: ['s:X'], to: 'a' })!
		expect(find(buildCustomTree(items, { folders: x }), 'Issue 1').children!.map((n) => n.label)).toEqual(['Sub', 'Loose note'])
		const r = removeFolder(x, 'a')
		expect(r.map((f) => [f.id, f.order])).toEqual([['b', 0], ['c', 1]])
		const plain = setFolderFilter(fs, 'c', undefined).find((f) => f.id === 'c')!
		expect(plain.filter).toBeUndefined()
		expect(setFolderFilter(fs, 'a', { kinds: ['plan'] }).find((f) => f.id === 'a')!.filter).toEqual({ kinds: ['plan'] })
	})
	it('a new view is an empty custom view', () => {
		expect(newCustomView('v1', 'Mine')).toEqual({ id: 'v1', name: 'Mine', kind: 'custom', folders: [] })
	})
})

// keep the TreeItem type exercised (a typo in the export would fail the check)
const _t: TreeItem | undefined = items[0]; void _t
