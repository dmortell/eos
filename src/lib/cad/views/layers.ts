// Layers over a finished display list (docs/plan/layers.md): one pass after the generator, so no generator knows about
// layers. Each prim goes on its source's layer; hidden layers drop out, a layer's colour (and lineweight / line type)
// applies where the item has none of its own, locked layers stay drawn (and snap) but can't be picked, and a plan paints in layer order.
import type { Id } from '../domain/types'
import type { ProjectIndex } from '../domain/project'
import { DASHES, type Dash, type Prim } from './display'
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
		const l = byId.get(id), color = p.color ?? l?.color
		draw.push({ ...p, layer: id, ...(color ? { color } : {}), ...byLayerLine(p, l) })
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

/** The layer's lineweight and line type (backlog "Layer line type and lineweight") on a line or circle that sets none
 *  of its own — not on text, pictures, fills behind notes, a run's band, or (the line type) an arrowhead / tick. */
function byLayerLine(p: Prim, l: LayerInfo | undefined): { weight?: number; dash?: Dash } {
	if (!l || (p.k !== 'line' && p.k !== 'circle') || p.cls === 'note-bg' || p.cls === 'shape-fill' || (p.k === 'line' && p.w)) return {}
	const dash = !p.dash && l.dash && (DASHES as string[]).includes(l.dash) && !/line-(head|tick)/.test(p.cls) ? (l.dash as Dash) : undefined
	return { ...(!p.weight && l.weightMm ? { weight: l.weightMm } : {}), ...(dash ? { dash } : {}) }
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
