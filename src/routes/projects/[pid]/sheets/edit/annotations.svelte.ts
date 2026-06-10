import { AnnotationEditor } from '../annotations/annotations.svelte'
import type { SurfaceEditor } from './surface.svelte'
import type { ViewportEditor } from '../viewports.svelte'
import type { SheetViewport } from '../types'

/**
 * Per-viewport annotation editor wiring, shared by every tool viewport. Seeds from
 * `vp.annotations` while idle (seed-once when mounted active, for model mode), persists through
 * `vps`, and pairs with the tool editor so object/annotation selections stay mutually exclusive.
 * Call once during a tool viewport's component init.
 */
export function useAnnotations(opts: {
	vp: () => SheetViewport
	active: () => boolean
	vps: ViewportEditor
	toolEditor: SurfaceEditor
	/** Called after each annotation change persists — e.g. to notify an undo History. */
	afterChange?: () => void
}): AnnotationEditor {
	const ed = new AnnotationEditor()
	ed.peer = opts.toolEditor
	opts.toolEditor.peer = ed
	let seeded = false
	$effect(() => {
		const a = opts.vp().annotations
		if (!opts.active()) { ed.seed(a); seeded = true; return }
		if (!seeded) { ed.seed(a); seeded = true }
	})
	$effect(() => {
		ed.onChange = () => { opts.vps.setAnnotations(opts.vp().id, ed.snapshot()); opts.afterChange?.() }
		return () => { ed.onChange = null }
	})
	return ed
}
