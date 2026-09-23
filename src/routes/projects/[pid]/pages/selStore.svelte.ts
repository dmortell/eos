// Per-VIEWPORT Selection store (R3 commit 2a, review.md §R3). A "viewport" here is a sheet FRAME id or a
// model-layout TAB id acting as its own viewport — the same id space `viewState.svelte.ts`'s `viewId` and
// +page.svelte's `activeVpOf`/`activeVps` already use — NOT the document/tab id: two frames on the same
// sheet select independently, and (per Dave's amendment) the SAME viewport shown in two split panes shares
// one selection, so the key is viewId alone, not pane+viewId. Replaces the old tab-shared `docSel` (entity
// ids) and the global `modelSel` store (3dview/models.svelte, shared across every viewport showing a
// model) for the kinds wired in this commit (entity, model-object, guide). Section/node/frame selection
// still live on their pre-R3 mechanisms (selSection/nodeSel/session.selFrame) — folding those into this
// store is R3 commit 2b.
import type { Selection } from './ui/selection'

class SelStore {
	#map = $state<Record<string, Selection>>({})
	/** This viewport's current Selection, or `[]` if it has none (or `viewId` is undefined — a tab/pane
	 *  with nothing open yet). */
	of(viewId: string | undefined): Selection {
		return (viewId ? this.#map[viewId] : undefined) ?? []
	}
	set(viewId: string | undefined, sel: Selection): void {
		if (!viewId) return
		this.#map = { ...this.#map, [viewId]: sel }
	}
	/** Drop every viewport's selection whose id is in `viewIds` — a closed tab or sheet frame (mirrors
	 *  `viewState.drop`). */
	drop(viewIds: string[]): void {
		if (!viewIds.length) return
		const next = { ...this.#map }
		for (const id of viewIds) delete next[id]
		this.#map = next
	}
	/** The whole live map, for a temporary save/restore (print: clear every selection so nothing
	 *  highlights in the printed output, then restore it afterwards). */
	snapshotAll(): Record<string, Selection> {
		return { ...this.#map }
	}
	replaceAll(map: Record<string, Selection>): void {
		this.#map = map
	}
}

export const selStore = new SelStore()
