import { describe, it, expect } from 'vitest'
import { EntityStore, settles, type Change } from './store'
import { makeBox, makeText } from '../domain/make'
import type { Shape } from '../domain/shapes'

const box = (id: string, x = 0): Shape => ({ ...makeBox('L', { x, y: 0 }, 600, 600, 0, 720), id })
const xOf = (s: EntityStore, id: string) => {
	const e = s.get(id) as Shape | undefined
	return e?.geom.kind === 'rect' ? e.geom.centre.x : undefined
}
const moved = (e: Shape, x: number): Shape => (e.geom.kind === 'rect' ? { ...e, geom: { ...e.geom, centre: { ...e.geom.centre, x } } } : e)

describe('transactions and undo', () => {
	it('an edit is one undo step; undo and redo restore exactly', () => {
		const s = new EntityStore()
		s.transact('Add', (tx) => { tx.put(box('a')); tx.put(box('b', 100)) })
		s.transact('Move', (tx) => tx.put(moved(tx.get('a') as Shape, 500)))
		expect(xOf(s, 'a')).toBe(500)
		s.undo()
		expect(xOf(s, 'a')).toBe(0)
		s.undo()
		expect(s.size).toBe(0)
		s.redo(); s.redo()
		expect(xOf(s, 'a')).toBe(500)
		expect(xOf(s, 'b')).toBe(100)
	})
	it('mid-drag: undo waits (the step stays), and an edit made meanwhile runs once the drag ends', () => {
		const s = new EntityStore()
		s.transact('Add', (tx) => tx.put(box('a')))
		const g = s.begin('Drag')
		g.update((tx) => tx.put(moved(tx.get('a') as Shape, 300)))
		expect(s.busy).toBe(true)
		expect(s.undo()).toBeNull()
		expect(s.undoLabels).toEqual(['Add'])
		expect(s.transact('Later', (tx) => tx.put(box('b', 900)))).toBeNull()   // queued, not thrown
		expect(s.get('b')).toBeUndefined()
		g.commit()
		expect(s.busy).toBe(false)
		expect(s.undoLabels).toEqual(['Add', 'Drag', 'Later'])
		expect(xOf(s, 'a')).toBe(300)
		expect(xOf(s, 'b')).toBe(900)
	})
	it('a queued edit also runs after a rolled-back drag', () => {
		const s = new EntityStore()
		s.transact('Add', (tx) => tx.put(box('a')))
		const g = s.begin('Drag')
		g.update((tx) => tx.put(moved(tx.get('a') as Shape, 300)))
		s.transact('Later', (tx) => tx.put(box('b')))
		g.rollback()
		expect(xOf(s, 'a')).toBe(0)
		expect(s.undoLabels).toEqual(['Add', 'Later'])
	})
	it('a transaction that changes nothing records nothing', () => {
		const s = new EntityStore()
		s.transact('Add', (tx) => tx.put(box('a')))
		expect(s.transact('Nothing', (tx) => tx.put(tx.get('a')!))).toBeNull()
		expect(s.undoLabels).toEqual(['Add'])
	})
	it('a new edit clears redo', () => {
		const s = new EntityStore()
		s.transact('Add', (tx) => tx.put(box('a')))
		s.undo()
		s.transact('Other', (tx) => tx.put(box('b')))
		expect(s.canRedo).toBe(false)
	})
	it('records are frozen: editing one in place throws instead of silently desyncing', () => {
		const s = new EntityStore()
		s.transact('Add', (tx) => tx.put(box('a')))
		const a = s.get('a') as Shape
		expect(() => { (a.geom as { centre: { x: number } }).centre.x = 9 }).toThrow()
	})
})

describe('gestures', () => {
	it('a drag shows live, commits as ONE step, and Esc restores the start', () => {
		const s = new EntityStore()
		s.transact('Add', (tx) => tx.put(box('a')))
		const g = s.begin('Drag')
		for (const x of [10, 20, 30]) g.update((tx) => tx.put(moved(tx.get('a') as Shape, x)))
		expect(xOf(s, 'a')).toBe(30)
		g.commit()
		expect(s.undoLabels).toEqual(['Add', 'Drag'])
		s.undo()
		expect(xOf(s, 'a')).toBe(0)

		const g2 = s.begin('Drag')
		g2.update((tx) => tx.put(moved(tx.get('a') as Shape, 99)))
		g2.rollback()
		expect(xOf(s, 'a')).toBe(0)
		expect(s.undoLabels).toEqual(['Add'])
	})
	it('each update starts from the gesture start, so a drag never accumulates', () => {
		const s = new EntityStore()
		s.transact('Add', (tx) => tx.put(box('a', 100)))
		const g = s.begin('Drag')
		for (const d of [10, 20]) g.update((tx) => { const e = tx.get('a') as Shape; tx.put(moved(e, (e.geom as { centre: { x: number } }).centre.x + d)) })
		expect(xOf(s, 'a')).toBe(120)
		g.commit()
	})
	it('only the committed result is final (what persistence writes)', () => {
		const s = new EntityStore(), seen: Change[] = []
		s.subscribe((c) => seen.push(c))
		s.transact('Add', (tx) => tx.put(box('a')))
		const g = s.begin('Drag')
		g.update((tx) => tx.put(moved(tx.get('a') as Shape, 5)))
		g.update((tx) => tx.put(moved(tx.get('a') as Shape, 7)))
		g.commit()
		expect(seen.filter((c) => c.final).map((c) => c.label)).toEqual(['Add', 'Drag'])
	})
})

