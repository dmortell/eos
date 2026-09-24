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
