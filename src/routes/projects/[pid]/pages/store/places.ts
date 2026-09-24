// Place-tree helpers (drawings-plan §2.1 / §4). Places are GENERIC nodes (`kind` is an icon hint only), kept
// as a flat list with parentId + order. Pure; unit-tested in places.test.ts.
import { buildProjectTree, type TreeInput } from '../projectTree'
import type { NavNode } from '../mock/data'
import type { Place } from './schema'

/** A node's children, in order. `parentId` null = the top level. */
export const childrenOf = (places: Place[], parentId: string | null): Place[] =>
	places.filter((p) => p.parentId === parentId).sort((a, b) => a.order - b.order)

/** A node's ancestors, root first (excludes the node). Stops on a broken or cyclic link. */
export function ancestorsOf(places: Place[], id: string): Place[] {
	const byId = new Map(places.map((p) => [p.id, p]))
	const out: Place[] = [], seen = new Set<string>([id])
	let cur = byId.get(id)?.parentId ?? null
	while (cur && !seen.has(cur)) { const p = byId.get(cur); if (!p) break; out.unshift(p); seen.add(cur); cur = p.parentId }
	return out
}

/** The SEED: the old tools' structure (project floors / areas, per-room racks rows, riser-derived buildings,
 *  exactly as the current navigator shows it) → a flat place list with fresh ids. Run ONCE per project; after
 *  that Pages owns the list (drawings-plan §2.1). `uid` mints the ids (injected so tests are deterministic). */
export function seedPlaces(input: TreeInput, uid: () => string): Place[] {
	const { tree } = buildProjectTree({ ...input, drawings: [] })   // places only — no drawing leaves / groups
	const out: Place[] = []
	const walk = (nodes: NavNode[], parentId: string | null) => {
		let order = 0
		for (const n of nodes) {
			const kind = n.folder
			if (!kind || kind === 'group' || n.drawing) continue   // drawing leaves (riser diagrams) aren't places
			const p: Place = { id: uid(), name: n.label, parentId, order: order++, kind }
			const legacy = legacyOf(n.id); if (legacy) p.legacy = legacy
			out.push(p)
			if (n.children?.length) walk(n.children, p.id)
		}
	}
	walk(tree, null)
	return out
}

/** The old-data link encoded in a navigator node id: `f:33`, `a:33:3303`, `r:33:A`, `row:33:A:<rowId>`. */
function legacyOf(navId: string): Place['legacy'] | undefined {
	const [k, f, x, y] = navId.split(':')
	const floor = Number(f)
	if (k === 'f') return { floor }
	if (k === 'a') return { floor, area: x }
	if (k === 'r') return { floor, room: x }
	if (k === 'row') return { floor, room: x, row: y }
	return undefined
}

// ── editing (drawings-plan §4). Every helper returns a NEW list with the siblings' `order` renumbered 0..n. ──

/** Every descendant id of a node (not including it). */
export function descendantIds(places: Place[], id: string): Set<string> {
	const out = new Set<string>(), stack = [id]
	while (stack.length) { const cur = stack.pop()!; for (const p of places) if (p.parentId === cur && !out.has(p.id)) { out.add(p.id); stack.push(p.id) } }
	return out
}

/** Renumber the children of `parentId` in the given id order (others keep their relative order after). */
function reorder(places: Place[], parentId: string | null, ids: string[]): Place[] {
	const pos = new Map(ids.map((id, i) => [id, i]))
	return places.map((p) => (p.parentId === parentId && pos.has(p.id) ? { ...p, order: pos.get(p.id)! } : p))
}

/** A new place (caller-minted `id`) as the LAST child of `parentId`. */
export function addPlace(places: Place[], a: { name: string; kind?: string; parentId: string | null; id: string }): Place[] {
	const order = childrenOf(places, a.parentId).length
	const p: Place = { id: a.id, name: a.name, parentId: a.parentId, order }
	if (a.kind) p.kind = a.kind
	return [...places, p]
}

/** Patch a place's name / kind (empty name ignored). */
export function updatePlace(places: Place[], id: string, patch: { name?: string; kind?: string }): Place[] {
	return places.map((p) => {
		if (p.id !== id) return p
		const next = { ...p }
		if (patch.name != null && patch.name.trim()) next.name = patch.name.trim()
		if (patch.kind != null) { const k = patch.kind.trim(); if (k) next.kind = k; else delete next.kind }
		return next
	})
}

/** Move `id` relative to `targetId`: 'into' = its last child; 'before' / 'after' = its sibling. null when the
 *  move is impossible (onto itself or into its own subtree). Any nesting is allowed otherwise (places are
 *  generic, drawings-plan §1). */
export function movePlace(places: Place[], id: string, targetId: string, zone: 'before' | 'into' | 'after'): Place[] | null {
	const me = places.find((p) => p.id === id), target = places.find((p) => p.id === targetId)
	if (!me || !target || id === targetId || descendantIds(places, id).has(targetId)) return null
	const parentId = zone === 'into' ? target.id : target.parentId
	let next = places.map((p) => (p.id === id ? { ...p, parentId } : p))
	const sibs = childrenOf(next, parentId).filter((p) => p.id !== id).map((p) => p.id)
	if (zone === 'into') sibs.push(id)
	else sibs.splice(sibs.indexOf(targetId) + (zone === 'after' ? 1 : 0), 0, id)
	next = reorder(next, parentId, sibs)
	if (me.parentId !== parentId) next = reorder(next, me.parentId, childrenOf(next, me.parentId).map((p) => p.id))   // close the gap it left
	return next
}

/** Remove a place that has no children. null when it still has some (the caller also checks it holds no
 *  sheets or model — drawings-plan §4). */
export function removePlace(places: Place[], id: string): Place[] | null {
	const me = places.find((p) => p.id === id)
	if (!me || places.some((p) => p.parentId === id)) return null
	const rest = places.filter((p) => p.id !== id)
	return reorder(rest, me.parentId, childrenOf(rest, me.parentId).map((p) => p.id))
}
