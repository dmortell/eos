// PageDoc (review.md §R2 commit 2): a drawing's DOCUMENT state — paper, scale, viewport frames — keyed
// by DRAWING id, replacing docFrames/docPaper/docScale in +page.svelte. Closing a tab (or reusing the
// preview slot) never touches this (B6); only Session/ViewState entries are dropped.
//
// `id` is the drawing id — the tab's stable `docId` (B18: the navigator node id, `floor:<name>`, or a
// fresh id for a New page; see `didOf` in +page.svelte), never its title. `revisions`/`dir` are declared for the shape §12/X4 wants in Firestore
// but are NOT wired up by this commit — revisions stay the existing global (undated) list for now;
// `dir` has no current call site. Sections/guides/entities/objects stay in the Model (B5); `hist` stays
// one global timeline (B4) — this module only owns paper/scale/frames.
import type { SheetFrame } from './types'
import type { PaperSize } from './constants'
import type { ElevDir } from './ui/geometry'

export type PageDoc = {
	id: string
	title: string
	kind: 'sheet' | 'view'
	/** margin = XP7 paper margin in mm (unset = DEFAULT_MARGIN_MM). */
	paper: { size: PaperSize; landscape: boolean; margin?: number }
	scale: string
	frames: SheetFrame[]
	revisions?: { name: string; note: string; t: number }[]
	modelId?: number
	dir?: ElevDir
}

const DEFAULT_PAPER: PageDoc['paper'] = { size: 'A3', landscape: true }
const DEFAULT_SCALE = '1:100'   // model space is real mm; 1:100 fits the ~28 m demo plan

function emptyDoc(id: string): PageDoc {
	return { id, title: id, kind: 'view', paper: { ...DEFAULT_PAPER }, scale: DEFAULT_SCALE, frames: [] }
}

class DocsStore {
	#docs = $state<Record<string, PageDoc>>({})

	/** Seed a drawing's non-default state (used once, at module init, for the mock's starter data —
	 *  matches the old `docScale = { '3303 Outlets': '1:25' }` seed). Safe to call before the doc exists. */
	seed(id: string, patch: Partial<Omit<PageDoc, 'id'>>) {
		this.#docs = { ...this.#docs, [id]: { ...emptyDoc(id), ...this.#docs[id], ...patch } }
	}

	paperOf(id?: string): PageDoc['paper'] { return (id ? this.#docs[id]?.paper : undefined) ?? DEFAULT_PAPER }
	setPaper(id: string | undefined, patch: Partial<PageDoc['paper']>) {
		if (!id) return
		const cur = this.#docs[id] ?? emptyDoc(id)
		this.#docs = { ...this.#docs, [id]: { ...cur, paper: { ...cur.paper, ...patch } } }
	}

	scaleOf(id?: string): string { return (id ? this.#docs[id]?.scale : undefined) ?? DEFAULT_SCALE }
	setScale(id: string | undefined, s: string) {
		if (!id) return
		const cur = this.#docs[id] ?? emptyDoc(id)
		this.#docs = { ...this.#docs, [id]: { ...cur, scale: s } }
	}

	framesOf(id: string): SheetFrame[] { return this.#docs[id]?.frames ?? [] }
	setFrames(id: string, frames: SheetFrame[]) {
		const cur = this.#docs[id] ?? emptyDoc(id)
		this.#docs = { ...this.#docs, [id]: { ...cur, frames } }
	}

	/** The frames field of every doc, snapshot-ready for the history system (matches the old
	 *  `docFrames` shape exactly — history snapshots ONLY frames, never paper/scale, unchanged from
	 *  before this commit: paper/scale edits are still not undoable). */
	allFrames(): Record<string, SheetFrame[]> {
		const out: Record<string, SheetFrame[]> = {}
		for (const id of Object.keys(this.#docs)) out[id] = this.#docs[id].frames
		return out
	}
	/** Restore every doc's frames from a history snapshot (undo/redo), leaving paper/scale untouched. A
	 *  FULL REPLACE, matching the old `docFrames = snapshot` assignment exactly: a doc that exists now
	 *  but had no entry in the snapshot (its sheet/frame didn't exist yet at that history point) gets its
	 *  frames wiped to `[]`, not left alone — this is a real, pre-existing undo behaviour (creating a new
	 *  viewport frame then undoing past its creation removes it), not something this refactor changes. */
	restoreFrames(snapshot: Record<string, SheetFrame[]>) {
		const next = { ...this.#docs }
		const ids = new Set([...Object.keys(next), ...Object.keys(snapshot)])
		for (const id of ids) next[id] = { ...(next[id] ?? emptyDoc(id)), frames: snapshot[id] ?? [] }
		this.#docs = next
	}
}

export const docs = new DocsStore()
