// The Firestore backend (ADR 0003): `projects/{pid}/cadEntities/{id}`, one doc per entity, listeners by `scope`,
// writes in batches of ≤ 500. The Firestore instance is passed in (the app's `firestore` from $lib/db.svelte), so this
// file has no Svelte imports and nothing here runs until a project opens the cad tool.
import { collection, doc, onSnapshot, query, where, writeBatch, type Firestore } from 'firebase/firestore'
import type { Backend, RemoteDoc } from './backend'
import type { StoredDoc } from './docs'

export const CAD_COLLECTION = 'cadEntities'
const IN_LIMIT = 30          // Firestore's limit for `in` queries
const BATCH_LIMIT = 500      // and for one write batch

export class FirestoreBackend implements Backend {
	constructor(private db: Firestore, private pid: string) {}

	#col() { return collection(this.db, 'projects', this.pid, CAD_COLLECTION) }

	subscribe(scopes: string[], onDocs: (docs: RemoteDoc[]) => void, onError?: (e: unknown) => void): () => void {
		const offs: (() => void)[] = []
		for (let i = 0; i < scopes.length; i += IN_LIMIT) {
			const q = query(this.#col(), where('scope', 'in', scopes.slice(i, i + IN_LIMIT)))
			let first = true
			offs.push(onSnapshot(q, (snap) => {
				const docs = snap.docChanges().map((ch) => ({ id: ch.doc.id, data: ch.type === 'removed' ? null : (ch.doc.data() as StoredDoc) }))
				if (docs.length || first) onDocs(docs)
				first = false
			}, (e) => onError?.(e)))
		}
		return () => { for (const off of offs) off() }
	}

	async write(docs: RemoteDoc[]): Promise<void> {
		// every batch committed at once, in order (the SDK queues them): awaiting each before building the next let an
		// edit made meanwhile land first and then be overwritten by a later batch; and one failure left the rest unsent
		const commits: Promise<void>[] = []
		for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
			const batch = writeBatch(this.db)
			for (const d of docs.slice(i, i + BATCH_LIMIT)) {
				const ref = doc(this.#col(), d.id)
				if (d.data) batch.set(ref, d.data)
				else batch.delete(ref)
			}
			commits.push(batch.commit())
		}
		const failed = (await Promise.allSettled(commits)).find((r): r is PromiseRejectedResult => r.status === 'rejected')
		if (failed) throw failed.reason
	}
}
