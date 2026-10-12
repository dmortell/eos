// The Firestore backend against a fake `firebase/firestore`: listener errors reach the caller (Q60), `in` queries are
// split at 30 scopes, writes go out in batches of 500. (vi.mock is hoisted, so the imports can stay at the top.)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FirestoreBackend } from './firestore'
import type { Firestore } from 'firebase/firestore'

interface Listener { scopes: string[]; next: (snap: unknown) => void; error?: (e: unknown) => void; off: ReturnType<typeof vi.fn> }
const fake = vi.hoisted(() => ({
	listeners: [] as Listener[],
	batches: [] as { sets: number; deletes: number; commit: () => Promise<void> }[],
	failBatch: -1,
}))

vi.mock('firebase/firestore', () => ({
	collection: () => ({}),
	doc: (_c: unknown, id: string) => ({ id }),
	query: (_c: unknown, w: { scopes: string[] }) => w,
	where: (_f: string, _op: string, scopes: string[]) => ({ scopes }),
	onSnapshot: (q: { scopes: string[] }, next: (s: unknown) => void, error?: (e: unknown) => void) => {
		const l = { scopes: q.scopes, next, error, off: vi.fn() }
		fake.listeners.push(l)
		return l.off
	},
	writeBatch: () => {
		const n = fake.batches.length
		const b = { sets: 0, deletes: 0, set: () => { b.sets++ }, delete: () => { b.deletes++ }, commit: async () => { if (n === fake.failBatch) throw new Error('quota') } }
		fake.batches.push(b)
		return b
	},
}))

const db = {} as Firestore
beforeEach(() => { fake.listeners.length = 0; fake.batches.length = 0; fake.failBatch = -1 })

describe('FirestoreBackend', () => {
	it('passes a listener error to the caller (a denied listener is stopped for good)', () => {
		const errors: unknown[] = []
		new FirestoreBackend(db, 'p').subscribe(['project'], () => {}, (e) => errors.push(e))
		fake.listeners[0].error?.(new Error('Missing or insufficient permissions'))
		expect(errors).toHaveLength(1)
		expect((errors[0] as Error).message).toMatch(/permissions/)
	})
	it('a listener error with no handler does not throw', () => {
		new FirestoreBackend(db, 'p').subscribe(['project'], () => {})
		expect(() => fake.listeners[0].error?.(new Error('x'))).not.toThrow()
	})
	it('splits more than 30 scopes into several queries, each reporting its own failure', () => {
		const scopes = Array.from({ length: 65 }, (_, i) => `level:${i}`), errors: unknown[] = []
		const off = new FirestoreBackend(db, 'p').subscribe(scopes, () => {}, (e) => errors.push(e))
		expect(fake.listeners.map((l) => l.scopes.length)).toEqual([30, 30, 5])
		fake.listeners[1].error?.(new Error('x'))
		expect(errors).toHaveLength(1)
		off()
		expect(fake.listeners.every((l) => l.off.mock.calls.length === 1)).toBe(true)
	})
	it('the first snapshot is delivered even when empty (the loaded signal); later empty ones are not', () => {
		const got: number[] = []
		new FirestoreBackend(db, 'p').subscribe(['project'], (d) => got.push(d.length))
		const empty = { docChanges: () => [] }
		fake.listeners[0].next(empty); fake.listeners[0].next(empty)
		fake.listeners[0].next({ docChanges: () => [{ type: 'removed', doc: { id: 'a', data: () => ({}) } }, { type: 'added', doc: { id: 'b', data: () => ({ id: 'b' }) } }] })
		expect(got).toEqual([0, 2])
	})
	it('writes in batches of at most 500, and a failed batch is reported after the rest were sent', async () => {
		const docs = Array.from({ length: 1100 }, (_, i) => ({ id: `d${i}`, data: i % 2 ? null : ({ id: `d${i}`, scope: 'project' } as never) }))
		const backend = new FirestoreBackend(db, 'p')
		await backend.write(docs)
		expect(fake.batches.map((b) => b.sets + b.deletes)).toEqual([500, 500, 100])
		expect(fake.batches.reduce((n, b) => n + b.deletes, 0)).toBe(550)
		fake.batches.length = 0; fake.failBatch = 1
		await expect(backend.write(docs)).rejects.toThrow('quota')
		expect(fake.batches).toHaveLength(3)
	})
})
