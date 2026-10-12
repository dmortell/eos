// Two people on one project, through the in-memory server: what ADR 0003 promises.
import { describe, it, expect } from 'vitest'
import { EntityStore, type Change } from '../store/store'
import { MemoryBackend, type Backend } from './backend'
import { Sync } from './sync'
import { toDoc, fromDoc, scopeOf, levelScope, PROJECT_SCOPE, stripUndefined } from './docs'
import { makeBox, makeText } from '../domain/make'
import type { Shape } from '../domain/shapes'

const tick = () => new Promise((r) => setTimeout(r, 0))
const box = (id: string, x = 0): Shape => ({ ...makeBox('L1', { x, y: 0 }, 600, 600, 0, 720), id })
const moved = (e: Shape, x: number): Shape => (e.geom.kind === 'rect' ? { ...e, geom: { ...e.geom, centre: { ...e.geom.centre, x } } } : e)
const xOf = (s: EntityStore, id: string) => { const e = s.get(id) as Shape | undefined; return e?.geom.kind === 'rect' ? e.geom.centre.x : undefined }

function client(server: MemoryBackend, user: string) {
	const store = new EntityStore()
	const sync = new Sync(store, server, { user })
	sync.watch([levelScope('L1'), PROJECT_SCOPE])
	return { store, sync }
}

describe('docs', () => {
	it('round-trips an entity without leaking meta into the record', () => {
		const b = box('a')
		const d = toDoc(b, { rev: 3, updatedAt: 1, updatedBy: 'u' })
		expect(d.scope).toBe('level:L1')
		expect(fromDoc(d).entity).toEqual(stripUndefined(b))
		expect(fromDoc(d).meta.rev).toBe(3)
	})
	it('a shape on a sheet loads with the sheet; an outlet with its level; a rack with the project', () => {
		expect(scopeOf(makeText({ sheetId: 'S' }, { x: 0, y: 0 }, 'x'))).toBe('sheet:S')
		expect(scopeOf({ type: 'outlet', id: 'o', levelId: 'L2', label: '1', tier: 'low', usage: 'desk', mount: 'floor', ports: [] })).toBe('level:L2')
		expect(scopeOf({ type: 'rack', id: 'r', levelId: 'L2', spaceId: 's', order: 0, name: 'R', kind: 'cabinet', heightU: 42, widthMm: 600, depthMm: 1000 })).toBe('project')
	})
	it('strips undefined at every depth (Firestore rejects it)', () => {
		expect(stripUndefined({ a: 1, b: undefined, c: { d: undefined, e: [{ f: undefined, g: 2 }] } })).toEqual({ a: 1, c: { e: [{ g: 2 }] } })
	})
})

