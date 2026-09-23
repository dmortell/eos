// The Viewport's EDITOR — every callback that MUTATES the document/model, split out of the old `VpOn`
// bundle (review.md §R6; refactor-plan.md §6). `VpOn` (still in Viewport.svelte) keeps only the 8 VIEW
// events (activate/deactivate/view/orbit/scale/status/coords/tool) — things that happen to the CAMERA/UI,
// not the document. `ents` groups the entity-array operations (was `on.add/update/delete/…`); `edit` is
// commit 1's EditScope (was `on.beginedit/modeledit/endedit`); `sections` groups the two section-marker
// VIEW-selection callbacks that used to sit oddly in VpOn (`sectionselect`/`sectiondropdir` are workspace
// selection state, not a document edit — B5 already moved the actual create/move/delete edits onto
// ui/modelEdit.ts, called through `edit`).
import type { Ent, ElevDir } from './geometry'
import type { EditScope } from './modelEdit'

export type Editor = {
	ents: {
		add(e: Ent): void
		update(e: Ent): void
		delete(ids: string[]): void
		select(ids: string[]): void
		copy(ids: string[]): void
		cut(ids: string[]): void
		paste(): void
		group(ids: string[]): void
		ungroup(ids: string[]): void
		reorder(ids: string[], op: 'front' | 'back' | 'forward' | 'backward'): void
	}
	edit: EditScope
	sections: {
		select(id: string | null): void
		dropDir(id: string, dir: ElevDir): void
	}
}

const noop = () => {}

/** The default `editor` — every method a no-op, so the Viewport can call `editor.ents.add(e)` etc.
 *  directly, with no `?.`, even when no editor is wired up (e.g. a read-only / preview Viewport). */
export const noopEditor: Editor = {
	ents: { add: noop, update: noop, delete: noop, select: noop, copy: noop, cut: noop, paste: noop, group: noop, ungroup: noop, reorder: noop },
	edit: { begin: noop, mark: noop, end: noop },
	sections: { select: noop, dropDir: noop },
}
