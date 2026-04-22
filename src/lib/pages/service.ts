/**
 * @file src/lib/pages/service.ts
 * @description CRUD + subscribe helpers for drawing Pages. Each Page has a
 * mirrored DrawingDoc (`toolType: 'page'`) so it appears in the drawing list.
 */

import type { Firestore } from '$lib'
import { DEFAULT_PRINT_SETTINGS } from '$lib/ui/print/types'
import type { Page } from '$lib/types/pages'
import type { DrawingDoc } from '$lib/types/versioning'
import { getToolMeta } from '$lib/versioning/adapters'
import { createDrawing } from '$lib/versioning/service'

const pagesPath = 'pages'
const drawingsPath = (pid: string) => `projects/${pid}/drawings`

/** Firestore doc id for a page — stable across subscribes. */
export function pageDocId(projectId: string, pageId: string): string {
	return `${projectId}_${pageId}`
}

function sourceDocIdForPage(projectId: string, pageId: string): string {
	return `${projectId}_${pageId}`
}

/**
 * Create a new page + its mirrored DrawingDoc. Returns the new pageId.
 */
export async function createPage(
	db: Firestore,
	input: { projectId: string; uid: string; title?: string; paper?: Page['paper'] },
): Promise<{ pageId: string; drawingId: string }> {
	const pageId = crypto.randomUUID().slice(0, 12)
	const title = input.title ?? 'Untitled Page'
	const now = Date.now()

	const page: Page = {
		id: pageDocId(input.projectId, pageId),
		projectId: input.projectId,
		title,
		order: 0,
		paper: input.paper ?? { ...DEFAULT_PRINT_SETTINGS },
		viewports: [],
		includeInPackages: true,
		updatedAt: now,
		updatedBy: input.uid,
	}

	// Write the page doc first so the mirrored DrawingDoc always has something to point at.
	await db.save(pagesPath, page)

	const meta = getToolMeta('page')
	const preset = meta?.presets[0] ?? { name: 'Page', layers: { default: true } }
	const { drawingId } = await createDrawing(db, {
		projectId: input.projectId,
		toolType: 'page',
		drawingNumber: '',
		title,
		sourceDocId: sourceDocIdForPage(input.projectId, pageId),
		viewPreset: preset,
		uid: input.uid,
	})

	// Mirror includeInPackages onto the DrawingDoc so the drawing list can read it.
	await db.save(drawingsPath(input.projectId), { id: drawingId, includeInPackages: true })

	return { pageId, drawingId }
}

export function subscribePage(
	db: Firestore,
	projectId: string,
	pageId: string,
	callback: (page: Page | null) => void,
): () => void {
	return db.subscribeOne(pagesPath, pageDocId(projectId, pageId), (data) => {
		callback((data && (data as any).projectId) ? (data as unknown as Page) : null)
	})
}

export function subscribePagesForProject(
	db: Firestore,
	projectId: string,
	callback: (pages: Page[]) => void,
): () => void {
	return db.subscribeWhere(pagesPath, 'projectId', projectId, (docs) => {
		const pages = (docs as unknown as Page[]).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
		callback(pages)
	})
}

/**
 * Save partial updates to a page. If `title` or `includeInPackages` change,
 * the mirrored DrawingDoc is updated too.
 */
export async function savePage(
	db: Firestore,
	projectId: string,
	pageId: string,
	patch: Partial<Omit<Page, 'id' | 'projectId'>>,
	opts?: { uid?: string; linkedDrawingId?: string },
): Promise<void> {
	const now = Date.now()
	await db.save(pagesPath, {
		id: pageDocId(projectId, pageId),
		...patch,
		updatedAt: now,
		...(opts?.uid ? { updatedBy: opts.uid } : {}),
	})

	if (!opts?.linkedDrawingId) return
	const drawingPatch: Partial<Pick<DrawingDoc, 'title' | 'includeInPackages'>> = {}
	if (patch.title != null) drawingPatch.title = patch.title
	if (patch.includeInPackages != null) drawingPatch.includeInPackages = patch.includeInPackages
	if (Object.keys(drawingPatch).length === 0) return
	await db.save(drawingsPath(projectId), { id: opts.linkedDrawingId, ...drawingPatch })
}

/**
 * Archive a page: mark its DrawingDoc as archived (so it disappears from the
 * active drawing list) and delete the page doc.
 */
export async function deletePage(
	db: Firestore,
	projectId: string,
	pageId: string,
	linkedDrawingId?: string,
): Promise<void> {
	if (linkedDrawingId) {
		await db.save(drawingsPath(projectId), { id: linkedDrawingId, status: 'archived' })
	}
	await db.delete(pagesPath, pageDocId(projectId, pageId))
}

/**
 * Toggle a page's `includeInPackages` flag. Kept as a thin wrapper so the
 * drawing list can call it without knowing the full savePage API.
 */
export async function setPageIncludeInPackages(
	db: Firestore,
	projectId: string,
	pageId: string,
	include: boolean,
	linkedDrawingId: string,
): Promise<void> {
	await savePage(db, projectId, pageId, { includeInPackages: include }, { linkedDrawingId })
}
