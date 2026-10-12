// The persistence boundary (ADR 0003). The store and sync only see this interface, so Firestore (persist/firestore.ts)
// and the in-memory server used by tests are interchangeable — and a later backend change stays contained.
import type { Id } from '../domain/types'
import type { StoredDoc } from './docs'

/** A doc as the server now has it; `data` null = deleted (or no longer in the subscribed scopes). */
export interface RemoteDoc { id: Id; data: StoredDoc | null }

export interface Backend {
	/** Calls back with the current docs in `scopes` (once, even when there are none — that is the "loaded" signal),
	 *  then with every change to them. Returns an unsubscribe. `onError` runs when the listener fails (permission denied
	 *  …): it has stopped for good then. */
	subscribe(scopes: string[], onDocs: (docs: RemoteDoc[]) => void, onError?: (e: unknown) => void): () => void
	/** Write a batch: set each `data`, delete where `data` is null. */
	write(docs: RemoteDoc[]): Promise<void>
}

/**
 * An in-memory server with Firestore's delivery shape: writes land in order, then every subscriber whose scopes
 * cover a changed doc is told asynchronously — including the writer (its own echo).
 */
export class MemoryBackend implements Backend {
	readonly docs = new Map<Id, StoredDoc>()
	#subs = new Set<{ scopes: Set<string>; cb: (docs: RemoteDoc[]) => void; onError?: (e: unknown) => void }>()
	writes = 0

	/** Tests: every listener whose scopes include `scope` (any, if omitted) fails and stops, as a denied Firestore one does. */
	failListeners(e: unknown, scope?: string): void {
		for (const sub of [...this.#subs]) if (!scope || sub.scopes.has(scope)) { this.#subs.delete(sub); sub.onError?.(e) }
	}

	subscribe(scopes: string[], cb: (docs: RemoteDoc[]) => void, onError?: (e: unknown) => void): () => void {
		const sub = { scopes: new Set(scopes), cb, onError }
		this.#subs.add(sub)
		const initial = [...this.docs.values()].filter((d) => sub.scopes.has(d.scope)).map((d) => ({ id: d.id, data: d }))
		queueMicrotask(() => { if (this.#subs.has(sub)) cb(initial) })
		return () => this.#subs.delete(sub)
	}

	async write(docs: RemoteDoc[]): Promise<void> {
		this.writes += docs.length
		const changed: { doc: RemoteDoc; scope: string; was?: string }[] = []
		for (const d of docs) {
			const prev = this.docs.get(d.id)
			if (d.data) this.docs.set(d.id, structuredClone(d.data))
			else this.docs.delete(d.id)
			changed.push({ doc: { id: d.id, data: d.data ? structuredClone(d.data) : null }, scope: d.data?.scope ?? prev?.scope ?? '', was: prev?.scope })
		}
		queueMicrotask(() => {
			for (const sub of this.#subs) {
				// like Firestore: a doc that moved out of the listener's scope arrives there as "removed"
				const mine = changed.flatMap((c): RemoteDoc[] => sub.scopes.has(c.scope) ? [c.doc] : c.doc.data && c.was !== undefined && sub.scopes.has(c.was) ? [{ id: c.doc.id, data: null }] : [])
				if (mine.length) sub.cb(mine)
			}
		})
	}
}
