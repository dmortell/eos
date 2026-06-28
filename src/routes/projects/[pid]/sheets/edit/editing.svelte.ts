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

	// Mirror the doc into the editor. While idle the editor follows the doc verbatim. While ACTIVE
	// it owns the data, but we still apply genuine REMOTE changes (edits from other tabs/viewports
	// or the standalone tool) so the view stays live — Firestore is local-first, so our own writes
	// echo straight back into the subscription; a JSON-echo guard (`lastSyncJson`, like SheetEditor)
	// distinguishes those self-echoes (identical snapshot → skip) from real remote frames (different
	// snapshot → apply). An in-flight drag is never clobbered: the active editor wins until mouse-up.
	// Rebaseline undo after each (re)seed — untracked, so reading the snapshot doesn't re-fire this.
	let seeded = false
	let lastSyncJson = ''
	const rebase = () => untrack(() => { history.register(editor, annEditor); history.reset() })
	// seed() WRITES editor state; snapshot()/rebase() READ it. Keep the reads untracked
	// so this never runs inside a tracking context that would depend on what seed just
	// wrote (that self-dependency is an effect_update_depth_exceeded loop).
	const applySeed = (d: any) => {
		editor.seed(d)
		untrack(() => { lastSyncJson = JSON.stringify(editor.snapshot()); rebase() })
	}
	// Pull just the persisted (snapshot) fields out of a raw doc so it compares apples-to-apples
	// against editor.snapshot(); array fields default to [] to match the editor's seed normalisation.
	const pickSnapshot = (d: any, ref: any) => {
		const out: any = {}
		for (const k of Object.keys(ref)) out[k] = d?.[k] ?? (Array.isArray(ref[k]) ? [] : ref[k] ?? null)
		return out
	}
	$effect(() => {
		const d = opts.doc()
		if (!opts.active()) { applySeed(d); seeded = !!d; return }
		if (!seeded) { if (d) { applySeed(d); seeded = true } return }
		// Active + already seeded: apply remote frames, skip self-echoes and mid-drag.
		if (!d) return
		if (editor.isDragging) return
		const incoming = JSON.stringify(pickSnapshot(d, untrack(() => editor.snapshot())))
		if (incoming === lastSyncJson) return
		untrack(() => applySeed(d))
	})
	// Persist edits (debounced) to the source doc; tap the undo history on every change.
	$effect(() => {
		const id = opts.docId()
		if (!id) { editor.onChange = null; return }
		const saver = docSaver(opts.db, opts.collection, id)
		editor.onChange = () => {
			const snap = editor.snapshot()
			lastSyncJson = JSON.stringify(snap) // mark our own write so the echo is skipped
			saver.save(snap)
			history.touch()
		}
		return () => { saver.flush(); editor.onChange = null }
	})

	return { annEditor, history }
}
