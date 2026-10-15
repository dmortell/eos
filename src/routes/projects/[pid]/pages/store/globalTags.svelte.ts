// The GLOBAL tag vocabulary (User 2026-09-27): every tag ever used on a Pages sheet, in ANY project — one doc
// `settings/pagesTags` = { tags: string[], updatedAt }. The tag picker suggests from it (merged with the project's
// own tags + DEFAULT_TAGS); saving a sheet with a tag it doesn't have yet adds it — in a transaction (read → case-
// insensitive union → write), so two people adding tags at once can't drop each other's, and never a duplicate.
// Subscribed once per session (like the block library); tags are never removed from it automatically.
import type { Firestore } from '$lib'
import { hasTag, mergeTags, normTag } from './tags'

export const GLOBAL_TAGS = { collection: 'settings', id: 'pagesTags' } as const

class GlobalTags {
	/** The vocabulary (first spelling of each tag wins). */
	tags = $state.raw<string[]>([])
	#db: Firestore | null = null
	#stop: (() => void) | null = null

	start(db: Firestore) {
		if (this.#db === db) return
		this.#stop?.()
		this.#db = db
		this.#stop = db.subscribeOne(GLOBAL_TAGS.collection, GLOBAL_TAGS.id, (d) => {
			const t = (d as { tags?: unknown })?.tags
			this.tags = Array.isArray(t) ? mergeTags([], t.filter((x): x is string => typeof x === 'string')) : []
		})
	}

	/** Add the tags the vocabulary doesn't have yet. Resolves false when the write failed (e.g. security rules). */
	async add(tags: readonly string[]): Promise<boolean> {
		const db = this.#db
		const fresh = mergeTags([], tags).filter((t) => normTag(t) && !hasTag(this.tags, t))
		if (!db || !fresh.length) return true
		this.tags = mergeTags(this.tags, fresh)   // suggest them straight away
		try {
			await db.runTransaction(async (tx) => {
				const cur = await tx.get(GLOBAL_TAGS.collection, GLOBAL_TAGS.id)
				const base = Array.isArray(cur?.tags) ? (cur.tags as unknown[]).filter((x): x is string => typeof x === 'string') : []
				const next = mergeTags(base, fresh)
				if (next.length !== base.length) tx.set(GLOBAL_TAGS.collection, GLOBAL_TAGS.id, { tags: next, updatedAt: new Date().toISOString() })
			})
			return true
		} catch (e) {
			console.warn('[pages] could not add to the global tag list', e)
			return false
		}
	}
}

/** One per session (every project shares it). */
export const globalTags = new GlobalTags()
