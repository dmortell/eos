// Shared node/segment graph for the swept primitives (wall, conduit). A run of
// the geometry sweep is a maximal chain through degree-2 nodes of equal profile;
// junctions (degree ≥3) and profile changes break runs (butt joints there). This
// unifies wall/conduit/(eventually outlets-trunk) — see merge-analysis.md §8.
export type GNode = { id: string; x: number; y: number; z: number }
export type GSeg = { id: string; a: string; b: string }

let counter = 0
/** Short unique id (avoids Math.random collisions by also counting). */
export function newId(prefix = 'n'): string {
	counter = (counter + 1) % 1e6
	return `${prefix}${counter.toString(36)}${Math.round(performance.now()).toString(36).slice(-3)}`
}

export type Adj = Map<string, { seg: string; other: string }[]>
export function adjacency(nodes: GNode[], segments: GSeg[]): Adj {
	const adj: Adj = new Map()
	for (const n of nodes) adj.set(n.id, [])
	for (const s of segments) { adj.get(s.a)?.push({ seg: s.id, other: s.b }); adj.get(s.b)?.push({ seg: s.id, other: s.a }) }
	return adj
}
export const degree = (adj: Adj, id: string) => adj.get(id)?.length ?? 0

export type Run = { nodeIds: string[]; segIds: string[]; closed: boolean }

// Decompose the graph into runs. `profileKey(segId)` (optional) breaks a run when
// the per-segment profile changes, so each run sweeps with one uniform profile.
export function runs(nodes: GNode[], segments: GSeg[], profileKey?: (segId: string) => string): Run[] {
	const adj = adjacency(nodes, segments)
	const used = new Set<string>()
	const out: Run[] = []
	const key = profileKey ?? (() => '')

	const walk = (start: string, startSeg: string): Run => {
		const nodeIds = [start], segIds: string[] = []
		let cur = start, seg = startSeg
		const runKey = key(startSeg)
		while (true) {
			const edge = adj.get(cur)?.find((e) => e.seg === seg)
			if (!edge || used.has(seg)) break
			segIds.push(seg); used.add(seg)
			const next = edge.other
			nodeIds.push(next)
			if (next === start) break // closed loop
			if (degree(adj, next) !== 2) break // junction / endpoint
			const nextEdge = adj.get(next)?.find((e) => e.seg !== seg && !used.has(e.seg) && key(e.seg) === runKey)
			if (!nextEdge) break
			cur = next; seg = nextEdge.seg
		}
		return { nodeIds, segIds, closed: nodeIds.length > 1 && nodeIds[0] === nodeIds[nodeIds.length - 1] }
	}

	// Start runs at endpoints / junctions first.
	for (const n of nodes) {
		if (degree(adj, n.id) === 2) continue
		for (const e of adj.get(n.id) ?? []) if (!used.has(e.seg)) out.push(walk(n.id, e.seg))
	}
	// Remaining segments form pure cycles (every node degree 2).
	for (const s of segments) if (!used.has(s.id)) out.push(walk(s.a, s.id))
	return out
}

export const nodeMap = (nodes: GNode[]) => new Map(nodes.map((n) => [n.id, n]))
