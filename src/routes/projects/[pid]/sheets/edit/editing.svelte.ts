import { untrack } from 'svelte'
import type { Firestore } from '$lib/db.svelte'
import type { SheetViewport } from '../types'
import type { ViewportEditor } from '../viewports.svelte'
import type { SurfaceEditor } from './surface.svelte'
import type { AnnotationEditor } from '../annotations/annotations.svelte'
import { useAnnotations } from './annotations.svelte'
import { History } from './history.svelte'
import { docSaver } from './persist'

/** A tool editor that can mirror a source doc and snapshot itself. */
type ToolEditor = SurfaceEditor & { seed: (d: any) => void; snapshot: () => any }

/**
 * Shared per-viewport editing plumbing, identical across outlets/racks/risers: an annotation peer,
 * an undo History (covering tool + annotation as one frame), seeding the editor from the source doc
 * while idle, and a debounced persist. Call once during a tool viewport's init; the viewport keeps
 * only its own data subscriptions, render, and tool-specific key handling.
 */
export function useViewportEditing(opts: {
	editor: ToolEditor
	collection: string                 // Firestore collection for the source doc
	docId: () => string | undefined    // current source doc id (reactive)
	doc: () => any | null              // live source doc (reactive)
	active: () => boolean              // is this viewport active (reactive)
	vp: () => SheetViewport
	vps: ViewportEditor
	db: Firestore
}): { annEditor: AnnotationEditor; history: History } {
	const { editor } = opts
	const history = new History()
	const annEditor = useAnnotations({ vp: opts.vp, active: opts.active, vps: opts.vps, toolEditor: editor, afterChange: () => history.touch() })

	// Mirror the doc into the editor while idle; once active, the editor owns the data (seed once
	// even if mounted active, for model mode). Rebaseline undo after each (re)seed — untracked, so
	// reading the editor snapshot doesn't re-fire this effect.
	let seeded = false
	const rebase = () => untrack(() => { history.register(editor, annEditor); history.reset() })
	$effect(() => {
		const d = opts.doc()
		if (!opts.active()) { editor.seed(d); seeded = !!d; rebase(); return }
		if (!seeded && d) { editor.seed(d); seeded = true; rebase() }
	})
	// Persist edits (debounced) to the source doc; tap the undo history on every change.
	$effect(() => {
		const id = opts.docId()
		if (!id) { editor.onChange = null; return }
		const saver = docSaver(opts.db, opts.collection, id)
		editor.onChange = () => { saver.save(editor.snapshot()); history.touch() }
		return () => { saver.flush(); editor.onChange = null }
	})

	return { annEditor, history }
}
