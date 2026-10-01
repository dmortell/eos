// SESSION-ONLY image keys (`img:<id>` → a data-URL in this map, never persisted). Since 2026-10-02 NOTHING creates
// them for a model: images are uploaded files (their URL / `pdf:` src) — a failed upload adds nothing, `addImage`
// refuses a data-URL, a pasted never-uploaded image is left out (ui/clipboard.ts). This map stays to RENDER keys an
// older session saved (they show nothing after a reload — re-insert those images) and for tests.
//
// Plain URLs ('/plan.jpg', 'https://…') pass through untouched.
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
