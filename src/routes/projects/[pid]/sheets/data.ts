import { nanoid } from 'nanoid'
import { DEFAULT_PRINT_SETTINGS } from '$lib/ui/print/types'
import type { Firestore } from '$lib/db.svelte'
import type { SheetDoc } from './types'

/** Collection path for a project's sheets. */
const sheetsPath = (pid: string) => `projects/${pid}/sheets`

/** Subscribe to all sheets for a project, sorted by sortOrder. Returns an unsub fn. */
export function subscribeSheets(
	db: Firestore,
	pid: string,
	callback: (sheets: SheetDoc[]) => void,
): () => void {
	return db.subscribeMany(sheetsPath(pid), (docs) => {
		const sheets = (docs as unknown as SheetDoc[])
			.slice()
			.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
		callback(sheets)
	})
}

/**
 * Create a new sheet with sensible defaults and return its id (so the caller can
 * navigate straight to the editor). `existing` is used only to compute the next sortOrder.
 */
export async function createSheet(
	db: Firestore,
	pid: string,
	existing: SheetDoc[],
	uid: string,
): Promise<string> {
	const id = nanoid(8)
	const sortOrder = existing.length ? Math.max(...existing.map(s => s.sortOrder ?? 0)) + 1 : 0
	const sheet: SheetDoc = {
		id,
		projectId: pid,
		title: 'Untitled Sheet',
		sortOrder,
		paper: { ...DEFAULT_PRINT_SETTINGS },
		viewports: [],
		updatedAt: Date.now(),
		updatedBy: uid,
	}
	await db.save(sheetsPath(pid), sheet)
	return id
}

/** Upsert a full sheet doc (merge:true). */
export async function saveSheet(db: Firestore, pid: string, sheet: SheetDoc): Promise<void> {
	await db.save(sheetsPath(pid), { ...sheet, updatedAt: Date.now() })
}

/** Patch selected fields of a sheet (merge:true keeps the rest). */
export async function updateSheet(
	db: Firestore,
	pid: string,
	id: string,
	patch: Partial<SheetDoc>,
): Promise<void> {
	await db.save(sheetsPath(pid), { id, ...patch, updatedAt: Date.now() })
}

/** Delete a sheet permanently. */
export async function deleteSheet(db: Firestore, pid: string, id: string): Promise<void> {
	await db.delete(sheetsPath(pid), id)
}
