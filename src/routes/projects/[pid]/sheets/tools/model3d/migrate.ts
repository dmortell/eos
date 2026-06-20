import type { Model, Obj } from './types'
import { newId, type GNode, type GSeg } from './graph'

// Build a node/segment graph from an ordered polyline (the legacy wall/conduit
// representation). A trailing point equal to the first becomes a closing segment
// (a cycle) rather than a duplicate node.
export function polyToGraph(pts: { x: number; y: number; z: number }[]): { nodes: GNode[]; segments: GSeg[] } {
	const eq = (a: typeof pts[0], b: typeof pts[0]) => a.x === b.x && a.y === b.y && a.z === b.z
	const closed = pts.length > 2 && eq(pts[0], pts[pts.length - 1])
	const uniq = closed ? pts.slice(0, -1) : pts
	const nodes: GNode[] = uniq.map((p) => ({ id: newId('n'), x: p.x, y: p.y, z: p.z }))
	const segments: GSeg[] = []
	for (let i = 0; i < nodes.length - 1; i++) segments.push({ id: newId('s'), a: nodes[i].id, b: nodes[i + 1].id })
	if (closed && nodes.length > 1) segments.push({ id: newId('s'), a: nodes[nodes.length - 1].id, b: nodes[0].id })
	return { nodes, segments }
}

// Convert any legacy walls/conduits (with `pts`/`path`) in a model to the graph
// model. Idempotent — objects already in graph form are returned unchanged.
function migrateObj(o: any): Obj {
	if (o.type === 'wall' && Array.isArray(o.pts)) {
		const { nodes, segments } = polyToGraph(o.pts.map((p: any) => ({ x: p.x, y: p.y, z: o.z ?? 0 })))
		return { type: 'wall', h: o.h, thickness: o.thickness, layer: o.layer, nodes, segments }
	}
	if (o.type === 'conduit' && Array.isArray(o.path)) {
		const { nodes, segments } = polyToGraph(o.path)
		return { type: 'conduit', w: o.w, h: o.h, edges: o.edges, layer: o.layer, nodes, segments }
	}
	return o as Obj
}

// The reserved layer that PDF/image underlays sit on, so they can be hidden /
// locked per viewport from the Layers window like any other layer.
export const BACKGROUND_LAYER = { id: 'background', name: 'Background', color: '#9ca3af', visible: true, locked: false }

export function migrateModels(models: Model[]): Model[] {
	let changed = false
	const out = models.map((m) => {
		let mc = false
		const objects = m.objects.map((o) => { const n = migrateObj(o); if (n !== o) mc = true; return n })
		let layers = m.layers ?? []
		if (!layers.some((l) => l.id === 'background')) { layers = [...layers, { ...BACKGROUND_LAYER }]; mc = true }
		if (mc) changed = true
		return mc ? { ...m, objects, layers } : m
	})
	return changed ? out : models
}
