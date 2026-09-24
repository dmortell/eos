// Ported verbatim from sheets/tools/model3d (the mature 3D engine) for the Pages 3D model — see model-plan.md.
import type { Model, Obj } from './types'
import type { Ent } from '../ui/geometry'
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
export const BACKGROUND_LAYER = { id: 'background', name: 'Background', color: '#9ca3af', visible: true, locked: false, group: 'Background' }

// R4 (review.md §R4): a legacy `'line'` entity → a 2-point `'polyline'` (the type is retired; a straight
// entity is now just a polyline with exactly 2 points). Keeps every other field (color/weight/layer/arrow/
// groupId/plane/space/rot/…) unchanged — only `type` and the `a`/`b` → `pts` shape change. Idempotent —
// anything that isn't a `'line'` (including an already-migrated polyline) passes through unchanged.
// XP33: the old `arrow: 'none' | 'start' | 'end' | 'both'` → per-end `headStart` / `headEnd` ('arrow').
function migrateEnt(e: any): Ent {
	if (e.type === 'line') {
		const { a, b, ...rest } = e
		e = { ...rest, type: 'polyline', pts: [a, b] }
	}
	if ('arrow' in e) {
		const { arrow, ...rest } = e
		e = { ...rest }
		if (arrow === 'start' || arrow === 'both') e.headStart = 'arrow'
		if (arrow === 'end' || arrow === 'both') e.headEnd = 'arrow'
	}
	return e as Ent
}

export function migrateModels(models: Model[]): Model[] {
	let changed = false
	const out = models.map((m) => {
		let mc = false
		const objects = m.objects.map((o) => {
			let n = migrateObj(o); if (n !== o) mc = true
			if (!n.id) { n = { ...n, id: newId('o') }; mc = true } // stable per-object id (id-based selection)
			return n
		})
		let layers = m.layers ?? []
		if (!layers.some((l) => l.id === 'background')) { layers = [...layers, { ...BACKGROUND_LAYER }]; mc = true }
		// `ents` → `shapes` (2026-09-24 rename; a stored model may still carry the old field)
		const legacy = (m as { ents?: Model['shapes'] }).ents
		let shapes = m.shapes ?? legacy
		if (legacy) mc = true
		if (shapes) {
			const next = shapes.map((e) => migrateEnt(e))
			if (next.some((e, i) => e !== shapes![i])) { shapes = next; mc = true }
		}
		// floorplans are image SHAPES now (2026-09-24): an emptied `underlays` field is dropped (a non-empty one is
		// converted by the page once its PDF placement is known, then emptied)
		if ('underlays' in m && !m.underlays?.length) mc = true
		if (mc) changed = true
		if (!mc) return m
		const { ents: _drop, underlays, ...rest } = m as Model & { ents?: unknown }
		return underlays?.length ? { ...rest, underlays, objects, layers, shapes } : { ...rest, objects, layers, shapes }
	})
	return changed ? out : models
}
