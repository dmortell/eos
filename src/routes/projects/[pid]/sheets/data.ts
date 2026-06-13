import { nanoid } from 'nanoid'
import { DEFAULT_PRINT_SETTINGS } from '$lib/ui/print/types'
import type { Firestore } from '$lib/db.svelte'
import type { SheetDoc, SheetPackage } from './types'

/** Collection path for a project's sheets. */
const sheetsPath = (pid: string) => `projects/${pid}/sheets`
/** Collection path for a project's sheet packages (drawing sets). */
const packagesPath = (pid: string) => `projects/${pid}/sheetPackages`

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

/**
 * Create a "file" sheet — a list row that links to another tool (Patching, Frames, …) instead of
 * the sheet editor. Has no viewports; carries a title + the link. Returns its id.
 */
export async function createFileSheet(
	db: Firestore,
	pid: string,
	existing: SheetDoc[],
	uid: string,
	link: { tool: string; label?: string; floor?: number; room?: string },
	title: string,
): Promise<string> {
	const id = nanoid(8)
	const sortOrder = existing.length ? Math.max(...existing.map(s => s.sortOrder ?? 0)) + 1 : 0
	const sheet: SheetDoc = {
		id,
		projectId: pid,
		title,
		sortOrder,
		paper: { ...DEFAULT_PRINT_SETTINGS },
		viewports: [],
		link,
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

// ── Renumber ──

/** Split a drawing number into a text prefix + trailing integer (keeping the zero-pad width). */
export function parseDrawingNumber(s: string | undefined): { prefix: string; num: number | null; width: number } {
	const v = (s ?? '').trim()
	const m = v.match(/^(.*?)(\d+)$/)
	if (m) return { prefix: m[1], num: parseInt(m[2], 10), width: m[2].length }
	return { prefix: v, num: null, width: 0 }
}

/**
 * Plan a sequential renumber of `selected` sheets (taken in their list order). The starting number
 * comes from the first selected sheet's drawing number; if it has none, the sequence continues from
 * the sheet immediately before it in `all`, otherwise starts at 1. Each sheet keeps its own prefix
 * and zero-pad width (falling back to the lead sheet's), so only the numeric part is reassigned.
 * Returns the id→drawingNumber changes (only where the value actually changes).
 */
export function planRenumber(selected: SheetDoc[], all: SheetDoc[]): { id: string; drawingNumber: string }[] {
	if (!selected.length) return []
	const lead = parseDrawingNumber(selected[0].drawingNumber)
	let start = lead.num
	// Fallback prefix + zero-pad width for selected sheets that have no number of their own.
	let basePrefix = lead.prefix, baseWidth = lead.width
	if (start == null) {
		const i = all.findIndex(s => s.id === selected[0].id)
		const prev = i > 0 ? parseDrawingNumber(all[i - 1].drawingNumber) : null
		if (prev?.num != null) { start = prev.num + 1; basePrefix = prev.prefix; baseWidth = prev.width }
		else start = 1
	}
	const out: { id: string; drawingNumber: string }[] = []
	selected.forEach((s, i) => {
		const p = parseDrawingNumber(s.drawingNumber)
		const prefix = p.prefix || basePrefix
		const width = p.width || baseWidth
		const n = (start as number) + i
		const drawingNumber = `${prefix}${width > 0 ? String(n).padStart(width, '0') : String(n)}`
		if (drawingNumber !== (s.drawingNumber ?? '')) out.push({ id: s.id, drawingNumber })
	})
	return out
}

// ── Sheet packages (drawing sets) ──

/** Subscribe to a project's packages, sorted by sortOrder. Returns an unsub fn. */
export function subscribeSheetPackages(
	db: Firestore,
	pid: string,
	callback: (packages: SheetPackage[]) => void,
): () => void {
	return db.subscribeMany(packagesPath(pid), (docs) => {
		const pkgs = (docs as unknown as SheetPackage[])
			.slice()
			.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
		callback(pkgs.map(p => ({ ...p, sheetIds: p.sheetIds ?? [] })))
	})
}

/** Create an empty package; returns its id. */
export async function createSheetPackage(db: Firestore, pid: string, existing: SheetPackage[], uid: string): Promise<string> {
	const id = nanoid(8)
	const sortOrder = existing.length ? Math.max(...existing.map(p => p.sortOrder ?? 0)) + 1 : 0
	const pkg: SheetPackage = { id, projectId: pid, name: 'New package', sheetIds: [], sortOrder, updatedAt: Date.now(), updatedBy: uid }
	await db.save(packagesPath(pid), pkg)
	return id
}

/** Patch selected fields of a package (merge:true keeps the rest). */
export async function updateSheetPackage(db: Firestore, pid: string, id: string, patch: Partial<SheetPackage>): Promise<void> {
	await db.save(packagesPath(pid), { id, ...patch, updatedAt: Date.now() })
}

/** Delete a package permanently (does not affect the sheets it referenced). */
export async function deleteSheetPackage(db: Firestore, pid: string, id: string): Promise<void> {
	await db.delete(packagesPath(pid), id)
}
