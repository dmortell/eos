// Shared, reactive LAYER store for the Pages tool — the single source of truth the LayersPanel,
// PropertiesPanel and Viewport all read. Module-level $state is a shared singleton, so a toggle in
// the panel re-renders the canvas. (Mock: not persisted yet — see §12.)

export type PLayer = {
	id: string
	name: string
	group: string
	color: string
	swatch: 'color' | 'line'
	dash?: 'solid' | 'dashed' | 'dotted'
	weight?: number
	visible: boolean
	locked: boolean
}

export const layers = $state<PLayer[]>([
	{ id: 'anno', name: 'Annotations', group: 'General', color: '#dc2626', swatch: 'color', visible: true, locked: false },
	{ id: 'dims', name: 'Dimensions', group: 'General', color: '#0e7490', swatch: 'color', visible: true, locked: false },
	{ id: 'data', name: 'Data Outlets', group: 'Outlets', color: '#2563eb', swatch: 'color', visible: true, locked: false },
	{ id: 'power', name: 'Power Outlets', group: 'Outlets', color: '#16a34a', swatch: 'color', visible: true, locked: false },
	{ id: 'wireless', name: 'Wireless', group: 'Outlets', color: '#9333ea', swatch: 'color', visible: true, locked: false },
	{ id: 'copper', name: 'Copper Trunks', group: 'Trunks', color: '#2563eb', swatch: 'line', dash: 'dashed', weight: 1.5, visible: true, locked: false },
	{ id: 'fiber', name: 'Fiber Trunks', group: 'Trunks', color: '#0e7490', swatch: 'line', dash: 'solid', weight: 2, visible: true, locked: false },
	// Kestrel-style architectural (subdued) — off by default
	{ id: 'a-wall', name: 'A-WALL', group: 'Architectural', color: '#8a7f72', swatch: 'line', dash: 'solid', weight: 2.5, visible: false, locked: false },
	{ id: 'a-open', name: 'A-OPENING', group: 'Architectural', color: '#7f9bb0', swatch: 'line', dash: 'solid', weight: 1.2, visible: false, locked: false },
	{ id: 'a-door', name: 'A-DOOR', group: 'Architectural', color: '#a99a80', swatch: 'line', dash: 'solid', weight: 1.5, visible: false, locked: false },
	{ id: 'a-glaz', name: 'A-GLAZ', group: 'Architectural', color: '#89a0ab', swatch: 'line', dash: 'solid', weight: 1, visible: false, locked: false },
	{ id: 'a-flor', name: 'A-FLOR', group: 'Architectural', color: '#b0a596', swatch: 'color', visible: false, locked: false },
	{ id: 'a-furn', name: 'A-FURN', group: 'Architectural', color: '#94a58c', swatch: 'color', visible: false, locked: false },
	{ id: 'a-clng', name: 'A-CLNG', group: 'Architectural', color: '#a3919c', swatch: 'line', dash: 'dashed', weight: 1, visible: false, locked: false },
])

// The active layer new objects are drawn on.
export const layerUI = $state<{ active: string }>({ active: 'anno' })

export const layerById = (id?: string): PLayer | undefined => (id ? layers.find((l) => l.id === id) : undefined)
// An object with no layer (or an unknown one) is always shown/editable in the tool's default ink.
export const isLayerHidden = (id?: string): boolean => { const l = layerById(id); return !!l && !l.visible }
export const isLayerLocked = (id?: string): boolean => { const l = layerById(id); return !!l && l.locked }
export const layerColor = (id?: string): string | undefined => layerById(id)?.color
// Distinct group names in declared order.
export const layerGroups = (): string[] => { const g: string[] = []; for (const l of layers) if (!g.includes(l.group)) g.push(l.group); return g }

let seq = 0
export function addLayer(group = 'General'): PLayer {
	const l: PLayer = { id: 'ly' + Date.now().toString(36) + seq++, name: 'New Layer', group, color: '#64748b', swatch: 'color', visible: true, locked: false }
	layers.push(l); layerUI.active = l.id
	return l
}
export function removeLayer(id: string) { const i = layers.findIndex((l) => l.id === id); if (i >= 0) layers.splice(i, 1); if (layerUI.active === id) layerUI.active = layers[0]?.id ?? '' }
