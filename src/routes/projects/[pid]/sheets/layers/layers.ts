import type { SheetViewport } from '../types'

export interface LayerDef { id: string; name: string; color: string }

/**
 * Project-wide layer list (fixed for v1 — shared across all sheets/drawings so layers aren't
 * recreated per floor; user-defined layers can come later). Each tool object maps to one of
 * these by kind (see `LAYER_OF`).
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

/** Effective hidden/locked layer-id lists for a viewport (defaults: visible + unlocked). */
export function effectiveLayers(vp: SheetViewport): { hidden: string[]; locked: string[] } {
	const ov = vp.layerOverrides ?? {}
	const hidden: string[] = [], locked: string[] = []
	for (const l of LAYERS) {
		if (ov[l.id]?.hidden) hidden.push(l.id)
		if (ov[l.id]?.locked) locked.push(l.id)
	}
	return { hidden, locked }
}
