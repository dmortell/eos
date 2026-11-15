// The photo taken with each scan, by row, in this browser's IndexedDB (too big for localStorage).
// Nothing leaves the device until "Download photos".

const DB = 'eos-scan', STORE = 'photos'

let opening: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
	opening ??= new Promise((resolve, reject) => {
		const req = indexedDB.open(DB, 1)
		req.onupgradeneeded = () => req.result.createObjectStore(STORE)
		req.onsuccess = () => resolve(req.result)
		req.onerror = () => { opening = null; reject(req.error) }
	})
	return opening
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
	const store = (await db()).transaction(STORE, mode).objectStore(STORE)
	return new Promise((resolve, reject) => {
		const req = fn(store)
		req.onsuccess = () => resolve(req.result)
		req.onerror = () => reject(req.error)
	})
}

export const putPhoto = (row: number, blob: Blob) => run('readwrite', s => s.put(blob, row))
export const getPhoto = (row: number) => run<Blob | undefined>('readonly', s => s.get(row))
export const deletePhoto = (row: number) => run('readwrite', s => s.delete(row))
export const clearPhotos = () => run('readwrite', s => s.clear())

/** Every stored photo with its row. */
export async function allPhotos(): Promise<{ row: number; blob: Blob }[]> {
	const [keys, blobs] = await Promise.all([
		run<IDBValidKey[]>('readonly', s => s.getAllKeys()),
		run<Blob[]>('readonly', s => s.getAll()),
	])
	return keys.map((k, i) => ({ row: Number(k), blob: blobs[i] }))
}

/** A JPEG of an image or video frame, longest side at most `max` px. */
export async function toJpeg(src: HTMLVideoElement | ImageBitmap, max = 2400): Promise<Blob | null> {
	const w = src instanceof HTMLVideoElement ? src.videoWidth : src.width
	const h = src instanceof HTMLVideoElement ? src.videoHeight : src.height
	if (!w || !h) return null
	const k = Math.min(1, max / Math.max(w, h))
	const c = document.createElement('canvas')
	c.width = Math.round(w * k)
	c.height = Math.round(h * k)
	c.getContext('2d')?.drawImage(src, 0, 0, c.width, c.height)
	return new Promise(resolve => c.toBlob(resolve, 'image/jpeg', 0.85))
}