describe('two people, one project', () => {
	it("an edit by one shows up for the other, and the writer doesn't re-apply its own echo", async () => {
		const server = new MemoryBackend(), A = client(server, 'alice'), B = client(server, 'bob')
		const seenA: Change[] = []
		A.store.subscribe((c) => seenA.push(c))
		A.store.transact('Add box', (tx) => tx.put(box('a', 100)))
		await A.sync.flush(); await tick()
		expect(xOf(B.store, 'a')).toBe(100)
		expect(seenA.filter((c) => c.source === 'remote')).toEqual([])
		expect(A.sync.pending).toBe(0)
	})
	it('edits to DIFFERENT entities never overwrite each other (per-entity granularity)', async () => {
		const server = new MemoryBackend(), A = client(server, 'alice'), B = client(server, 'bob')
		A.store.transact('Add', (tx) => { tx.put(box('a')); tx.put(box('b')) })
		await A.sync.flush(); await tick()
		A.store.transact('Move a', (tx) => tx.put(moved(tx.get('a') as Shape, 10)))
		B.store.transact('Move b', (tx) => tx.put(moved(tx.get('b') as Shape, 20)))
		await A.sync.flush(); await B.sync.flush(); await tick()
		for (const s of [A.store, B.store]) { expect(xOf(s, 'a')).toBe(10); expect(xOf(s, 'b')).toBe(20) }
	})
	it("undo skips what a colleague has changed since, and the skip is what gets saved", async () => {
		const server = new MemoryBackend(), A = client(server, 'alice'), B = client(server, 'bob')
		A.store.transact('Add', (tx) => { tx.put(box('a')); tx.put(box('b')) })
		A.store.transact('Move both', (tx) => { tx.put(moved(tx.get('a') as Shape, 50)); tx.put(moved(tx.get('b') as Shape, 50)) })
		await A.sync.flush(); await tick()
		B.store.transact('Bob moves b', (tx) => tx.put(moved(tx.get('b') as Shape, 999)))
		await B.sync.flush(); await tick()
		A.store.undo()
		await A.sync.flush(); await tick()
		for (const s of [A.store, B.store]) { expect(xOf(s, 'a')).toBe(0); expect(xOf(s, 'b')).toBe(999) }
	})
	it('the saving indicator hears when writes settle, even with no store change (add, then delete)', async () => {
		const server = new MemoryBackend(), store = new EntityStore(), seen: number[] = []
		const sync = new Sync(store, server, { user: 'alice', onPending: (n) => seen.push(n) })
		sync.watch([levelScope('L1')])
		store.transact('Add', (tx) => tx.put(box('a')))
		await sync.flush(); await tick()
		store.transact('Delete', (tx) => tx.del('a'))
		await sync.flush(); await tick()
		expect(seen[0]).toBe(1)
		expect(seen.at(-1)).toBe(0)
	})
	it('deletes propagate', async () => {
		const server = new MemoryBackend(), A = client(server, 'alice'), B = client(server, 'bob')
		A.store.transact('Add', (tx) => tx.put(box('a')))
		await A.sync.flush(); await tick()
		B.store.transact('Delete', (tx) => tx.del('a'))
		await B.sync.flush(); await tick()
		expect(A.store.has('a')).toBe(false)
		expect(server.docs.has('a')).toBe(false)
	})
	it('a drag writes once, on release — not on every pointer move', async () => {
		const server = new MemoryBackend(), A = client(server, 'alice')
		A.store.transact('Add', (tx) => tx.put(box('a')))
		await A.sync.flush()
		const before = server.writes
		const g = A.store.begin('Drag')
		for (let x = 1; x <= 30; x++) g.update((tx) => tx.put(moved(tx.get('a') as Shape, x)))
		g.commit()
		await A.sync.flush()
		expect(server.writes - before).toBe(1)
	})
	it('a late joiner loads what is already there', async () => {
		const server = new MemoryBackend(), A = client(server, 'alice')
		A.store.transact('Add', (tx) => { tx.put(box('a', 7)); tx.put(makeText({ sheetId: 'S' }, { x: 0, y: 0 }, 'not in my scopes')) })
		await A.sync.flush()
		const C = client(server, 'carol')
		await tick()
		expect(xOf(C.store, 'a')).toBe(7)
		expect(C.store.size).toBe(1)
	})
})

describe('a write that fails (review R16)', () => {
	it('stops waiting for its echo: Saving… clears and the error is reported', async () => {
		const server = new MemoryBackend()
		server.write = async () => { throw new Error('permission denied') }
		const store = new EntityStore(), errors: unknown[] = []
		const sync = new Sync(store, server, { user: 'u', onError: (e) => errors.push(e) })
		store.transact('Add', (tx) => tx.put(makeBox('L', { x: 0, y: 0 }, 600, 600, 0, 720)))
		expect(sync.pending).toBe(1)
		await sync.flush()
		expect(sync.pending).toBe(0)
		expect(errors).toHaveLength(1)
	})
})

describe('a listener that fails (Q60)', () => {
	it('reports the scopes, runs onFailed, and never says "loaded"', async () => {
		const server = new MemoryBackend(), store = new EntityStore(), lost: string[][] = []
		const sync = new Sync(store, server, { user: 'u', onListenError: (_e, scopes) => lost.push(scopes) })
		let loaded = 0, failed: unknown = null
		sync.watch([PROJECT_SCOPE], () => loaded++, (e) => (failed = e))
		server.failListeners(new Error('Missing or insufficient permissions'), PROJECT_SCOPE)
		await tick()
		expect(lost).toEqual([[PROJECT_SCOPE]])
		expect((failed as Error).message).toMatch(/permissions/)
		expect(loaded).toBe(0)
	})
	it('only the failing scope is reported; the others keep working', async () => {
		const server = new MemoryBackend(), store = new EntityStore(), lost: string[][] = []
		const sync = new Sync(store, server, { user: 'u', onListenError: (_e, scopes) => lost.push(scopes) })
		sync.watch([levelScope('L1')]); sync.watch([levelScope('L2')])
		server.failListeners(new Error('denied'), levelScope('L2'))
		expect(lost).toEqual([[levelScope('L2')]])
		await server.write([{ id: 'a', data: toDoc(box('a', 5), { rev: 1, updatedAt: 1, updatedBy: 'bob' }) }])
		await tick()
		expect(xOf(store, 'a')).toBe(5)
	})
})

