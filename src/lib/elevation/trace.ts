/**
 * Multi-hop circuit tracing (§13 P-4, §12-expanded).
 *
 * A circuit alternates between patch cords (device-port ↔ device-port, from
 * the per-room patching docs) and structured links (rear port → location, or
 * rear port ↔ rear port for ties, from the frames doc). Every port carries at
 * most one active cord and one link, so a circuit is a simple path:
 *   server1-p3 —cord→ panelA-p1 —tie→ panelB-p17 —cord→ switch02-p21
 * Traces are id-based (cords by device+port refs, links by their records) —
 * label matching plays no part.
 */
import { isLocationEnd, type StructuredLink, type LinkEnd } from './links'

export type TraceNode =
	| { type: 'port'; deviceId: string; portIndex: number }
	| { type: 'location'; locationId: string; port: number }
export interface TraceEdge {
	kind: 'cord' | 'run' | 'tie'
	id: string
}
export interface Circuit {
	nodes: TraceNode[]
	edges: TraceEdge[]
}

const key = (deviceId: string, portIndex: number) => `${deviceId}:${portIndex}`

interface CordLike {
	id: string
	status?: string
	fromPortRef: { deviceId?: string; portIndex: number }
	toPortRef: { deviceId?: string; portIndex: number }
}

/**
 * Walk the full circuit through a starting device port. Returns the ordered
 * path (nodes and the edges between them); a lone port yields just itself.
 */
export function walkCircuit(
	start: { deviceId: string; portIndex: number },
	connections: CordLike[],
	links: Record<string, StructuredLink> | undefined | null,
): Circuit {
	// port → cord / link adjacency
	const cordAt = new Map<string, { to: LinkEnd; id: string }>()
	for (const c of connections) {
		if (c.status === 'remove') continue
		const a = c.fromPortRef, b = c.toPortRef
		if (!a?.deviceId || !b?.deviceId) continue
		cordAt.set(key(a.deviceId, a.portIndex), { to: { deviceId: b.deviceId, portIndex: b.portIndex }, id: c.id })
		cordAt.set(key(b.deviceId, b.portIndex), { to: { deviceId: a.deviceId, portIndex: a.portIndex }, id: c.id })
	}
	const linkAt = new Map<string, { to: TraceNode; id: string; kind: 'run' | 'tie' }>()
	for (const l of Object.values(links ?? {})) {
		if (!l?.a) continue
		if (isLocationEnd(l.b)) {
			linkAt.set(key(l.a.deviceId, l.a.portIndex), { to: { type: 'location', locationId: l.b.locationId, port: l.b.port }, id: l.id, kind: 'run' })
		} else {
			const b = l.b as LinkEnd
			linkAt.set(key(l.a.deviceId, l.a.portIndex), { to: { type: 'port', deviceId: b.deviceId, portIndex: b.portIndex }, id: l.id, kind: 'tie' })
			linkAt.set(key(b.deviceId, b.portIndex), { to: { type: 'port', deviceId: l.a.deviceId, portIndex: l.a.portIndex }, id: l.id, kind: 'tie' })
		}
	}

	/** Walk one direction, taking `first` as the first edge type, alternating after. */
	function walk(firstVia: 'cord' | 'link'): { nodes: TraceNode[]; edges: TraceEdge[] } {
		const nodes: TraceNode[] = []
		const edges: TraceEdge[] = []
		const seenEdges = new Set<string>()
		let cur: TraceNode = { type: 'port', ...start }
		let via = firstVia
		for (let hop = 0; hop < 64; hop++) {
			if (cur.type !== 'port') break
			const k = key(cur.deviceId, cur.portIndex)
			if (via === 'cord') {
				const c = cordAt.get(k)
				if (!c || seenEdges.has(`c${c.id}`)) break
				seenEdges.add(`c${c.id}`)
				edges.push({ kind: 'cord', id: c.id })
				cur = { type: 'port', deviceId: c.to.deviceId, portIndex: c.to.portIndex }
				nodes.push(cur)
				via = 'link'
			} else {
				const l = linkAt.get(k)
				if (!l || seenEdges.has(`l${l.id}`)) break
				seenEdges.add(`l${l.id}`)
				edges.push({ kind: l.kind, id: l.id })
				cur = l.to
				nodes.push(cur)
				via = 'cord'
			}
		}
		return { nodes, edges }
	}

	const fwd = walk('cord')
	const back = walk('link')
	return {
		nodes: [...back.nodes.slice().reverse(), { type: 'port', ...start }, ...fwd.nodes],
		edges: [...back.edges.slice().reverse(), ...fwd.edges],
	}
}
