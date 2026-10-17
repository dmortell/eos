import { describe, it, expect } from 'vitest'
import { EntityStore, type Change } from '../store/store'
import { demoProject } from './fixtures'
import { historyEntry, MAX_IDS, roughSize } from './history'

const by = { uid: 'u1', name: 'User' }

describe('edit history entries', () => {
	it('a settled edit of this tab: its label, who, when, what it touched; undo / redo say so; others are left out', () => {
		const store = new EntityStore(), got: Change[] = []
		store.subscribe((c) => got.push(c))
		store.load(demoProject())
		const r1 = store.get('R1')!
		store.transact('Rename rack R1', (tx) => tx.put({ ...r1, name: 'A99' } as typeof r1))
		store.undo()
		store.redo()
		const out = got.map((c) => historyEntry(c, by, 7)).filter(Boolean)
		expect(out.map((e) => e!.label)).toEqual(['Rename rack R1', 'Undo: Rename rack R1', 'Redo: Rename rack R1'])
		expect(out[0]).toEqual({ at: 7, by, label: 'Rename rack R1', ids: ['R1'], n: 1 })
		// another tab's edit, a drag frame: not entries
		expect(historyEntry({ source: 'remote', ops: [{ id: 'R1', before: null, after: r1 }], final: true }, by, 1)).toBeNull()
		expect(historyEntry({ source: 'gesture', label: 'Move', ops: [{ id: 'R1', before: null, after: r1 }], final: false }, by, 1)).toBeNull()
	})
	it('a bulk edit keeps its first ids and how many', () => {
		const ops = Array.from({ length: 80 }, (_, i) => ({ id: `O${i}`, before: null, after: null }))
		const e = historyEntry({ source: 'local', label: 'Renumber 80 outlets', ops, final: true }, by, 1)!
		expect([e.ids.length, e.n]).toEqual([MAX_IDS, 80])
		expect([roughSize(0), roughSize(10), roughSize(10000)]).toEqual(['nothing', '3 kB', '3.0 MB'])
	})
})