describe('other people', () => {
	it("undo never overwrites someone else's newer edit of the same entity", () => {
		const s = new EntityStore()
		s.transact('Add', (tx) => { tx.put(box('a')); tx.put(box('b')) })
		s.transact('Move both', (tx) => { tx.put(moved(tx.get('a') as Shape, 50)); tx.put(moved(tx.get('b') as Shape, 50)) })
		s.applyRemote([moved(s.get('b') as Shape, 777)])        // a colleague moves b
		const res = s.undo()!
		expect(xOf(s, 'a')).toBe(0)                             // ours: undone
		expect(xOf(s, 'b')).toBe(777)                           // theirs: kept
		expect(res.skipped.map((o) => o.id)).toEqual(['b'])
	})
	it('remote changes are not in my undo history', () => {
		const s = new EntityStore()
		s.applyRemote([makeText({ sheetId: 'S' }, { x: 0, y: 0 }, 'theirs')])
		expect(s.canUndo).toBe(false)
	})
})

describe('read-only while someone else restores', () => {
	it('refuses local edits, gestures, undo and redo with the reason; remote changes still arrive', () => {
		const s = new EntityStore(), said: string[] = []
		s.transact('Add', (tx) => tx.put(box('a')))
		s.readOnly = 'User is restoring 1F'
		s.onRefuse = (r) => said.push(r)
		expect(s.transact('Add b', (tx) => tx.put(box('b')))).toBeNull()
		const g = s.begin('Drag'); g.update((tx) => tx.put(moved(tx.get('a') as Shape, 900))); expect(g.commit()).toBeNull()
		expect(s.undo()).toBeNull()
		expect(s.canUndo).toBe(false)
		s.applyRemote([box('c')])
		expect([s.has('b'), xOf(s, 'a'), s.has('c')]).toEqual([false, 0, true])
		expect(said).toEqual(['User is restoring 1F', 'User is restoring 1F', 'User is restoring 1F'])
		s.readOnly = null
		s.clearHistory()
		expect(s.canUndo).toBe(false)
	})
})

describe('other people’s changes during a drag (review R22)', () => {
	it('rolled back: the remote change to the dragged item shows once the drag ends', () => {
		const s = new EntityStore()
		s.transact('Add', (tx) => tx.put(box('a')))
		const g = s.begin('Drag')
		g.update((tx) => tx.put(moved(tx.get('a') as Shape, 300)))
		s.applyRemote([moved(s.get('a') as Shape, 777)])
		g.update((tx) => tx.put(moved(tx.get('a') as Shape, 400)))
		expect(xOf(s, 'a')).toBe(400)   // the drag still shows
		g.rollback()
		expect(xOf(s, 'a')).toBe(777)   // not the pre-drag 0
	})
	it('committed: the drag wins (it is written after); a remote change to something else applies at once', () => {
		const s = new EntityStore()
		s.transact('Add', (tx) => { tx.put(box('a')); tx.put(box('b', 50)) })
		const g = s.begin('Drag')
		g.update((tx) => tx.put(moved(tx.get('a') as Shape, 300)))
		s.applyRemote([moved(s.get('a') as Shape, 777), moved(s.get('b') as Shape, 999)])
		expect(xOf(s, 'b')).toBe(999)
		g.commit()
		expect(xOf(s, 'a')).toBe(300)
	})
})

describe('a transaction that throws (review R21 / R88)', () => {
	it('leaves nothing half-written and records no step', () => {
		const s = new EntityStore()
		s.transact('Add', (tx) => tx.put(box('a')))
		expect(() => s.transact('Bad', (tx) => { tx.put(moved(tx.get('a') as Shape, 500)); tx.put(box('b')); throw new Error('boom') })).toThrow('boom')
		expect(xOf(s, 'a')).toBe(0)
		expect(s.get('b')).toBeUndefined()
		expect(s.undoLabels).toEqual(['Add'])
	})
})

describe('settling changes (Q59: readers that skip drag frames)', () => {
	const run = (end: 'commit' | 'rollback') => {
		const s = new EntityStore(), settled: string[] = []
		s.transact('Add', (tx) => tx.put(box('a')))
		s.subscribe((c) => { if (settles(c, s.busy)) settled.push(c.source) })
		const g = s.begin('Drag')
		for (let i = 1; i <= 60; i++) g.update((tx) => tx.put(moved(tx.get('a') as Shape, i)))
		expect(settled).toEqual([])   // 60 frames, none settled
		if (end === 'commit') g.commit(); else g.rollback()
		return settled
	}
	it('a drag settles once, when it is committed', () => expect(run('commit')).toEqual(['local']))
	it('a rolled-back drag settles once too (the data went back)', () => expect(run('rollback')).toEqual(['gesture']))
	it('a plain edit and an undo settle', () => {
		const s = new EntityStore(), settled: string[] = []
		s.subscribe((c) => { if (settles(c, s.busy)) settled.push(c.source) })
		s.transact('Add', (tx) => tx.put(box('a'))); s.undo()
		expect(settled).toEqual(['local', 'undo'])
	})
})
