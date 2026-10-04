// The project's uploaded files, live: its PDFs (for picking a level's floorplan) and images (logos). A file belongs to a
// project through the legacy `projectId` or the newer `projectIds` list ($lib/files.ts), so both are watched and
// merged. Issue PDFs (no page count) are left out of the PDFs.
import { collection, doc, getDoc, onSnapshot, query, setDoc, where, type DocumentData, type Firestore } from 'firebase/firestore'

export interface PdfFile {
	id: string
	name: string
	pageCount: number
	/** Per page: calibrated in Uploads (origin + scale) — only those can be placed. */
	calibrated: Record<number, boolean>
}

export interface ImageFile { id: string; name: string; url: string; key?: string }

/** Every file doc of the project (both membership fields), live. */
function watchProjectFiles(db: Firestore, pid: string, cb: (docs: { id: string; data: DocumentData }[]) => void): () => void {
	const parts: Record<'legacy' | 'members', Map<string, DocumentData>> = { legacy: new Map(), members: new Map() }
	const emit = () => cb([...new Map([...parts.legacy, ...parts.members])].map(([id, data]) => ({ id, data })))
	const listen = (k: 'legacy' | 'members', q: ReturnType<typeof query>) => onSnapshot(q, (s) => {
		parts[k] = new Map()
		s.forEach((d) => { parts[k].set(d.id, d.data() as DocumentData) })
		emit()
	})
	const files = collection(db, 'files')
	const offs = [listen('legacy', query(files, where('projectId', '==', pid))), listen('members', query(files, where('projectIds', 'array-contains', pid)))]
	return () => offs.forEach((off) => off())
}

export function watchProjectPdfs(db: Firestore, pid: string, cb: (files: PdfFile[]) => void): () => void {
	return watchProjectFiles(db, pid, (docs) => cb(docs.flatMap(({ id, data: x }) => {
		if (!x.pageCount) return []
		const calibrated: Record<number, boolean> = {}
		for (let n = 1; n <= x.pageCount; n++) { const p = x.pages?.[n]; calibrated[n] = !!(p?.origin && p?.scale?.scale) }
		return [{ id, name: x.name ?? id, pageCount: x.pageCount, calibrated }]
	}).sort((a, b) => a.name.localeCompare(b.name))))
}

const IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i
export function watchProjectImages(db: Firestore, pid: string, cb: (files: ImageFile[]) => void): () => void {
	return watchProjectFiles(db, pid, (docs) => cb(docs
		.filter(({ data: x }) => x.url && ((x.type ?? '').startsWith('image/') || IMAGE.test(x.name ?? '')))
		.map(({ id, data: x }) => ({ id, name: x.name ?? id, url: x.url, ...(x.key ? { key: x.key } : {}) }))
		.sort((a, b) => a.name.localeCompare(b.name))))
}

/** A file id (= name) not taken yet: "logo.png", else "logo (2).png" … — a new upload never replaces a file already
 *  there (issued drawings may use it). */
export async function freeFileId(db: Firestore, name: string): Promise<string> {
	const m = name.match(/^(.*?)(\.[^.]*)?$/)!, base = m[1], ext = m[2] ?? ''
	for (let n = 1; n < 100; n++) {
		const id = n === 1 ? name : `${base} (${n})${ext}`
		if (!(await getDoc(doc(db, 'files', id))).exists()) return id
	}
	return `${base} (${Date.now()})${ext}`
}

/** Record an uploaded image in the project's Uploads (UploadThing: url + key), under a free name. */
export async function saveProjectImage(db: Firestore, pid: string, f: { name: string; url: string; key: string; size: number; type: string }): Promise<string> {
	const id = await freeFileId(db, f.name)
	await setDoc(doc(db, 'files', id), { id, name: id, url: f.url, key: f.key, path: f.key, type: f.type, provider: 'uploadthing', size: f.size, projectId: pid, projectIds: [pid], uploadedAt: new Date() })
	return id
}
