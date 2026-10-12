// The restore notice (ADR 0008 §6) against a fake Firestore: read-only while someone else restores, abandoned notices,
// the countdown, announce / step refusals, and a failed listener (Q60, Q62). Fake timers for the 15 s tick and the countdown.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RestoreNotices, isLive, COUNTDOWN_MS, ABANDONED_MS, type Notice } from './restoreNotice.svelte'
import { EntityStore } from '../store/store'
import type { CadProject } from './project.svelte'

const fake = vi.hoisted(() => ({
	data: undefined as unknown,
	next: undefined as ((s: { data: () => unknown }) => void) | undefined,
	error: undefined as ((e: unknown) => void) | undefined,
	off: undefined as undefined | (() => void),
}))

vi.mock('firebase/firestore', () => ({
	doc: () => ({}),
	onSnapshot: (_r: unknown, next: (s: { data: () => unknown }) => void, error?: (e: unknown) => void) => {
		fake.next = next; fake.error = error
		fake.off = vi.fn()
		return fake.off
	},
	runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<void>) => {
		await fn({ get: async () => ({ data: () => fake.data }), set: (_r: unknown, v: unknown) => { fake.data = v } })
	},
}))

const T0 = 1_700_000_000_000
const notice = (o: Partial<Notice> = {}): Notice => ({ id: 'n1', state: 'running', by: { uid: 'bob', name: 'Bob', client: 'other-tab' }, what: 'Backup 1', parts: '1F', startsAt: T0, at: T0, ...o })
const push = (n: Notice | undefined) => { fake.data = n; fake.next?.({ data: () => n }) }

function setup() {
	const store = new EntityStore()
	const project = { db: {}, pid: 'p', user: 'alice', userName: 'Alice', client: 'my-tab', store, rev: 0, error: null as string | null } as unknown as CadProject
	return { project, store, notices: new RestoreNotices(project) }
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); fake.data = undefined })
afterEach(() => { vi.useRealTimers() })

describe('isLive', () => {
	it('pending / running and recent; done, cancelled and abandoned are not', () => {
		expect(isLive(notice({ state: 'pending' }), T0 + 1000)).toBe(true)
		expect(isLive(notice({ state: 'running' }), T0 + ABANDONED_MS - 1)).toBe(true)
		expect(isLive(notice({ state: 'running' }), T0 + ABANDONED_MS)).toBe(false)
		expect(isLive(notice({ state: 'done' }), T0)).toBe(false)
		expect(isLive(null)).toBe(false)
	})
})

describe('RestoreNotices', () => {
	it("someone else's running restore makes the store read-only, and finishing lifts it and clears undo", () => {
		const { store, notices, project } = setup()
		store.transact('Add', (tx) => tx.put({ type: 'settings', id: 'settings' } as never))
		expect(store.canUndo).toBe(true)
		push(notice())
		expect(store.readOnly).toMatch(/Bob is restoring 1F/)
		expect(project.rev).toBe(1)
		push(notice({ state: 'done', at: T0 + 1000 }))
		expect(store.readOnly).toBeNull()
		expect(store.canUndo).toBe(false)
		notices.destroy()
	})
	it('our own running notice never pauses this tab', () => {
		const { store, notices } = setup()
		push(notice({ by: { uid: 'alice', name: 'Alice', client: 'my-tab' } }))
		expect(store.readOnly).toBeNull()
		notices.destroy()
	})
	it('a running notice nobody finishes (closed tab) frees this tab by itself, at the next 15 s tick', () => {
		const { store, notices } = setup()
		push(notice({ at: T0 }))
		expect(store.readOnly).not.toBeNull()
		vi.advanceTimersByTime(ABANDONED_MS - 1000)
		expect(store.readOnly).not.toBeNull()
		vi.advanceTimersByTime(16_000)
		expect(store.readOnly).toBeNull()
		notices.destroy()
	})
	it('the tick redraws only on a real change (not every 15 s)', () => {
		const { project, notices } = setup()
		push(notice())
		const rev = project.rev
		vi.advanceTimersByTime(60_000)
		expect(project.rev).toBe(rev)
		notices.destroy()
	})
	it('remembers which notices it saw coming', () => {
		const { notices } = setup()
		push(notice({ id: 'seen', state: 'pending' }))
		push(notice({ id: 'seen', state: 'cancelled' }))
		expect(notices.sawComing('seen')).toBe(true)
		expect(notices.sawComing('other')).toBe(false)
		notices.destroy()
	})
	it('destroy stops the listener and the timer and lifts read-only', () => {
		const { store, notices } = setup()
		push(notice())
		notices.destroy()
		expect(fake.off).toHaveBeenCalled()
		expect(store.readOnly).toBeNull()
		expect(vi.getTimerCount()).toBe(0)
	})
	it('a failed listener says so on the project (Q60) instead of staying silent', () => {
		const { project, notices } = setup()
		fake.error?.(new Error('Missing or insufficient permissions'))
		expect(project.error).toMatch(/restore notices.*permissions/)
		notices.destroy()
	})
})

