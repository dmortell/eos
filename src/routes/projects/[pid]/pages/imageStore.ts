// P3 short term (review.md §P3): imported image DATA lives here, not inside the model. An image entity's
// `src` holds a short key (`img:<id>`) instead of a multi-megabyte data-URL, so model snapshots (undo
// history, revisions, and — when §12 / X7 land — the Firestore model doc with its 1 MB limit) carry a
// key, not the bytes. The long-term replacement is X7: upload the file and store its `files/{id}` id;
// this map is the stand-in, one per browser session (not persisted — a reload keeps only URL sources).
//
// Plain URLs ('/plan.jpg', 'https://…') are already small and pass through untouched.
import { newId } from './ids'

const KEY = 'img:'
const byKey = new Map<string, string>()
const byData = new Map<string, string>()   // data-URL → key, so re-importing the same image reuses its key

/** The `src` to STORE on an image entity: a data-URL is interned and replaced by its key; anything else is
 *  returned unchanged. */
export function internImage(src: string): string {
	if (!src.startsWith('data:')) return src
	const known = byData.get(src); if (known) return known
	const key = newId(KEY)
	byKey.set(key, src); byData.set(src, key)
	return key
}

/** The `src` to RENDER: an interned key resolves to its data-URL ('' if unknown, e.g. after a reload);
 *  anything else is returned unchanged. */
export function imageSrc(src: string | undefined): string {
	if (!src) return ''
	return src.startsWith(KEY) ? byKey.get(src) ?? '' : src
}
