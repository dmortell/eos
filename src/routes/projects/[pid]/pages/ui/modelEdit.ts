// Model store mutations extracted from ui/Viewport.svelte (review.md §R6; refactor-plan.md §6/§11 region 7).
// Every function here MUTATES `mdl` in place (walls/prisms/guides/sections are $state-proxied, like the
// grip-drag code) and brackets the edit with `edit.begin/mark/end` so it rides the model undo history —
// exactly what `on.beginedit?.()/on.modeledit?.(label)/on.endedit?.(ms)` did inline in Viewport. Behaviour
// is unchanged; only the seam moved, per §6's note that this is where R6's `editor` prop reads from.
import type { Pt } from './geometry'
import type { ViewCtx, MLayers } from './view'
import type { Model, Obj, Guide, Section, Clip } from '../3dview/types'
import { ELEV_BASIS, elevUInv, segDist } from './geometry'
import { graphNodeDraw, type GN } from './hit'

export type { GN }

/** The history bracket: today's `on.beginedit?.()` / `on.modeledit?.(label)` / `on.endedit?.(debounceMs)`,
 *  packaged as one object so a store-mutation function takes ONE extra argument instead of three optional
 *  callbacks. Viewport builds this once per render: `{ begin: () => on.beginedit?.(), mark: (l) =>
 *  on.modeledit?.(l), end: (ms) => on.endedit?.(ms) }`. */
export type EditScope = { begin(): void; mark(label?: string): void; end(debounceMs?: number): void }

/** Add a new model object (one undo step). Returns its id (for the caller's `setModelSel`), or undefined
 *  if the object has none — selection is a VIEW concern and stays with the caller. */
export function addModelObj(mdl: Model, edit: EditScope, o: Obj): string | undefined {
	edit.begin()          // captures the pre-add baseline
	mdl.objects.push(o)
	edit.mark(); edit.end()   // one undo step
	return o.id
}

/** Delete every model object AND guide whose id is in `ids` (one undo step, labelled 'Delete'). Guides
 *  share the model-selection namespace, so a Delete over a selected guide removes it too. The caller
 *  clears selection afterwards (`setModelSel([])`) — not this function's concern. */
export function deleteModelSel(mdl: Model, edit: EditScope, ids: string[]): void {
	if (!ids.length) return
	const rm = new Set(ids)
	edit.begin()
	mdl.objects = mdl.objects.filter((o) => !o.id || !rm.has(o.id))
	if (mdl.guides) mdl.guides = mdl.guides.filter((g) => !rm.has(g.id))
	edit.mark('Delete'); edit.end()
}

/** Delete a single wall/conduit NODE, resolving its incident segments by DEGREE (Dave's spec):
 *    1 segment  → delete that segment;
 *    2 segments → join them into one (drop the node, connect the two far ends);
 *    3+ segments → keep the FIRST TWO joined into one, delete the rest.
 *  Then prune any node left with no segments (the deleted one + orphaned far ends); remove the whole
 *  object if nothing remains. One undo step, labelled 'Delete node'. `uid('s')` mints the joined
 *  segment's id. A no-op (no edit bracket) if the object/node can't be found. */
export function deleteGraphNode(mdl: Model, edit: EditScope, sel: { obj: string; node: string }, uid: (prefix: string) => string): { removedObject: boolean } {
	const o = mdl.objects.find((x) => x.id === sel.obj)
	if (!o || (o.type !== 'wall' && o.type !== 'conduit')) return { removedObject: false }
	const segs = o.segments as { id: string; a: string; b: string }[]
	const inc = segs.filter((s) => s.a === sel.node || s.b === sel.node)
	const far = (s: { a: string; b: string }) => (s.a === sel.node ? s.b : s.a)
	const keep = segs.filter((s) => s.a !== sel.node && s.b !== sel.node)   // segments not touching the node
	if (inc.length >= 2) { const e1 = far(inc[0]), e2 = far(inc[1]); if (e1 !== e2) keep.push({ id: uid('s'), a: e1, b: e2 }) }   // join first two
	edit.begin()
	o.segments = keep
	const used = new Set<string>(); for (const s of keep) { used.add(s.a); used.add(s.b) }
	o.nodes = (o.nodes as GN[]).filter((n) => used.has(n.id))   // drop the deleted node + any orphaned far ends
	let removedObject = false
	if (!keep.length) { mdl.objects = mdl.objects.filter((x) => x.id !== o.id); removedObject = true }   // nothing left → remove object
	edit.mark('Delete node'); edit.end()
	return { removedObject }
}

/** Insert a vertex into the nearest wall/conduit segment within `thrMm` of `p` (dbl-click), splitting it
 *  in two. The new node inherits the segment's z (keeps the run's height, in plan) or the on-axis coord +
 *  z (in an elevation, keeping the segment's off-axis coord); the new segment inherits object defaults.
 *  Iterates objects TOPMOST FIRST (reverse store order), skipping a hidden layer (`ml.visible`). One undo
 *  step (unlabelled, matching the original). Returns the hit object's id, or null if nothing was near
 *  enough. `rnd` grid-rounds the new node's coords (0 = no rounding, i.e. SNAP off); `uid` mints the new
 *  node/segment ids. */
