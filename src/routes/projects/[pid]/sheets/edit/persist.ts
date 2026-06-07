import type { Firestore } from '$lib/db.svelte'

/**
 * Debounced merge-writer for a single Firestore doc. Editors call `save(data)` after each
 * mutation; writes coalesce. One helper for every tool's source doc (outlets/racks/risers) and
 * the sheet doc. Pass plain objects (use `$state.snapshot` to unwrap reactive proxies).
 */
export function docSaver(db: Firestore, path: string, id: string, delay = 400) {
	let t: ReturnType<typeof setTimeout> | null = null
	let pending: Record<string, any> | null = null
	const flush = () => { if (t) { clearTimeout(t); t = null } if (pending) { db.save(path, { id, ...pending }); pending = null } }
	return {
		save(data: Record<string, any>) {
			pending = data
			if (t) clearTimeout(t)
			t = setTimeout(flush, delay)
		},
		flush,
		cancel() { if (t) { clearTimeout(t); t = null } pending = null },
	}
}
export type DocSaver = ReturnType<typeof docSaver>
