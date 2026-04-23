import type { SnapshotAdapter, ViewPreset } from '$lib/types/versioning'
import type { Page, Viewport } from '$lib/types/pages'

/**
 * Snapshot adapter for drawing Pages.
 *
 * - `serialize` returns the page state as it is live — no `sourcePin` fields.
 *   Used by plain "save version" operations.
 * - `serializeForRevision` walks the viewports and injects `sourcePin` on any
 *   that are still live, using the caller-supplied pin map keyed by viewport id.
 *   Used by the publish flow (see `$lib/pages/publish.ts`).
 */
export const pagesAdapter: SnapshotAdapter<Page> = {
	toolType: 'page',

	serialize(state: Page): unknown {
		// Shape is already flat — just drop transient tracking fields.
		const { updatedAt: _u, updatedBy: _b, ...rest } = state
		return rest
	},

	validate(snapshot: unknown): boolean {
		if (!snapshot || typeof snapshot !== 'object') return false
		const s = snapshot as Record<string, unknown>
		return Array.isArray(s.viewports) && typeof s.paper === 'object'
	},

	defaultViewPresets(): ViewPreset[] {
		return [{ name: 'Page', layers: { default: true } }]
	},
}

/**
 * Produce a revision-ready snapshot. Each viewport id in `pins` gets its
 * `sourcePin` injected into the cloned viewport. Viewports absent from the map
 * (text, image, or sources without a resolvable drawing) are left untouched.
 */
export function serializeForRevision(state: Page, pins: Record<string, { drawingId: string; revisionCode: string }>): unknown {
	const viewports: Viewport[] = state.viewports.map(vp => {
		const pin = pins[vp.id]
		return pin ? { ...vp, sourcePin: pin } : vp
	})
	return { ...pagesAdapter.serialize(state) as Record<string, unknown>, viewports }
}
