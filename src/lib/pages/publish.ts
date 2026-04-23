/**
 * @file src/lib/pages/publish.ts
 * @description Page publish flow — walks the live viewports, auto-creates
 * source revisions where needed, writes `sourcePin` into the snapshot, then
 * creates a page Version + Revision.
 */

import type { Firestore } from '$lib'
import type { Page, ViewportSource } from '$lib/types/pages'
import type { DrawingDoc, ToolType } from '$lib/types/versioning'
import { createVersion, createRevision, nextRevisionCode } from '$lib/versioning/service'
import { serializeForRevision } from '$lib/versioning/adapters/pages'

type SourceLookup = { toolType: ToolType; sourceDocId: string; collection: string }

/**
 * Map a viewport source to the DrawingDoc lookup fields for its owning tool,
 * or null if the source kind doesn't participate in versioning (text, image,
 * floorplan — floorplans are file uploads, not versioned tool docs).
 */
function lookupFor(src: ViewportSource): SourceLookup | null {
	switch (src.kind) {
		case 'rack-elevation':
		case 'rack-plan':    return { toolType: 'racks',    sourceDocId: src.rackDocId,    collection: 'racks' }
		case 'frame-detail': return { toolType: 'frames',   sourceDocId: src.frameDocId,   collection: 'frames' }
		case 'fillrate':     return { toolType: 'fillrate', sourceDocId: src.projectId,    collection: 'fillrate' }
		case 'patching':     return { toolType: 'patching', sourceDocId: src.patchDocId,   collection: 'patching' }
		case 'outlets':      return { toolType: 'outlets',  sourceDocId: src.outletsDocId, collection: 'outlets' }
		case 'floorplan':
		case 'survey':
		case 'text':
		case 'image':
			// `floorplan` and `image` are asset references (no DrawingDoc/Revision
			// lifecycle of their own). `survey` lives outside the project tree
			// (top-level `surveys` collection) so it isn't covered by the
			// project-scoped versioning model for now. All stay live in the page
			// revision snapshot without a sourcePin.
			return null
	}
}

/**
 * Ensure the source drawing has at least one revision we can pin to.
 *
 * - If a matching active DrawingDoc exists with `latestRevisionCode`, return that.
 * - If no revision exists yet, snapshot the source doc's current state, create
 *   a Version from it, then create an "A" Revision (or next code if somehow missed).
 * - If no DrawingDoc exists for the source at all, return null — the viewport
 *   stays live in the published snapshot.
 */
async function ensureRevisionForSource(
	db: Firestore,
	projectId: string,
	uid: string,
	look: SourceLookup,
): Promise<{ drawingId: string; revisionCode: string } | null> {
	const drawings = await db.getMany(`projects/${projectId}/drawings`) as unknown as DrawingDoc[]
	const drawing = drawings.find(d =>
		d.toolType === look.toolType &&
		d.sourceDocId === look.sourceDocId &&
		d.status === 'active',
	)
	if (!drawing) return null

	if (drawing.latestRevisionCode) {
		return { drawingId: drawing.id, revisionCode: drawing.latestRevisionCode }
	}

	// Auto-create first revision from current source state.
	const snapshotDoc = await db.getOne(look.collection, look.sourceDocId)
	const snapshot = snapshotDoc ? stripId(snapshotDoc) : {}

	const { versionId } = await createVersion(db, {
		projectId, drawingId: drawing.id, snapshot, uid,
		notes: 'Auto-created by page publish',
	})
	const code = nextRevisionCode(undefined) // 'A'
	await createRevision(db, {
		projectId, drawingId: drawing.id, fromVersionId: versionId, code,
		title: 'Auto-pinned by page publish', uid,
	})
	return { drawingId: drawing.id, revisionCode: code }
}

function stripId<T extends Record<string, unknown>>(doc: T): Omit<T, 'id'> {
	// `id` is injected on read by the Firestore wrapper; it's not a real field.
	const { id: _id, ...rest } = doc as T & { id?: unknown }
	return rest as Omit<T, 'id'>
}

