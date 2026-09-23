import { describe, it, expect } from 'vitest'
import { selOnly, selToggle, selClear, idsOfKind, singleOfKind, groupByKind, type Selection, type SelItem } from './selection'

const ent = (id: string): SelItem => ({ kind: 'ent', id })
const obj = (id: string): SelItem => ({ kind: 'obj', id })
const guide = (id: string): SelItem => ({ kind: 'guide', id })
const section = (id: string): SelItem => ({ kind: 'section', id })
const frame = (id: string): SelItem => ({ kind: 'frame', id })
const node = (objId: string, nodeId: string): SelItem => ({ kind: 'node', id: objId, sub: nodeId })

describe('selOnly', () => {
	it('replaces the selection outright, including with an empty array', () => {
		expect(selOnly([ent('a'), ent('b')])).toEqual([ent('a'), ent('b')])
		expect(selOnly([])).toEqual([])
	})
})

describe('selClear', () => {
	it('is always []', () => {
		expect(selClear()).toEqual([])
	})
})

describe('exclusivity: entity vs model vs section vs frame vs guide vs node', () => {
	it('picking an entity REPLACES a model-object selection (via selOnly, the plain-click path)', () => {
		const cur: Selection = [obj('o1')]
		expect(selOnly([ent('e1')])).toEqual([ent('e1')])
		expect(cur).toEqual([obj('o1')])   // selOnly doesn't read `cur` — the caller just swaps it in
	})
	it('picking a model object, section, guide, or frame each replace whatever was selected before, of any kind', () => {
		expect(selOnly([obj('o1')])).toEqual([obj('o1')])
		expect(selToggle([ent('e1'), ent('e2')], [obj('o1')])).toEqual([obj('o1')])   // even via toggle (non-'ent' item)
		expect(selToggle([obj('o1')], [section('s1')])).toEqual([section('s1')])
		expect(selToggle([section('s1')], [guide('g1')])).toEqual([guide('g1')])
		expect(selToggle([guide('g1')], [frame('f1')])).toEqual([frame('f1')])
		expect(selToggle([frame('f1')], [ent('e1')])).toEqual([ent('e1')])   // and back to an entity
	})
	it('a node selection REPLACES a plain object selection of the same (or a different) object', () => {
		expect(selToggle([obj('wall1')], [node('wall1', 'n1')])).toEqual([node('wall1', 'n1')])
		expect(selToggle([node('wall1', 'n1')], [obj('wall2')])).toEqual([obj('wall2')])
	})
	it('clicking empty space (selClear) drops every kind at once', () => {
		expect(selClear()).toEqual([])
	})
})

describe('additive (Shift/Ctrl) toggle is ONLY for entities', () => {
	it('toggling an entity not yet selected adds it; toggling one already selected removes it', () => {
		expect(selToggle([ent('a')], [ent('b')])).toEqual([ent('a'), ent('b')])
		expect(selToggle([ent('a'), ent('b')], [ent('b')])).toEqual([ent('a')])
	})
	it('toggling a GROUP of entities (Shift-click a grouped entity): all-in removes all, any-out adds all', () => {
		const group = [ent('a'), ent('b')]
		expect(selToggle([], group)).toEqual(group)                              // none selected → add both
		expect(selToggle([ent('a')], group)).toEqual([ent('a'), ent('b')])       // partial → add the rest (B25 "whole group")
		expect(selToggle([ent('a'), ent('b')], group)).toEqual([])               // all in → remove both
	})
	it('toggling with an existing NON-entity selection still just replaces it (no additive gesture for obj/guide/section/frame/node)', () => {
		expect(selToggle([obj('o1')], [obj('o2')])).toEqual([obj('o2')])
		expect(selToggle([section('s1')], [section('s1')])).toEqual([section('s1')])   // "re-toggling" the same single item still just re-selects it (no such gesture exists today)
	})
	it('toggling with empty items is a no-op (nothing under the cursor to toggle)', () => {
		expect(selToggle([ent('a')], [])).toEqual([ent('a')])
		expect(selToggle([], [])).toEqual([])
	})
})

describe('idsOfKind / singleOfKind', () => {
	it('idsOfKind extracts every id of one kind, [] if none', () => {
		const sel: Selection = [ent('a'), ent('b'), obj('o1')]
		expect(idsOfKind(sel, 'ent')).toEqual(['a', 'b'])
		expect(idsOfKind(sel, 'obj')).toEqual(['o1'])
		expect(idsOfKind(sel, 'section')).toEqual([])
	})
	it('singleOfKind returns the one item of a single-select kind, or null if zero or more than one', () => {
		expect(singleOfKind([obj('o1')], 'obj')).toEqual(obj('o1'))
		expect(singleOfKind([], 'obj')).toBeNull()
		expect(singleOfKind([ent('a'), ent('b')], 'ent')).toBeNull()   // 2 ents — not "the one" (ent is never single-only)
	})
})

describe('groupByKind — the delete() dispatch shape', () => {
	it('groups a mixed selection by kind (though today a real selection is never mixed)', () => {
		const sel: Selection = [ent('a'), ent('b'), obj('o1'), guide('g1')]
		expect(groupByKind(sel)).toEqual({ ent: [ent('a'), ent('b')], obj: [obj('o1')], guide: [guide('g1')] })
	})
	it('is {} for an empty selection', () => {
		expect(groupByKind([])).toEqual({})
	})
	it('a node group carries the parent object id (kind.id) + the node id (kind.sub)', () => {
		const sel: Selection = [node('wall1', 'n1')]
		const g = groupByKind(sel)
		expect(g.node).toEqual([{ kind: 'node', id: 'wall1', sub: 'n1' }])
	})
})
