import { describe, it, expect } from 'vitest'
import { listClick, selBlock } from './listSelect'

const order = ['a', 'b', 'c', 'd', 'e']
describe('listClick (list multi-select)', () => {
	it('a plain click selects one and sets the anchor', () => {
		expect(listClick(order, ['a', 'b'], 'a', 'c', {})).toEqual({ sel: ['c'], anchor: 'c', multi: false })
	})
	it('Ctrl / ⌘ toggles and moves the anchor', () => {
		expect(listClick(order, ['a'], 'a', 'c', { ctrlKey: true })).toEqual({ sel: ['a', 'c'], anchor: 'c', multi: true })
		expect(listClick(order, ['a', 'c'], 'a', 'a', { metaKey: true }).sel).toEqual(['c'])
	})
	it('Shift selects the range from the anchor, either direction; Ctrl+Shift adds it', () => {
		expect(listClick(order, ['b'], 'b', 'd', { shiftKey: true }).sel).toEqual(['b', 'c', 'd'])
		expect(listClick(order, ['d'], 'd', 'b', { shiftKey: true }).sel).toEqual(['b', 'c', 'd'])
		expect(listClick(order, ['a'], 'd', 'e', { shiftKey: true, ctrlKey: true }).sel).toEqual(['a', 'd', 'e'])
		expect(listClick(order, [], null, 'c', { shiftKey: true })).toEqual({ sel: ['c'], anchor: 'c', multi: true })
	})
	it('selBlock: the selection in list order when the item is in it, else the item', () => {
		expect(selBlock(order, ['d', 'b'], 'd')).toEqual(['b', 'd'])
		expect(selBlock(order, ['d', 'b'], 'a')).toEqual(['a'])
	})
})
