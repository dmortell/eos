// The Viewport's EDITOR — every callback that MUTATES the document/model, split out of the old `VpOn`
// bundle (review.md §R6). `VpOn` (ui/vpTypes.ts) keeps only the 8 VIEW
// events (activate/deactivate/view/orbit/scale/status/coords/tool) — things that happen to the CAMERA/UI,
// not the document. `ents` groups the entity-array operations (was `on.add/update/delete/…`); `edit` is
// commit 1's EditScope (was `on.beginedit/modeledit/endedit`); `sections.dropDir` is the one section
// action that ISN'T a selection (drops an elevation as a new sheet viewport frame — B5 already moved the
// actual create/move/delete edits onto ui/modelEdit.ts, called through `edit`); `sel` (R3 commits 2a+2b,
// review.md §R3) is the ONE Selection model (ui/selection.ts) for this VIEWPORT, covering every kind —
// entity, model-object, guide, section marker, wall/conduit node. Replaces the old `ents.select` (was
// tab-shared docSel), the global `modelSel` store (3dview/models.svelte), `session.selSection`, and the
// local `nodeSel` — a section/node selection is just `editor.sel.only([{kind:'section'|'node', …}])` like
// every other kind, so `sections` no longer needs its own `select`.
import type { Ent, ElevDir } from './geometry'
import type { EditScope } from './modelEdit'
import type { Selection, SelItem } from './selection'

export type Editor = {
	ents: {
		add(e: Ent): void
		update(e: Ent): void
		delete(ids: string[]): void
		copy(ids: string[]): void
		cut(ids: string[]): void
		paste(): void
		group(ids: string[]): void
		ungroup(ids: string[]): void
		reorder(ids: string[], op: 'front' | 'back' | 'forward' | 'backward'): void
	}
	edit: EditScope
	sections: {
		dropDir(id: string, dir: ElevDir): void
	}
	sel: {
		get(): Selection
		only(items: SelItem[]): void
		toggle(items: SelItem[]): void
		clear(): void
		delete(): void
	}
}

const noop = () => {}

/** The default `editor` — every method a no-op, so the Viewport can call `editor.ents.add(e)` etc.
 *  directly, with no `?.`, even when no editor is wired up (e.g. a read-only / preview Viewport).
 *  `sel.get()` returns `[]` (an empty Selection), consistent with every other no-op read. */
export const noopEditor: Editor = {
	ents: { add: noop, update: noop, delete: noop, copy: noop, cut: noop, paste: noop, group: noop, ungroup: noop, reorder: noop },
	edit: { begin: noop, mark: noop, end: noop },
	sections: { dropDir: noop },
	sel: { get: () => [], only: noop, toggle: noop, clear: noop, delete: noop },
}
