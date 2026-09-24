import { describe, it, expect } from 'vitest'
import { DocSaver, stableJson } from './saver'

// Manual timers: `run()` fires every scheduled callback.
function fakeTimers() {
	let seq = 0
	const q = new Map<number, () => void>()
	return {
		set: (fn: () => void) => { const h = ++seq; q.set(h, fn); return h },
		clear: (h: unknown) => { q.delete(h as number) },
		run: async () => { const fns = [...q.values()]; q.clear(); for (const f of fns) f(); await Promise.resolve(); await Promise.resolve() },
		get size() { return q.size },
	}
}
const setup = () => {
	const t = fakeTimers(), writes: [string, unknown][] = []
	const s = new DocSaver<Record<string, unknown>>(async (k, d) => { writes.push([k, d]) }, { timers: t })
	return { t, writes, s }
}

describe('stableJson', () => {
	it('ignores key order, undefined fields and updatedAt', () => {
		expect(stableJson({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: undefined }, updatedAt: 't1' })).toBe(stableJson({ a: { d: [1, { x: 1, y: 2 }] }, b: 1, updatedAt: 't2' }))
	})
})

describe('DocSaver', () => {
	it('debounces per doc: only the last queued version is written', async () => {
		const { t, writes, s } = setup()
		s.queue('a', { v: 1 }); s.queue('a', { v: 2 }); s.queue('b', { v: 9 })
		expect(t.size).toBe(2)
		await t.run()
		expect(writes).toEqual([['a', { v: 2 }], ['b', { v: 9 }]])
	})
	it('skips its own echo, applies a genuinely remote change', async () => {
		const { t, s } = setup()
		s.queue('a', { v: 1 }); await t.run()
		expect(s.remote('a', { v: 1, updatedAt: 'server' })).toBe(false)   // our write coming back
		expect(s.remote('a', { v: 5 })).toBe(true)                            // someone else's edit
		expect(s.remote('a', { v: 5 })).toBe(false)                           // …seen once
	})
	it('a pending local edit wins over a remote snapshot of that doc', () => {
		const { s } = setup()
		s.queue('a', { v: 1 })
		expect(s.remote('a', { v: 7 })).toBe(false)
		expect(s.isPending('a')).toBe(true)
	})
	it('does not write a doc back unchanged after receiving it', async () => {
		const { t, writes, s } = setup()
		s.remote('a', { v: 3 })
		s.queue('a', { v: 3 })
		await t.run()
		expect(writes).toEqual([])
	})
	it('flush writes pending docs now; cancel drops one', async () => {
		const { writes, s } = setup()
		s.queue('a', { v: 1 }); s.queue('b', { v: 2 }); s.cancel('b')
		await s.flush()
		expect(writes).toEqual([['a', { v: 1 }]]); expect(s.pendingCount).toBe(0)
	})
	it('a failed write reports the error and is retried by the next queue of the same content', async () => {
		const t = fakeTimers(), errs: string[] = []
		let fail = true, writes = 0
		const s = new DocSaver<{ v: number }>(async () => { writes++; if (fail) throw new Error('offline') }, { timers: t, onError: (k) => errs.push(k) })
		s.queue('a', { v: 1 }); await t.run()
		expect(errs).toEqual(['a'])
		fail = false; s.queue('a', { v: 1 }); await t.run()
		expect(writes).toBe(2)
	})
})