describe('announce and the steps', () => {
	it('announce writes a pending notice; a second one is refused while it is live', async () => {
		const { notices } = setup()
		const id = await notices.announce('Backup 1', '1F')
		expect((fake.data as Notice).state).toBe('pending')
		expect((fake.data as Notice).startsAt).toBe(T0 + COUNTDOWN_MS)
		await expect(notices.announce('Backup 2', '2F')).rejects.toThrow(/already restoring 1F/)
		await notices.start(id)
		expect((fake.data as Notice).state).toBe('running')
		await notices.finish(id, 'Restored 3 items')
		expect(fake.data).toMatchObject({ state: 'done', summary: 'Restored 3 items' })
		// finished: a new one may start
		await expect(notices.announce('Backup 2', '2F')).resolves.toBeTruthy()
		notices.destroy()
	})
	it('an abandoned notice does not block a new announce', async () => {
		const { notices } = setup()
		fake.data = notice({ state: 'running', at: T0 - ABANDONED_MS - 1 })
		await expect(notices.announce('B', '1F')).resolves.toBeTruthy()
		notices.destroy()
	})
	it('a step is refused after a cancel or when the notice was replaced', async () => {
		const { notices } = setup()
		const id = await notices.announce('B', '1F')
		await notices.cancel(id)
		await expect(notices.start(id)).rejects.toThrow('The restore was cancelled')
		fake.data = notice({ id: 'someone-else', state: 'pending' })
		await expect(notices.start(id)).rejects.toThrow('replaced')
		notices.destroy()
	})
	it('cancel never throws (nothing to cancel is fine)', async () => {
		const { notices } = setup()
		fake.data = undefined
		await expect(notices.cancel('nope')).resolves.toBeUndefined()
		notices.destroy()
	})
})

describe('countdown', () => {
	it('waits until startsAt', async () => {
		const { notices } = setup()
		const id = await notices.announce('B', '1F')
		push(fake.data as Notice)
		let done = false
		const p = notices.countdown(id).then(() => { done = true })
		await vi.advanceTimersByTimeAsync(COUNTDOWN_MS - 1000)
		expect(done).toBe(false)
		await vi.advanceTimersByTimeAsync(1500)
		await p
		expect(done).toBe(true)
		notices.destroy()
	})
	it('throws when cancelled meanwhile', async () => {
		const { notices } = setup()
		const id = await notices.announce('B', '1F')
		push(fake.data as Notice)
		const p = notices.countdown(id)
		const caught = p.catch((e: Error) => e.message)
		await vi.advanceTimersByTimeAsync(5000)
		push({ ...(fake.data as Notice), state: 'cancelled' })
		await vi.advanceTimersByTimeAsync(500)
		expect(await caught).toBe('The restore was cancelled')
		notices.destroy()
	})
	it('throws when our notice never shows up (replaced) after the countdown plus 15 s', async () => {
		const { notices } = setup()
		push(notice({ id: 'someone-else', state: 'pending', startsAt: T0 + 1_000_000 }))
		const caught = notices.countdown('mine').catch((e: Error) => e.message)
		await vi.advanceTimersByTimeAsync(COUNTDOWN_MS + 16_000)
		expect(await caught).toBe('The restore notice was replaced')
		notices.destroy()
	})
})
