import { describe, it, expect } from 'vitest'
import { noopEditor } from './editor'

// R6: a Viewport mounted with no `editor` prop falls back to `noopEditor` and calls every method
// directly (no `?.`) — every one of these must exist and be callable with no throw and no return value
// the caller relies on.
describe('noopEditor', () => {
	it('every ents method is callable with no throw', () => {
		const e = noopEditor.ents
		expect(() => e.add({ id: 'a', type: 'rect' } as never)).not.toThrow()
		expect(() => e.update({ id: 'a', type: 'rect' } as never)).not.toThrow()
		expect(() => e.delete(['a'])).not.toThrow()
		expect(() => e.copy(['a'])).not.toThrow()
		expect(() => e.cut(['a'])).not.toThrow()
		expect(() => e.paste()).not.toThrow()
		expect(() => e.group(['a'])).not.toThrow()
		expect(() => e.ungroup(['a'])).not.toThrow()
		expect(() => e.reorder(['a'], 'front')).not.toThrow()
	})
	it('edit (EditScope) is callable with no throw, in the usual begin→mark→end order', () => {
		expect(() => { noopEditor.edit.begin(); noopEditor.edit.mark('label'); noopEditor.edit.mark(); noopEditor.edit.end(); noopEditor.edit.end(600) }).not.toThrow()
	})
	it('sections methods are callable with no throw', () => {
		expect(() => noopEditor.sections.select(null)).not.toThrow()
		expect(() => noopEditor.sections.select('s1')).not.toThrow()
		expect(() => noopEditor.sections.dropDir('s1', 'front')).not.toThrow()
	})
	it('sel (R3 commit 2a) methods are callable with no throw; get() reads back an empty Selection', () => {
		expect(noopEditor.sel.get()).toEqual([])
		expect(() => noopEditor.sel.only([{ kind: 'ent', id: 'a' }])).not.toThrow()
		expect(() => noopEditor.sel.toggle([{ kind: 'ent', id: 'a' }])).not.toThrow()
		expect(() => noopEditor.sel.clear()).not.toThrow()
		expect(() => noopEditor.sel.delete()).not.toThrow()
	})
})
