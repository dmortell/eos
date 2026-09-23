// ONE selection model (review.md §R3; the editor seam). Replaces the five separate
// selection states spread over Viewport.svelte/+page.svelte (`docSel[tab]` entities, the global 3dview
// `modelSel` objects+guides, `selSection`, `selFrame`, `nodeSel`) with one array of typed items, plus the
// EXCLUSIVITY rules as pure, independently-testable functions. The wiring (where a Selection lives per
// viewport, how a Pick maps onto it, how `delete()` dispatches per kind) is a separate commit — this
// module has no dependency on Viewport, the model store, or the session; it only knows the SHAPE and the
// SELECT/TOGGLE/CLEAR rules.
//
// Kinds: 'ent' (a 2D annotation entity) is the only MULTI, Shift/Ctrl-additive kind — matches today's
// entity marquee/Shift-click. Every other kind ('obj' a 3D model object, 'guide', 'section', 'node' a
// wall/conduit vertex — `id` is its PARENT object's id, `sub` the node's own id — and 'frame' a sheet
// viewport frame) is SINGLE-select only: today none of them has an additive gesture, and picking one
// always clears the others (a model object pick, a guide pick, a section-border pick and a frame-border
// pick are already mutually exclusive in the current code; 'node' joins that same family here — a node is
// only ever pickable through its already-selected parent object, so selecting a node REPLACES a plain
// 'obj' selection of the same object with the more specific 'node' one, rather than the two coexisting).
export type SelKind = 'ent' | 'obj' | 'guide' | 'section' | 'node' | 'frame'
export type SelItem = { kind: SelKind; id: string; sub?: string }
export type Selection = SelItem[]

/** The one kind that's multi-select + Shift/Ctrl-additive. Every other kind replaces on toggle. */
const MULTI: SelKind = 'ent'

/** A plain click / marquee / programmatic select: REPLACES the whole selection with exactly `items`.
 *  Mixing kinds in one call isn't meaningful (today's UI never does it) and isn't validated here — callers
 *  pass a homogeneous array (or `[]` to clear, same as `selClear()`). */
export function selOnly(items: SelItem[]): Selection {
	return items
}

/** Shift/Ctrl-click (or a Shift-drag over a group): toggle `items` within the CURRENT selection.
 *  ADDITIVE only for the 'ent' kind (today's only multi-select kind) — toggling a non-'ent' item (or an
 *  empty `items` array reached via this path) REPLACES the selection with just `items`, since none of
 *  those kinds has a real "add to selection" gesture today; this only exists so a caller doesn't need to
 *  know which kind is additive before calling. An empty `items` with the CURRENT selection already 'ent'
 *  is a no-op (matches onClick's "toggle only when something is under the cursor" — nothing to toggle). */
export function selToggle(current: Selection, items: SelItem[]): Selection {
	if (!items.length) return current
	if (items[0].kind !== MULTI) return items
	const toggleIds = new Set(items.map((i) => i.id))
	const curEnts = current.filter((s) => s.kind === MULTI)
	const curIds = new Set(curEnts.map((s) => s.id))
	const allAlreadyIn = items.every((i) => curIds.has(i.id))
	if (allAlreadyIn) return current.filter((s) => !(s.kind === MULTI && toggleIds.has(s.id)))
	const merged = new Map(curEnts.map((s) => [s.id, s] as const))
	for (const i of items) merged.set(i.id, i)
	return [...merged.values()]
}

/** Esc / click on empty space: clears everything, regardless of kind. */
export function selClear(): Selection {
	return []
}

/** Every id currently selected of one kind (0 for none, 1 for every non-'ent' kind today, 0+ for 'ent'). */
export const idsOfKind = (sel: Selection, kind: SelKind): string[] => sel.filter((s) => s.kind === kind).map((s) => s.id)

/** The single selected item of a non-multi kind, or null if none (or more than one — shouldn't happen for
 *  a single-select kind, but callers that need "exactly one" should use this rather than indexing [0]). */
export function singleOfKind(sel: Selection, kind: SelKind): SelItem | null {
	const items = sel.filter((s) => s.kind === kind)
	return items.length === 1 ? items[0] : null
}

/** Group a selection by kind — the shape `delete()`'s per-kind dispatch (wired in a later commit) reads:
 *  ent → editor.ents.delete (one call, every ent id); obj/guide → modelEdit.deleteModelSel (one call,
 *  every obj+guide id together — they already share one store mutation today); node → deleteGraphNode
 *  (today only ever one node at a time); section → deleteSection (one call per section id, though only
 *  ever one is selected); frame → the page's own frame delete (one call per frame id, only ever one). */
export function groupByKind(sel: Selection): Partial<Record<SelKind, SelItem[]>> {
	const out: Partial<Record<SelKind, SelItem[]>> = {}
	for (const s of sel) (out[s.kind] ??= []).push(s)
	return out
}
