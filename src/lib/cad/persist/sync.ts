// Store ⇄ backend (ADR 0003). Committed local ops (edits, undo, redo) are written as whole entity docs; docs from the
// server are applied as REMOTE changes (never undoable). Rules, borrowed from Pages' DocSaver:
//  - our own echo (updatedBy = me, rev = the one we wrote) is ignored;
//  - while our write to an entity is pending, server copies of it are ignored (ours lands after and wins);
//  - anything else from the server is the current truth and replaces the local record.
// Remote docs are applied from the subscription callback, never from an $effect (project memory: effect appliers
// re-apply stale docs).
import type { EntityStore, Change } from '../store/store'
import type { Backend, RemoteDoc } from './backend'
import { toDoc, fromDoc, scopeOf } from './docs'
import { sameEntity } from '../domain/restorePlan'
import type { Entity } from '../domain/drawing'
import type { Id } from '../domain/types'

export interface SyncOpts {
	user: string
	/** This tab / session, recorded on every write so changes can be traced (several tabs share one user). */
	client?: string
	now?: () => number
	/** Called when a write fails (the store keeps the edit; the caller should warn and retry or reload). */
	onError?: (e: unknown) => void
	/** Called whenever the number of unconfirmed writes changes (a "Saving… / Saved" indicator). */
	onPending?: (n: number) => void
}

export class Sync {
	#revs = new Map<Id, number>()
	#pending = new Map<Id, number>()
	#unsubs: (() => void)[] = []
	#inflight = new Set<Promise<void>>()

	constructor(private store: EntityStore, private backend: Backend, private opts: SyncOpts) {
		this.#unsubs.push(store.subscribe((c) => this.#onLocal(c)))
	}

	/** Start listening to some scopes (a level when its plan opens, a sheet when it opens …). `onLoaded` runs once,
	 *  after the first delivery has been applied. */
	watch(scopes: string[], onLoaded?: () => void): () => void {
		let loaded = false
		const mine = new Set(scopes)
		const off = this.backend.subscribe(scopes, (docs) => {
			// a doc that LEFT this query because it moved to another scope (an item moved to another level) isn't deleted:
			// the other scope's listener has it (review R89 — its "removed" could come after the move and delete it here)
			this.#onRemote(docs.filter((d) => { if (d.data) return true; const cur = this.store.get(d.id); return !cur || mine.has(scopeOf(cur)) }))
			if (!loaded) { loaded = true; onLoaded?.() }
		})
		this.#unsubs.push(off)
		return off
	}

	stop(): void { for (const off of this.#unsubs.splice(0)) off() }

	/** Resolves when every write started so far has finished (tests, "saving…" indicators, before unload). */
	async flush(): Promise<void> { await Promise.all([...this.#inflight]) }

	get pending(): number { return this.#pending.size }

	#onLocal(c: Change): void {
		if (!c.final || c.source === 'remote' || c.source === 'load' || c.source === 'gesture') return
		const now = this.opts.now?.() ?? Date.now()
		const docs: RemoteDoc[] = c.ops.map((op) => {
			const rev = (this.#revs.get(op.id) ?? 0) + 1
			this.#revs.set(op.id, rev)
			this.#pending.set(op.id, rev)
			return { id: op.id, data: op.after ? toDoc(op.after, { rev, updatedAt: now, updatedBy: this.opts.user, ...(this.opts.client ? { client: this.opts.client } : {}) }) : null }
		})
		this.#notify()
		const p = this.backend.write(docs)
			.catch((e) => {
				// not saved: stop waiting for echoes that won't come (Saving… cleared, other people's changes to them apply)
				for (const d of docs) if (this.#pending.get(d.id) === this.#revs.get(d.id)) this.#pending.delete(d.id)
				this.opts.onError?.(e)
			})
			.finally(() => {
				this.#inflight.delete(p)
				for (const d of docs) if (d.data === null && this.#pending.get(d.id) === this.#revs.get(d.id)) this.#pending.delete(d.id)
				this.#notify()
			})
		this.#inflight.add(p)
	}

	#notify(): void { this.opts.onPending?.(this.#pending.size) }

	#onRemote(docs: RemoteDoc[]): void {
		const puts: Entity[] = [], dels: Id[] = []
		for (const d of docs) {
			const mine = this.#pending.get(d.id)
			if (d.data) {
				const { entity, meta } = fromDoc(d.data)
				if (meta.updatedBy === this.opts.user && mine !== undefined && meta.rev >= mine) { this.#pending.delete(d.id); this.#revs.set(d.id, meta.rev); continue }
				if (mine !== undefined) continue
				this.#revs.set(d.id, Math.max(meta.rev, this.#revs.get(d.id) ?? 0))
				const cur = this.store.get(d.id)
				if (!cur || !sameEntity(cur, entity)) puts.push(entity)   // key order from the server doesn't count as a change
			} else {
				if (mine !== undefined) continue
				if (this.store.has(d.id)) dels.push(d.id)
			}
		}
		if (puts.length || dels.length) this.store.applyRemote(puts, dels)
		this.#notify()
	}
}
