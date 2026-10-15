// PASTED PICTURES (backlog "Paste a screenshot or picture", User 2026-10-12): the same picture pasted again is the same
// file — found by its content (SHA-256, kept on the file doc as `sha256`), in this session or in the project's Uploads —
// so it's uploaded once. A new one gets its file id at once and is shown from the clipboard's own bytes while it
// uploads, so it can be placed straight away; `pending` counts the uploads still going (the "Uploading…" mark).
import { collection, getDocs, query, where, type Firestore } from 'firebase/firestore'
import { freeFileId, storeFile, type FileStorage } from './projectFiles'

export interface PictureDeps {
	/** A project file with these bytes, if any (its id). */
	find(sha256: string): Promise<string | null>
	/** A file id not taken yet for this name. */
	freeId(name: string): Promise<string>
	upload(file: File, id: string, sha256: string): Promise<void>
	/** Show this url for the file until (and after) it's uploaded. */
	show(fileId: string, url: string): void
}

export async function sha256(file: Blob): Promise<string> {
	const h = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
	return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export class PictureUploads {
	/** Uploads still going. */
	pending = $state(0)
	#known = new Map<string, string>()      // sha256 → file id (this session: uploading or done)
	#taken = new Set<string>()               // ids handed out, before their file doc exists
	constructor(private deps: PictureDeps) {}

	/** The picture's file id — an existing one when these bytes are already in the project (`fresh` false), else a new
	 *  one whose upload goes on in the background (`done` settles with it; a failure rejects it). */
	async add(file: File, name: string): Promise<{ fileId: string; fresh: boolean; done: Promise<void> }> {
		const hash = await sha256(file)
		const had = this.#known.get(hash) ?? (await this.deps.find(hash))
		if (had) { this.#known.set(hash, had); return { fileId: had, fresh: false, done: Promise.resolve() } }
		let fileId = await this.deps.freeId(name)
		for (let n = 2; this.#taken.has(fileId); n++) fileId = await this.deps.freeId(name.replace(/(\.[^.]*)?$/, ` (${n})$1`))
		this.#taken.add(fileId)
		this.#known.set(hash, fileId)
		this.deps.show(fileId, URL.createObjectURL(file))
		this.pending++
		const done = this.deps.upload(new File([file], fileId, { type: file.type }), fileId, hash)
			.catch((e) => { this.#known.delete(hash); throw e })
			.finally(() => { this.pending-- })
		return { fileId, fresh: true, done }
	}
}

/** The deps over Firestore + the project's file storage. */
export function firestorePictureDeps(db: Firestore, pid: string, storage: () => FileStorage | undefined, show: PictureDeps['show']): PictureDeps {
	return {
		async find(hash) {
			const s = await getDocs(query(collection(db, 'files'), where('sha256', '==', hash)))
			const mine = s.docs.find((d) => { const x = d.data(); return x.url && (x.projectId === pid || (x.projectIds ?? []).includes(pid)) })
			return mine?.id ?? null
		},
		freeId: (name) => freeFileId(db, name),
		async upload(file, id, hash) { await storeFile(db, pid, file, { storage: storage(), route: 'imageUploader', id, extra: { sha256: hash } }) },
		show,
	}
}
