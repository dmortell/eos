// Layers over a finished display list (docs/plan/layers.md): one pass after the generator, so no generator knows about
// layers. Each prim goes on its source's layer; hidden layers drop out, a layer's colour applies where the item has no
// colour of its own, locked layers stay drawn (and snap) but can't be picked, and a plan paints in layer order.
import type { Id } from '../domain/types'
import type { ProjectIndex } from '../domain/project'
import type { Prim } from './display'
import { layersOf, primLayer, type LayerInfo } from '../domain/layers'

export interface LayerFilter {
	/** Not drawn (the user's eye, or a viewport's freeze). */
	hidden?: ReadonlySet<Id>
	/** Drawn but not pickable. */
	locked?: ReadonlySet<Id>
	/** Paint in layer order (plans; elevations and sections keep their depth order). */
	sort?: boolean
}

/** The project's layers, by id. */
export function layerMap(ix: ProjectIndex): Map<Id, LayerInfo> {
	return new Map(layersOf(ix.layers).map((l) => [l.id, l]))
}

/** `draw` = what to draw (and snap to); `pick` = the same with locked layers' sources removed. */
export function applyLayers(prims: Prim[], ix: ProjectIndex, f: LayerFilter = {}): { draw: Prim[]; pick: Prim[] } {
	const byId = layerMap(ix), known = new Set(byId.keys())
	const draw: Prim[] = []
	for (const p of prims) {
		const id = primLayer('cls' in p ? p.cls : '', ix.get(p.src), known)
		if (!id) { draw.push(p); continue }
		if (f.hidden?.has(id)) continue
		const color = p.color ?? byId.get(id)?.color
		draw.push(color ? { ...p, layer: id, color } : { ...p, layer: id })
	}
	if (f.sort) {
		// a prim on no layer (a datum, a label with no source) stays with the layer drawn just before it
		let o = -Infinity
		const keyed = draw.map((p, i) => { if (p.layer) o = byId.get(p.layer)?.order ?? o; return { p, o, i } })
		keyed.sort((a, b) => a.o - b.o || a.i - b.i)
		draw.splice(0, draw.length, ...keyed.map((x) => x.p))
	}
	const locked = f.locked
	const pick = locked?.size ? draw.map((p) => (p.layer && locked.has(p.layer) ? { ...p, src: undefined } : p)) : draw
	return { draw, pick }
}

/** How many items are on each layer (the panel's counts; "delete only when empty"). */
export function layerCounts(ix: ProjectIndex): Map<Id, number> {
	const known = new Set(layerMap(ix).keys()), n = new Map<Id, number>()
	for (const e of ix.byId.values()) {
		const id = primLayer('', e, known)
		if (id) n.set(id, (n.get(id) ?? 0) + 1)
	}
	return n
}