export function insertGraphNode(ctx: ViewCtx, mdl: Model, edit: EditScope, p: Pt, thrMm: number, ml: MLayers, rnd: (v: number) => number, uid: (prefix: string) => string): string | null {
	for (let i = mdl.objects.length - 1; i >= 0; i--) {
		const o = mdl.objects[i]
		if ((o.type !== 'wall' && o.type !== 'conduit') || !o.id || !ml.visible(o)) continue
		const half = ((o.type === 'wall' ? o.thickness : o.w) ?? 0) / 2
		const nm = new Map((o.nodes as GN[]).map((n) => [n.id, n]))
		for (const s of o.segments as { id: string; a: string; b: string }[]) {
			const a = nm.get(s.a), b = nm.get(s.b); if (!a || !b) continue
			if (segDist(p, graphNodeDraw(ctx, a), graphNodeDraw(ctx, b)) < thrMm + half) {
				edit.begin()
				const nid = uid('n')
				// Seed at a's coords, then set its in-view coords from p (no snap unless `rnd` rounds): the
				// plan takes x/y, an elevation takes the on-axis coord + z (keeping a's off-axis coord).
				const nn: GN = { id: nid, x: a.x, y: a.y, z: a.z }
				if (ctx.isElev) {
					const ax = ELEV_BASIS[ctx.elevDir].axis
					if (ax === 0) nn.x = rnd(elevUInv(ctx.elevDir, p[0], ctx.cx, ctx.cy)); else nn.y = rnd(elevUInv(ctx.elevDir, p[0], ctx.cx, ctx.cy))
					nn.z = Math.max(0, rnd(ctx.ground - p[1]))
				} else { nn.x = rnd(p[0]); nn.y = rnd(p[1]) }
				;(o.nodes as GN[]).push(nn)
				const bId = s.b; s.b = nid
				;(o.segments as { id: string; a: string; b: string }[]).push({ id: uid('s'), a: nid, b: bId })
				edit.mark(); edit.end()
				return o.id ?? null
			}
		}
	}
	return null
}

/** Sprout a NEW segment from an existing node (a junction/tee): add a coincident node + a segment joining
 *  them, and return the new node so the caller can drag it out. graph.ts handles the junction in its
 *  sweep, so this is purely the editing gesture — PURE (no `edit` bracket): the caller wraps the whole
 *  drag gesture (branch → drag → release) in one undo step itself. Return the STORE's node, not the
 *  pushed literal: `$state` deep-proxies array elements, so the drag closure must mutate the proxy (what
 *  the renderer reads) — mutating the raw literal is a no-op. */
export function branchNode(o: Extract<Obj, { type: 'wall' | 'conduit' }>, from: GN, uid: (prefix: string) => string): GN {
	const nid = uid('n')
	;(o.nodes as GN[]).push({ id: nid, x: from.x, y: from.y, z: from.z })
	;(o.segments as { id: string; a: string; b: string }[]).push({ id: uid('s'), a: from.id, b: nid })
	return (o.nodes as GN[])[(o.nodes as GN[]).length - 1]
}

/** Add a guide (one undo step, labelled 'Add guide'). B26: NOT `(mdl.guides ??= []).push(...)` — `??=`
 *  yields the raw `[]` you assigned, not the `$state` proxy now stored on the model, so the push would
 *  land behind the proxy (no signal, lost on the next push); create the array, then re-read it through
 *  `mdl.guides` before pushing. */
export function addGuide(mdl: Model, edit: EditScope, g: Guide): void {
	edit.begin()   // capture the pre-add baseline, then fold the add into one undo step (model history)
	if (!mdl.guides) mdl.guides = []
	mdl.guides.push(g)
	edit.mark('Add guide'); edit.end()
}

/** Add a section marker (one undo step, labelled 'Add section'). Same B26 push pattern as addGuide. The
 *  caller selects it afterwards (`sectionselect`) — a VIEW concern, not this function's. */
export function addSection(mdl: Model, edit: EditScope, sec: Section): void {
	edit.begin()
	if (!mdl.sections) mdl.sections = []
	mdl.sections.push(sec)
	edit.mark('Add section'); edit.end()
}

/** Change a section's cut direction (one undo step, labelled 'Set section direction'). A NO-OP — no edit
 *  bracket at all — when the section isn't found or the direction is already `dir` (matches the original
 *  `s.dir === dir` early return). Returns whether it actually changed anything. */
export function setSectionDir(mdl: Model, edit: EditScope, id: string, dir: Section['dir']): boolean {
	const s = mdl.sections?.find((x) => x.id === id)
	if (!s || s.dir === dir) return false
	edit.begin(); s.dir = dir; edit.mark('Set section direction'); edit.end()
	return true
}

/** Delete a section marker (one undo step, labelled 'Delete section'). A NO-OP — no edit bracket — when
 *  it isn't found. Returns whether it was actually removed; the caller clears `selSection` itself if it
 *  matched (a VIEW concern). */
export function deleteSection(mdl: Model, edit: EditScope, id: string): boolean {
	const list = mdl.sections
	if (!list?.some((s) => s.id === id)) return false
	edit.begin(); mdl.sections = list.filter((s) => s.id !== id); edit.mark('Delete section'); edit.end()
	return true
}

/** Reposition a section's clip box DURING a resize/move drag — no edit bracket: the drag gesture records
 *  one undo step on release, the same way a grip drag does. A no-op if the section isn't found. */
export function setSectionClip(mdl: Model, id: string, clip: Clip): void {
	const s = mdl.sections?.find((x) => x.id === id)
	if (s) s.clip = clip
}
