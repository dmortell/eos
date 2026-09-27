// Is an image shape's FILE still there? A PDF page (`pdf:<fileId>#<page>`) or an uploaded picture (an UploadThing /
// Firebase Storage URL) can be deleted in the Uploads tool while shapes still point at it — the browser may even keep
// showing a cached copy. Each such source is watched live (its `files` doc; for a picture without one — pasted before
// pastes were recorded in Uploads — a cache-busting load decides), and EntRender draws a "Missing file" placeholder so
// it can be replaced or deleted. Session-long, one watch per source.
import { Firestore } from '$lib'
import { parsePdfSrc } from './pdfRaster.svelte'

const missing = $state<Record<string, boolean>>({})
const watching = new Set<string>()
let db: Firestore | null = null
const UPLOADED = /^https:\/\/([^/]*\.)?(ufs\.sh|utfs\.io|firebasestorage\.googleapis\.com)\//i

/** Reactive: true once the file behind `src` is known to be gone. */
export function srcMissing(src: string | undefined): boolean {
	if (!src) return false
	if (!watching.has(src)) { watching.add(src); queueMicrotask(() => watch(src)) }   // never write state during a render
	return !!missing[src]
}

function watch(src: string) {
	const ps = parsePdfSrc(src)
	db ??= new Firestore()
	if (ps) { db.subscribeOne('files', ps.fileId, (d) => { missing[src] = !(d as { url?: string }).url }); return }
	if (!UPLOADED.test(src)) return   // a data key / a site URL: nothing to watch
	let hadDoc = false, probed = false
	db.subscribeWhere('files', 'url', src, (docs) => {
		if (docs.length) { hadDoc = true; missing[src] = false; return }
		if (hadDoc) { missing[src] = true; return }   // its files doc was just deleted (Uploads)
		if (probed) return
		probed = true
		const img = new Image()
		img.onload = () => { missing[src] = false }
		img.onerror = () => { missing[src] = true }
		img.src = src + (src.includes('?') ? '&' : '?') + 'eos-check=' + Date.now()   // past the browser cache
	})
}

/** A readable name for a missing source (the PDF's file id, else the URL's last part). */
export function srcName(src: string): string {
	const ps = parsePdfSrc(src)
	if (ps) return ps.fileId
	const last = decodeURIComponent(src.split(/[?#]/)[0].split('/').pop() ?? '')
	return last.includes('.') ? last : 'deleted from Uploads'   // an UploadThing key is no name
}