/**
 * Publish the page:
 * 1. Walk every viewport and auto-create source revisions where missing.
 * 2. Build a snapshot with per-viewport `sourcePin`s injected.
 * 3. Create a Version on the page's DrawingDoc with that snapshot.
 * 4. Create a Revision from the version.
 *
 * Returns the published revision's code.
 */
export async function publishPage(
	db: Firestore,
	input: {
		projectId: string
		uid: string
		page: Page
		pageDrawingId: string
		revisionTitle?: string
		revisionDescription?: string
		latestPageRevisionCode?: string
	},
): Promise<{ revisionCode: string; versionId: string }> {
	const pins: Record<string, { drawingId: string; revisionCode: string }> = {}
	for (const vp of input.page.viewports) {
		const look = lookupFor(vp.source)
		if (!look) continue
		try {
			const pin = await ensureRevisionForSource(db, input.projectId, input.uid, look)
			if (pin) pins[vp.id] = pin
		} catch (err) {
			// Source resolution failure shouldn't block publish — the viewport
			// simply stays live in the revision snapshot.
			console.warn(`publishPage: could not pin viewport ${vp.id}`, err)
		}
	}

	const snapshot = serializeForRevision(input.page, pins)

	const { versionId } = await createVersion(db, {
		projectId: input.projectId,
		drawingId: input.pageDrawingId,
		snapshot,
		uid: input.uid,
		notes: input.revisionTitle ?? 'Page publish',
	})
	const code = nextRevisionCode(input.latestPageRevisionCode)
	await createRevision(db, {
		projectId: input.projectId,
		drawingId: input.pageDrawingId,
		fromVersionId: versionId,
		code,
		title: input.revisionTitle,
		description: input.revisionDescription,
		uid: input.uid,
	})
	return { revisionCode: code, versionId }
}

/**
 * Publish every page in the project with `includeInPackages !== false` and add
 * the resulting revisions as items on a target package. Pages without a linked
 * DrawingDoc or already at their latest revision get a fresh publish anyway so
 * the package captures a consistent snapshot of the current state.
 *
 * Returns the list of `{ pageId, revisionCode, drawingId }` per published page.
 */
export async function publishAllPagesToPackage(
	db: Firestore,
	input: { projectId: string; uid: string; packageId: string; revisionTitle?: string },
): Promise<Array<{ pageId: string; revisionCode: string; drawingId: string }>> {
	// One-shot read of pages scoped to this project.
	const allPages = await db.getMany('pages') as unknown as Page[]
	const pages = allPages
		.filter(p => p.projectId === input.projectId && p.includeInPackages !== false)
		.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

	const allDrawings = await db.getMany(`projects/${input.projectId}/drawings`) as unknown as Array<{
		id: string; toolType: string; sourceDocId: string; status: string; latestRevisionCode?: string
	}>

	const results: Array<{ pageId: string; revisionCode: string; drawingId: string }> = []
	let sheetOrder = 0
	const packageItems: Array<{ drawingId: string; revisionId: string; sheetOrder: number; include: boolean }> = []

	for (const page of pages) {
		// `page.id` is `${projectId}_${pageId}` — derive the bare pageId for `publishPage`.
		const prefix = `${input.projectId}_`
		const pageId = page.id.startsWith(prefix) ? page.id.slice(prefix.length) : page.id
		const sourceDocId = page.id
		const drawing = allDrawings.find(d => d.toolType === 'page' && d.sourceDocId === sourceDocId && d.status === 'active')
		if (!drawing) continue

		const { revisionCode } = await publishPage(db, {
			projectId: input.projectId,
			uid: input.uid,
			page,
			pageDrawingId: drawing.id,
			revisionTitle: input.revisionTitle,
			latestPageRevisionCode: drawing.latestRevisionCode,
		})
		results.push({ pageId, revisionCode, drawingId: drawing.id })
		sheetOrder += 1
		packageItems.push({
			drawingId: drawing.id,
			revisionId: `r${revisionCode}`,
			sheetOrder,
			include: true,
		})
	}

	// Import lazily to avoid pulling the whole versioning service graph into callers.
	const { updatePackageItems } = await import('$lib/versioning/service')
	if (packageItems.length) {
		await updatePackageItems(db, input.projectId, input.packageId, packageItems)
	}

	return results
}
