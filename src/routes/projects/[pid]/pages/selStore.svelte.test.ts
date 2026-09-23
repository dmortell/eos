import { describe, it, expect } from 'vitest'
import { selStore } from './selStore.svelte'
import type { SelItem } from './ui/selection'

const ent = (id: string): SelItem => ({ kind: 'ent', id })
const obj = (id: string): SelItem => ({ kind: 'obj', id })

describe('of / set', () => {
	it('defaults to [] for an unknown or undefined viewId', () => {
		expect(selStore.of('unknown-vp-1')).toEqual([])
		expect(selStore.of(undefined)).toEqual([])
	})
	it('round-trips a Selection, keyed by viewId, independent of other viewports', () => {
		selStore.set('vp-a', [ent('e1'), ent('e2')])
		selStore.set('vp-b', [obj('o1')])
		expect(selStore.of('vp-a')).toEqual([ent('e1'), ent('e2')])
		expect(selStore.of('vp-b')).toEqual([obj('o1')])
		expect(selStore.of('vp-c')).toEqual([])
	})
	it('set with an undefined viewId is a no-op', () => {
		expect(() => selStore.set(undefined, [ent('e1')])).not.toThrow()
		expect(selStore.of(undefined)).toEqual([])
	})
})

describe('drop', () => {
	it('removes every listed viewId, leaving the rest untouched', () => {
		selStore.set('vp-drop-1', [ent('e1')])
		selStore.set('vp-drop-2', [obj('o1')])
		selStore.set('vp-drop-3', [ent('e2')])
		selStore.drop(['vp-drop-1', 'vp-drop-2'])
		expect(selStore.of('vp-drop-1')).toEqual([])
		expect(selStore.of('vp-drop-2')).toEqual([])
		expect(selStore.of('vp-drop-3')).toEqual([ent('e2')])
	})
	it('an empty list is a no-op', () => {
		selStore.set('vp-drop-4', [ent('e1')])
		selStore.drop([])
		expect(selStore.of('vp-drop-4')).toEqual([ent('e1')])
	})
})

describe('snapshotAll / replaceAll — the print save/restore seam', () => {
	it('snapshotAll captures every live entry; replaceAll restores it', () => {
		selStore.set('vp-snap-1', [ent('e1')])
		selStore.set('vp-snap-2', [obj('o1')])
		const snap = selStore.snapshotAll()
		selStore.replaceAll({})
		expect(selStore.of('vp-snap-1')).toEqual([])
		expect(selStore.of('vp-snap-2')).toEqual([])
		selStore.replaceAll(snap)
		expect(selStore.of('vp-snap-1')).toEqual([ent('e1')])
		expect(selStore.of('vp-snap-2')).toEqual([obj('o1')])
	})
})
