// POSITION of a WALL / CONDUIT (a node graph) for Properties, like a box's X / Y / Z: X / Y = the run's plan bounds'
// low corner, Z = its LOWEST node (the underside of a trunk, the foot of a wall) — mm above FL±0, the same datum as a
// box's z. Setting one SHIFTS every node by the difference, so slopes and vertical drops keep their shape. A move in plan
// detaches nodes attached to a box / outlet (their `conn` would pull them back); a Z change keeps them attached
// (attachment is plan-only). Tested in graphPos.test.ts.
import type { GNode } from '../3dview/graph'

export type GraphPos = { x: number; y: number; z: number }

/** The run's position: its nodes' min x / y / z (0s when it has none). */
export function graphPos(nodes: readonly GNode[]): GraphPos {
	if (!nodes.length) return { x: 0, y: 0, z: 0 }
	return { x: Math.min(...nodes.map((n) => n.x)), y: Math.min(...nodes.map((n) => n.y)), z: Math.min(...nodes.map((n) => n.z ?? 0)) }
}

/** The nodes moved so the run's `axis` position becomes `v` (z never below 0, like a box). */
export function setGraphPos(nodes: readonly GNode[], axis: 'x' | 'y' | 'z', v: number): GNode[] {
	const cur = graphPos(nodes)[axis], to = axis === 'z' ? Math.max(0, v) : v, d = Math.round(to - cur)
	if (!d) return nodes.map((n) => ({ ...n }))
	return nodes.map((n) => {
		const m: GNode = { ...n, [axis]: (n[axis] ?? 0) + d }
		if (axis !== 'z') delete m.conn
		return m
	})
}

/** One node moved on `axis` to `v` (z ≥ 0); a plan move detaches it from a box / outlet. */
export function setNodePos(nodes: readonly GNode[], id: string, axis: 'x' | 'y' | 'z', v: number): GNode[] {
	return nodes.map((n) => {
		if (n.id !== id) return n
		const m: GNode = { ...n, [axis]: axis === 'z' ? Math.max(0, Math.round(v)) : Math.round(v) }
		if (axis !== 'z') delete m.conn
		return m
	})
}
