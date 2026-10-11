// The project's uploaded files, live: its PDFs (for picking a level's floorplan) and images (logos). A file belongs to a
// project through the legacy `projectId` or the newer `projectIds` list ($lib/files.ts), so both are watched and
// merged. Issue PDFs (no page count) are left out of the PDFs. `storeFile` uploads cad's own files (issue PDFs, logos).
import { collection, doc, getDoc, onSnapshot, query, setDoc, where, type DocumentData, type Firestore } from 'firebase/firestore'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { genUploader } from 'uploadthing/client'
import { nanoid } from 'nanoid'
import type { OurFileRouter } from '../../../routes/api/uploadthing/uploadthing'

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

/** Where cad's own uploads go (backlog "Default file storage per project", Settings › Files): UploadThing (the
 *  default, as before) or Firebase Storage. */
export type FileStorage = 'uploadthing' | 'firebase'

/** Upload a file to the project's file storage and list it in its Uploads (`files/{id}`; `provider` says where the
 *  bytes are, as in Uploads). `id` = the doc id (default: a free one from the file's name, which is also its name);
 *  `route` = UploadThing's route (images / PDFs). Firebase paths are laid out as Uploads does. */
export async function storeFile(db: Firestore, pid: string, file: File, o: { storage?: FileStorage; route: 'imageUploader' | 'floorplanUploader'; id?: string; /** more fields for the file doc (a pasted picture's `sha256`) */ extra?: Record<string, unknown> }): Promise<{ id: string; url: string; key?: string }> {
	let url: string, at: { provider: FileStorage; path: string; key?: string }
	if (o.storage === 'firebase') {
		const path = `projects/${pid}/uploads/${nanoid(8)}_${file.name}`, r = ref(getStorage(db.app), path)
		await uploadBytes(r, file, { contentType: file.type })
		url = await getDownloadURL(r)
		at = { provider: 'firebase', path }
	} else {
		const { uploadFiles } = genUploader<OurFileRouter>({ package: 'cad' })
		const [res] = await uploadFiles(o.route, { files: [file] })
		if (!res?.ufsUrl) throw new Error('the upload returned no url')
		url = res.ufsUrl
		at = { provider: 'uploadthing', path: res.key, key: res.key }
	}
	const id = o.id ?? (await freeFileId(db, file.name))
	await setDoc(doc(db, 'files', id), { id, name: o.id ? file.name : id, url, ...at, type: file.type, size: file.size, projectId: pid, projectIds: [pid], uploadedAt: new Date(), ...o.extra })
	return { id, url, ...(at.key ? { key: at.key } : {}) }
}
