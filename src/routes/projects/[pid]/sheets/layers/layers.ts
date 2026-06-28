import type { SheetViewport } from '../types'

export interface LayerDef {
	id: string
	name: string
	color: string
	/** For a custom layer: the default layer it's filed under (its "category"). Undefined for defaults. */
	base?: string
	/** True for user-created layers (defaults are fixed). */
	custom?: boolean
}

/**
 * Project-wide default layers (fixed — shared across all sheets/drawings so layers aren't recreated
 * per floor). Each tool object maps to one of these by kind. User-defined layers are appended at
 * runtime (see ViewportEditor.customLayers) and are always filed under one of these as their `base`.
 */
export const LAYERS: LayerDef[] = [
	{ id: 'outlets', name: 'Outlets', color: '#3b82f6' },
	{ id: 'trunks', name: 'Trunks', color: '#0369a1' },
	{ id: 'racks', name: 'Racks', color: '#10b981' },
	{ id: 'devices', name: 'Devices', color: '#22c55e' },
	{ id: 'rooms', name: 'Rooms', color: '#285aa0' },
	{ id: 'ladders', name: 'Risers / ladders', color: '#64468c' },
	{ id: 'cables', name: 'Cables', color: '#f59e0b' },
	{ id: 'annotations', name: 'Annotations', color: '#ef4444' },
]

/** Colour palette cycled through when creating custom layers. */
export const CUSTOM_LAYER_COLORS = ['#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#06b6d4', '#a855f7', '#f43f5e']

/** A layer's category = its `base` (custom) or its own id (default). Unknown ids fall back to 'annotations'. */
export function layerCategory(id: string, layers: LayerDef[] = LAYERS): string {
	const l = layers.find(x => x.id === id)
	if (!l) return 'annotations'
	return l.base ?? l.id
}

/**
 * Which layer a *new annotation* should land on, given the active layer. Annotations only belong in
 * the 'annotations' category, so an active layer from another category falls back to 'annotations'
 * (the caller can warn the user — see useAnnotations).
 */
export function annTargetLayer(activeId: string, layers: LayerDef[] = LAYERS): string {
	return layerCategory(activeId, layers) === 'annotations' ? activeId : 'annotations'
}

/** Resolve the layer an annotation renders on: its own layerId if it still exists, else 'annotations'. */
export function annLayerOf(layerId: string | undefined, layers: LayerDef[] = LAYERS): string {
	return layerId && layers.some(l => l.id === layerId) ? layerId : 'annotations'
}

/** Effective layer id for a tool object: its explicit `layerId` if that layer still
 *  exists, else the object kind's default layer (e.g. 'outlets', 'rooms'). */
export function objLayerOf(layerId: string | undefined, kindDefault: string, layers: LayerDef[] = LAYERS): string {
	return layerId && layers.some(l => l.id === layerId) ? layerId : kindDefault
}

/** Colour to render a tool object in when it sits on a CUSTOM layer, so the grouping
 *  is visible; null → keep the object's own/semantic colour (default layers don't override). */
export function objLayerColor(effLayerId: string, layers: LayerDef[] = LAYERS): string | null {
	const l = layers.find(x => x.id === effLayerId)
	return l?.custom ? l.color : null
}

/** Why a layer can't receive new objects, as a user-facing message — or null if it can. */
export function layerBlockReason(id: string, hidden: string[], locked: string[], layers: LayerDef[] = LAYERS): string | null {
	const h = hidden.includes(id), l = locked.includes(id)
	if (!h && !l) return null
	const name = layers.find(x => x.id === id)?.name ?? id
	return `${name} layer is ${h ? 'hidden' : 'locked'} — can't add to it`
}

/** Effective hidden/locked layer-id lists for a viewport (defaults: visible + unlocked). */
export function effectiveLayers(vp: SheetViewport, layers: LayerDef[] = LAYERS): { hidden: string[]; locked: string[] } {
	const ov = vp.layerOverrides ?? {}
	const hidden: string[] = [], locked: string[] = []
	for (const l of layers) {
		if (ov[l.id]?.hidden) hidden.push(l.id)
		if (ov[l.id]?.locked) locked.push(l.id)
	}
	return { hidden, locked }
}
