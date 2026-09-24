// Debounced per-document saving with echo suppression (drawings-plan §2.4) — the Outlets/Elevations pattern:
//   • `queue(key, doc)` debounces writes per doc (500 ms) and skips a write whose content equals what the
//     store last saw for that doc (no-op edits, or a remote value re-queued unchanged);
//   • `remote(key, doc)` is called from the Firestore SUBSCRIPTION CALLBACK (never a $effect — see the
//     project memory "Remote-apply effects must depend ONLY on the subscribed doc"). It returns true when
//     the caller should APPLY the incoming doc: false for the echo of our own write, and false while a
//     local edit to that doc is still pending (the pending local write wins — last write wins overall).
// Content equality uses a key-sorted JSON (Firestore returns maps with its own key order) and ignores
// `updatedAt`, which every save stamps anew.
// Pure — no Firestore, no Svelte; the timers are injectable for tests.

type Timers = { set: (fn: () => void, ms: number) => unknown; clear: (h: unknown) => void }
const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) }

/** JSON with object keys sorted (recursively), `undefined` dropped like Firestore does, `updatedAt` ignored. */
export function stableJson(v: unknown): string {
	const norm = (x: unknown): unknown => {
		if (Array.isArray(x)) return x.map(norm)
		if (x && typeof x === 'object') {
			const out: Record<string, unknown> = {}
			for (const k of Object.keys(x as object).sort()) {
				const val = (x as Record<string, unknown>)[k]
				if (val !== undefined && k !== 'updatedAt') out[k] = norm(val)
			}
			return out
		}
		return x
	}
	return JSON.stringify(norm(v))
}

export class DocSaver<T> {
	#write: (key: string, doc: T) => Promise<void>
	#delay: number
	#timers: Timers
	#synced = new Map<string, string>()          // key → the content the store last saw (saved or received)
	#pending = new Map<string, { doc: T; handle: unknown }>()
	#onError?: (key: string, err: unknown) => void

	constructor(write: (key: string, doc: T) => Promise<void>, opts: { delayMs?: number; timers?: Timers; onError?: (key: string, err: unknown) => void } = {}) {
		this.#write = write
		this.#delay = opts.delayMs ?? 500
		this.#timers = opts.timers ?? realTimers
		this.#onError = opts.onError
	}

	/** Schedule a write of `doc` (replaces any pending one for the same key). */
	queue(key: string, doc: T) {
		const p = this.#pending.get(key)
		if (p) this.#timers.clear(p.handle)
		if (!p && stableJson(doc) === this.#synced.get(key)) return   // nothing changed
		const handle = this.#timers.set(() => { void this.#flushKey(key) }, this.#delay)
		this.#pending.set(key, { doc, handle })
	}

	/** A snapshot arrived for `key`: true = apply it locally. */
	remote(key: string, doc: T | null): boolean {
		if (this.#pending.has(key)) return false                      // our newer local edit wins
		const j = doc == null ? '' : stableJson(doc)
		if (j === this.#synced.get(key)) return false                 // the echo of our own write
		this.#synced.set(key, j)
		return true
	}

	/** Write every pending doc now (tab close / navigation). */
	async flush() { await Promise.all([...this.#pending.keys()].map((k) => this.#flushKey(k))) }

	/** Drop a pending write without saving (e.g. the doc was hard-deleted). */
	cancel(key: string) {
		const p = this.#pending.get(key)
		if (p) { this.#timers.clear(p.handle); this.#pending.delete(key) }
		this.#synced.delete(key)
	}

	get pendingCount() { return this.#pending.size }
	isPending(key: string) { return this.#pending.has(key) }

	async #flushKey(key: string) {
		const p = this.#pending.get(key); if (!p) return
		this.#timers.clear(p.handle)
		this.#pending.delete(key)
		const j = stableJson(p.doc)
		if (j === this.#synced.get(key)) return
		this.#synced.set(key, j)   // set BEFORE the await: the snapshot of this write may arrive first
		try { await this.#write(key, p.doc) } catch (err) { this.#synced.delete(key); this.#onError?.(key, err) }
	}
}
