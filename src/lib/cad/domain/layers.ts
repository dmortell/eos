// Layers (docs/plan/layers.md): ONE list — the system layers below (in code, in the plan's drawing order) plus the
// project's own `Layer` records. A record with a system layer's id restyles it (colour, order). Every item is on a
// layer: its own `layerId` if that layer exists, else the default for its kind — so existing data needs no migration.
// Who sees what is NOT stored here: the eye / lock are per user (the workspace), a viewport's freeze is on the sheet.
import type { Id } from './types'
import type { Entity, Layer, Sheet } from './drawing'

/** `color` = the layer's colour, applied to its items; `look` = a system layer's default: the colour its items
 *  already draw in (shown on the swatch, NOT applied — forcing it would flatten colours that mean something: an
 *  unrouted backbone's red, a rack's ports and U numbers). */
export interface LayerInfo { id: Id; name: string; order: number; color?: string; look?: string; system: boolean }

/** The system layers, bottom to top (the order the plan draws them; Dave: pairs together, Floorplans first). */
export const SYSTEM_LAYERS: LayerInfo[] = ([
	['sys:background', 'Floorplans', '#9ca3af'], ['sys:walls', 'Walls', '#475569'], ['sys:drawing', 'Drawing', '#0f172a'],
	['sys:racks', 'Racks', '#1e293b'], ['sys:cont-low', 'Trunks', '#0ea5e9'], ['sys:cont-high', 'Trunks high', '#f97316'],
	['sys:risers', 'Risers', '#be185d'], ['sys:backbone', 'Backbone', '#7c3aed'], ['sys:cords', 'Patch cords', '#3b82f6'], ['sys:port-labels', 'Port labels', '#0c4a6e'],
	['sys:outlets-low', 'Outlets', '#1d4ed8'], ['sys:outlets-high', 'Outlets high', '#1d4ed8'],
	['sys:notes', 'Notes', '#0f172a'], ['sys:sections', 'Sections', '#0f766e'],
] as const).map(([id, name, look], i) => ({ id, name, look, order: (i + 1) * 10, system: true }))

/** Colours for new project layers, in turn (distinct from the system defaults where possible). */
export const LAYER_PALETTE = ['#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#ca8a04', '#db2777', '#4f46e5', '#65a30d', '#0d9488']

/** The next palette colour no project layer uses yet (round again when all are taken). */
export function nextLayerColour(records: Layer[]): string {
	const used = new Set(records.filter((r) => !r.id.startsWith('sys:')).map((r) => r.color))
	const own = records.filter((r) => !r.id.startsWith('sys:')).length
	return LAYER_PALETTE.find((c) => !used.has(c)) ?? LAYER_PALETTE[own % LAYER_PALETTE.length]
}

/** The project's layers: the system ones (restyled by a record with their id) and its own, by order. */
export function layersOf(records: Layer[]): LayerInfo[] {
	const own = new Map(records.map((r) => [r.id, r]))
	const sys = SYSTEM_LAYERS.map((s) => { const r = own.get(s.id); return r ? { ...s, order: r.order, ...(r.color ? { color: r.color } : {}) } : s })
	const custom = records.filter((r) => !r.id.startsWith('sys:')).map((r): LayerInfo => ({ id: r.id, name: r.name, order: r.order, ...(r.color ? { color: r.color } : {}), system: false }))
	return [...sys, ...custom].sort((a, b) => a.order - b.order)
}

/** The layer an item is on when it names none. Undefined = on no layer (always shown: paper, title block …). */
export function defaultLayer(e: Entity): Id | undefined {
	switch (e.type) {
		case 'outlet': return e.tier === 'high' ? 'sys:outlets-high' : 'sys:outlets-low'
		case 'rack': case 'device': return 'sys:racks'
		case 'cord': return 'sys:cords'
		case 'link': return e.kind === 'horizontal' ? undefined : 'sys:backbone'
		case 'underlay': return 'sys:background'
		case 'section': return 'sys:sections'
		case 'shape': {
			const r = e.role
			if (r?.kind === 'wall') return 'sys:walls'
			if (r?.kind === 'containment') return r.tier === 'high' ? 'sys:cont-high' : 'sys:cont-low'
			const g = e.geom.kind
			return g === 'text' || g === 'leader' || g === 'cloud' || g === 'legend' ? 'sys:notes' : 'sys:drawing'
		}
		default: return undefined
	}
}

/** The layer an item is on: its own if that layer exists, else its kind's default. */
export function layerOf(e: Entity, known: Set<Id>): Id | undefined {
	const own = (e as { layerId?: Id }).layerId
	return own && known.has(own) ? own : defaultLayer(e)
}

/** The layer a drawn prim is on: its source's — except that a containment run's RISER parts sit on Risers. */
export function primLayer(cls: string, e: Entity | undefined, known: Set<Id>): Id | undefined {
	if (!e) return undefined
	if (e.type === 'shape' && e.role?.kind === 'containment' && !e.layerId && cls.startsWith('riser')) return 'sys:risers'
	// a device's port labels have their own layer (Dave 2026-10-07): hidden / frozen apart from the racks
	if (e.type === 'device' && cls.split(' ').includes('port-label')) return 'sys:port-labels'
	return layerOf(e, known)
}

/** Why a new item can't go on a layer (hidden / locked for this user), or null. */
export function layerBlock(id: Id | undefined, name: string, hidden: ReadonlySet<Id>, locked: ReadonlySet<Id>): string | null {
	if (!id) return null
	if (hidden.has(id)) return `The ${name} layer is hidden — show it to add to it`
	if (locked.has(id)) return `The ${name} layer is locked — unlock it to add to it`
	return null
}

/** The layer a drawing tool's new item lands on: lines on the current layer (else Drawing); walls, trunks, racks on
 *  their own system layer (Dave: the current layer doesn't take them). Undefined = not a drawing tool. */
export function toolLayer(toolId: string, current: Id | null, z: number): Id | undefined {
	switch (toolId) {
		case 'line': return current ?? 'sys:drawing'
		case 'wall': return 'sys:walls'
		case 'trunk': case 'conduit': return z > 0 ? 'sys:cont-high' : 'sys:cont-low'
		case 'rack': return 'sys:racks'
		default: return undefined
	}
}

/** A drawing tool refused because its layer is hidden / locked for this user (the item would vanish, or be stuck). */
export function toolBlock(toolId: string, prefs: { current: Id | null; hidden: ReadonlySet<Id>; locked: ReadonlySet<Id> }, z: number, layers: Map<Id, LayerInfo>): string | null {
	const id = toolLayer(toolId, prefs.current && layers.has(prefs.current) ? prefs.current : null, z)
	return id ? layerBlock(id, layers.get(id)?.name ?? id, prefs.hidden, prefs.locked) : null
}

/** A NEW layer starts hidden in the drawings that already exist (Dave 2026-10-05): its id added to every viewport's
 *  frozen list, so issued / finished sheets don't change when something is drawn on it. Viewports made later show it.
 *  The sheets that change. */
export function freezeInExisting(sheets: Sheet[], layerId: Id): Sheet[] {
	return sheets.filter((s) => s.viewports.length).map((s) => ({
		...s, viewports: s.viewports.map((v) => (v.frozen?.includes(layerId) ? v : { ...v, frozen: [...(v.frozen ?? []), layerId] })),
	}))
}
