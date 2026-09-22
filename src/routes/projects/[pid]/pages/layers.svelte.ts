// Shared, reactive LAYER store for the Pages tool — the single source of truth the LayersPanel,
// PropertiesPanel and Viewport all read. Module-level $state is a shared singleton, so a toggle in
// the panel re-renders the canvas. The default layer stack + presets are seed data in `mock/layers.ts`
// (R10); this store clones them into $state and owns all the mutators. (Not persisted yet — see §12.)
import { newId } from './ids'
import { DEFAULT_LAYERS, DEFAULT_PRESETS } from './mock/layers'

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
// Clone the seed so the exported mock template stays pristine (the proxy mutates only this copy).
export const layers = $state<PLayer[]>(DEFAULT_LAYERS.map((l) => ({ ...l })))

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
export const presets = $state<Preset[]>(DEFAULT_PRESETS.map((p) => ({ ...p, visible: [...p.visible] })))
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
export function savePreset(name = 'New view'): Preset { const p: Preset = { id: newId('pv'), name, visible: currentVisibleIds() }; presets.push(p); presetUI.active = p.id; return p }
export function updatePreset(id: string) { const p = presets.find((x) => x.id === id); if (p) p.visible = currentVisibleIds() }
export function renamePreset(id: string, name: string) { const p = presets.find((x) => x.id === id); if (p) p.name = name }
export function deletePreset(id: string) { const i = presets.findIndex((x) => x.id === id); if (i >= 0) presets.splice(i, 1); if (presetUI.active === id) presetUI.active = presets[0]?.id ?? '' }
// Apply the initial preset once so the shown preset matches the actual layer visibility.
applyPreset(presetUI.active)

export function addLayer(group = 'General'): PLayer {
	const l: PLayer = { id: newId('ly'), name: 'New Layer', group, color: '#64748b', swatch: 'color', visible: true, locked: false }
	layers.push(l); layerUI.active = l.id
	return l
}
export function removeLayer(id: string) { const i = layers.findIndex((l) => l.id === id); if (i >= 0) layers.splice(i, 1); if (layerUI.active === id) layerUI.active = layers[0]?.id ?? '' }
// Reorder: move layer `id` next to `targetId` (before it, or after it when `after`). `targetId` null =
// to the end. Array order = draw order, so this sets the layer's z-position. Direction-aware drop (see
// LayersPanel): dragging a layer DOWN onto the next one inserts AFTER it, so adjacent swaps aren't a no-op.
export function moveLayer(id: string, targetId: string | null, after = false) {
	const from = layers.findIndex((l) => l.id === id); if (from < 0) return
	const [l] = layers.splice(from, 1)   // remove first, then find the target index in the shortened array
	let to = targetId ? layers.findIndex((x) => x.id === targetId) : layers.length
	if (to < 0) to = layers.length
	else if (after) to += 1
	layers.splice(to, 0, l)
}
// A layer's DRAW order index (position in the array). Lower = painted first (underneath). Unknown → -1.
export const layerOrder = (id?: string): number => (id ? layers.findIndex((l) => l.id === id) : -1)
