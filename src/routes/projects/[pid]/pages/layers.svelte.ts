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

// NOTE: array ORDER = draw order (earlier = painted first = underneath; later = on top). The Background
// group sits FIRST so imported PDF/image backgrounds render behind everything; drag layers in the panel
// to change z-order. New layers append (on top).
export const layers = $state<PLayer[]>([
	{ id: 'bg-1', name: 'Background 1', group: 'Background', color: '#64748b', swatch: 'color', visible: true, locked: false },
	{ id: 'bg-2', name: 'Background 2', group: 'Background', color: '#94a3b8', swatch: 'color', visible: true, locked: false },
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

// ── View Presets: a named set of visible layer ids (a saved layer state). Applying one shows exactly
// its layers and hides the rest. ──
export type Preset = { id: string; name: string; visible: string[] }
export const presets = $state<Preset[]>([
	{ id: 'p-hi', name: 'High Level Outlets', visible: ['anno', 'dims', 'data', 'power', 'wireless'] },
	{ id: 'p-lo', name: 'Low Level Outlets', visible: ['anno', 'dims', 'data', 'power'] },
	{ id: 'p-trunk', name: 'Trunk Routes', visible: ['anno', 'dims', 'copper', 'fiber'] },
	{ id: 'p-desk', name: 'Desk Numbering', visible: ['anno', 'dims'] },
	{ id: 'p-all', name: 'All Layers', visible: layers.map((l) => l.id) },
])
export const presetUI = $state<{ active: string }>({ active: 'p-hi' })

// Background layers are toggled independently of view presets (they're imported backdrops), so they're
// excluded from preset visibility sets + matching.
export const currentVisibleIds = (): string[] => layers.filter((l) => l.visible && l.group !== 'Background').map((l) => l.id)
// Does the current layer visibility exactly match a preset? (used to flag "modified")
export function presetMatches(id: string): boolean {
	const p = presets.find((x) => x.id === id); if (!p) return false
	const cur = new Set(currentVisibleIds())
	return p.visible.length === cur.size && p.visible.every((v) => cur.has(v))
}
export function applyPreset(id: string) {
	const p = presets.find((x) => x.id === id); if (!p) return
	const vis = new Set(p.visible)
	for (const l of layers) if (l.group !== 'Background') l.visible = vis.has(l.id)   // presets don't touch backgrounds
	presetUI.active = id
}
let pseq = 0
export function savePreset(name = 'New view'): Preset { const p: Preset = { id: 'pv' + Date.now().toString(36) + pseq++, name, visible: currentVisibleIds() }; presets.push(p); presetUI.active = p.id; return p }
export function updatePreset(id: string) { const p = presets.find((x) => x.id === id); if (p) p.visible = currentVisibleIds() }
export function renamePreset(id: string, name: string) { const p = presets.find((x) => x.id === id); if (p) p.name = name }
export function deletePreset(id: string) { const i = presets.findIndex((x) => x.id === id); if (i >= 0) presets.splice(i, 1); if (presetUI.active === id) presetUI.active = presets[0]?.id ?? '' }
// Apply the initial preset once so the shown preset matches the actual layer visibility.
applyPreset(presetUI.active)

let seq = 0
export function addLayer(group = 'General'): PLayer {
	const l: PLayer = { id: 'ly' + Date.now().toString(36) + seq++, name: 'New Layer', group, color: '#64748b', swatch: 'color', visible: true, locked: false }
	layers.push(l); layerUI.active = l.id
	return l
}
export function removeLayer(id: string) { const i = layers.findIndex((l) => l.id === id); if (i >= 0) layers.splice(i, 1); if (layerUI.active === id) layerUI.active = layers[0]?.id ?? '' }
// Reorder: move layer `id` to just BEFORE `beforeId` (null = to the end). Array order = draw order, so
// this sets the layer's z-position — dragging a background layer down in the panel puts it on top.
export function moveLayer(id: string, beforeId: string | null) {
	const from = layers.findIndex((l) => l.id === id); if (from < 0) return
	const [l] = layers.splice(from, 1)
	let to = beforeId ? layers.findIndex((x) => x.id === beforeId) : layers.length
	if (to < 0) to = layers.length
	layers.splice(to, 0, l)
}
// A layer's DRAW order index (position in the array). Lower = painted first (underneath). Unknown → -1.
export const layerOrder = (id?: string): number => (id ? layers.findIndex((l) => l.id === id) : -1)