describe('an item moved to another scope (review R89)', () => {
	const onLevel = (e: Shape, levelId: string): Shape => ({ ...e, levelId })
	function watcher(server: MemoryBackend, order: string[]) {
		const store = new EntityStore(), changes: Change[] = []
		const sync = new Sync(store, server, { user: 'carol' })
		for (const l of order) sync.watch([levelScope(l)])
		store.subscribe((c) => changes.push(c))
		return { store, sync, changes }
	}
	for (const order of [['L1', 'L2'], ['L2', 'L1']]) {
		it(`moved from L1 to L2 by someone else, listeners added ${order.join(' then ')}: still there, in its new place`, async () => {
			const server = new MemoryBackend(), A = client(server, 'alice')
			A.store.transact('Add', (tx) => tx.put(box('a', 3)))
			await A.sync.flush()
			const W = watcher(server, order)
			await tick()
			expect(W.store.has('a')).toBe(true)
			A.store.transact('Move to L2', (tx) => tx.put(onLevel(tx.get('a') as Shape, 'L2')))
			await A.sync.flush(); await tick()
			expect(W.store.has('a')).toBe(true)
			expect((W.store.get('a') as Shape).levelId).toBe('L2')
		})
	}
	it('a listener that gets only the "removed" (nobody watches the new level) does remove it', async () => {
		const server = new MemoryBackend(), A = client(server, 'alice'), B = client(server, 'bob')
		A.store.transact('Add', (tx) => tx.put(box('a')))
		await A.sync.flush(); await tick()
		expect(B.store.has('a')).toBe(true)
		A.store.transact('Move to L2', (tx) => tx.put({ ...(tx.get('a') as Shape), levelId: 'L2' }))
		await A.sync.flush(); await tick()
		expect(B.store.has('a')).toBe(false)
	})
	it('a real delete still removes it, whichever listener hears it', async () => {
		const server = new MemoryBackend(), A = client(server, 'alice')
		A.store.transact('Add', (tx) => tx.put(box('a')))
		await A.sync.flush()
		const W = watcher(server, ['L2', 'L1'])
		await tick()
		A.store.transact('Delete', (tx) => tx.del('a'))
		await A.sync.flush(); await tick()
		expect(W.store.has('a')).toBe(false)
	})
})

describe('pending writes', () => {
	it('while our write is in flight, someone else’s copy of the same entity is ignored; ours lands after and wins', async () => {
		const server = new MemoryBackend()
		const slow: Backend = { subscribe: (s, cb, e) => server.subscribe(s, cb, e), write: async (d) => { await tick(); await tick(); return server.write(d) } }
		const store = new EntityStore()
		const sync = new Sync(store, slow, { user: 'alice' })
		sync.watch([levelScope('L1')])
		store.transact('Add', (tx) => tx.put(box('a')))
		await sync.flush(); await tick()
		store.transact('Alice moves', (tx) => tx.put(moved(tx.get('a') as Shape, 10)))
		expect(sync.pending).toBe(1)
		await server.write([{ id: 'a', data: toDoc(moved(box('a'), 99), { rev: 50, updatedAt: 1, updatedBy: 'bob' }) }])
		await tick()
		expect(xOf(store, 'a')).toBe(10)           // bob’s copy ignored while ours is pending
		await sync.flush(); await tick()
		expect(sync.pending).toBe(0)
		expect(xOf(store, 'a')).toBe(10)
		expect(fromDoc(server.docs.get('a')!).entity).toMatchObject({ geom: { centre: { x: 10 } } })
	})
	it('a delete clears its pending mark when it settles (there is no echo of a delete to wait for)', async () => {
		const server = new MemoryBackend(), A = client(server, 'alice')
		A.store.transact('Add', (tx) => tx.put(box('a')))
		await A.sync.flush(); await tick()
		A.store.transact('Delete', (tx) => tx.del('a'))
		expect(A.sync.pending).toBe(1)
		await A.sync.flush()
		expect(A.sync.pending).toBe(0)
	})
	it('after a failed write the edit stays local and later remote changes to it apply again', async () => {
		const server = new MemoryBackend(), store = new EntityStore(), errors: unknown[] = []
		const real = server.write.bind(server)
		let fail = true
		server.write = async (d) => { if (fail) throw new Error('offline'); return real(d) }
		const sync = new Sync(store, server, { user: 'alice', onError: (e) => errors.push(e) })
		sync.watch([levelScope('L1')])
		store.transact('Add', (tx) => tx.put(box('a')))
		await sync.flush()
		expect(errors).toHaveLength(1)
		expect(store.has('a')).toBe(true)
		fail = false
		await real([{ id: 'a', data: toDoc(box('a', 40), { rev: 9, updatedAt: 1, updatedBy: 'bob' }) }])
		await tick()
		expect(xOf(store, 'a')).toBe(40)
	})
})
