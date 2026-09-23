// LAYERS for the Pages tool — R5 (review.md §R5): there is ONE layer model. Every model owns its layer
// list (`Model.layers`, 3dview/types.ts `Layer`), and both its 3D objects (walls, furniture, trunks…) and
// its 2D entities (annotations, outlets, background images…) are filed on it — so the Layers panel hides
// walls and annotations the same way, per model (B16). This module holds the helpers every consumer uses
// over such a list (the Viewport's hide/lock/colour/draw order, the panel's mutators), plus the two pieces
// of UI state that are NOT per model: the active layer new entities are drawn on, and the saved View
// Presets. (Not persisted yet — see §12 / X4.)
//
// Paper-space layers for a sheet (review.md §R5) wait for paper-space annotations, which don't exist yet;
// per-viewport overrides ("hide walls in this frame only", Sheets' `layerOverrides`) are K9's per-frame
// frozen layers — both are follow-ups, not part of this store.
import { newId } from './ids'
import { DEFAULT_PRESETS } from './mock/layers'
import type { Layer } from './3dview/types'

export type { Layer }

/** The panel heading a layer sits under; object layers have no group of their own. */
export const MODEL_GROUP = 'Model'
export const layerGroup = (l: Layer): string => l.group ?? MODEL_GROUP
// Background layers hold imported backdrops: toggled on their own, never by a view preset.
const isBackground = (l: Layer) => l.group === 'Background'

export const layerById = (ls: Layer[], id?: string): Layer | undefined => (id ? ls.find((l) => l.id === id) : undefined)
// An item with no layer (or an unknown one) is always shown/editable in the tool's default ink.
export const isLayerHidden = (ls: Layer[], id?: string): boolean => { const l = layerById(ls, id); return !!l && !l.visible }
export const isLayerLocked = (ls: Layer[], id?: string): boolean => { const l = layerById(ls, id); return !!l && l.locked }
export const layerColor = (ls: Layer[], id?: string): string | undefined => layerById(ls, id)?.color
// A layer's DRAW order index (position in the list). Lower = painted first (underneath). Unknown → -1.
export const layerOrder = (ls: Layer[], id?: string): number => (id ? ls.findIndex((l) => l.id === id) : -1)
// Distinct group names in list order.
export const layerGroups = (ls: Layer[]): string[] => { const g: string[] = []; for (const l of ls) if (!g.includes(layerGroup(l))) g.push(layerGroup(l)); return g }

// The active layer new ENTITIES are drawn on (a layer id; model objects pick their layer by tool).
export const layerUI = $state<{ active: string }>({ active: 'anno' })
/** The layer a new entity lands on in this list: the active layer if the model has it, else Annotations,
 *  else the first non-background layer. */
export function activeLayerIn(ls: Layer[]): Layer | undefined {
	return layerById(ls, layerUI.active) ?? layerById(ls, 'anno') ?? ls.find((l) => !isBackground(l)) ?? ls[0]
}

// ── View Presets: a named set of visible layer ids (a saved layer state). Applying one to a model's list
// shows exactly its layers and hides the rest (background layers excepted). Presets are shared by every
// model: ids a model doesn't have are ignored. ──
export type Preset = { id: string; name: string; visible: string[] }
export const presets = $state<Preset[]>(DEFAULT_PRESETS.map((p) => ({ ...p, visible: [...p.visible] })))
export const presetUI = $state<{ active: string }>({ active: 'p-hi' })

export const currentVisibleIds = (ls: Layer[]): string[] => ls.filter((l) => l.visible && !isBackground(l)).map((l) => l.id)
// Does the list's visibility match a preset? (used to flag "modified"). Only the preset's ids that the
// model actually has count.
export function presetMatches(ls: Layer[], id: string): boolean {
	const p = presets.find((x) => x.id === id); if (!p) return false
	const vis = new Set(p.visible)
	return ls.every((l) => isBackground(l) || l.visible === vis.has(l.id))
}
export function applyPreset(ls: Layer[], id: string) {
	const p = presets.find((x) => x.id === id); if (!p) return
	const vis = new Set(p.visible)
	for (const l of ls) if (!isBackground(l)) l.visible = vis.has(l.id)
	presetUI.active = id
}
export function savePreset(ls: Layer[], name = 'New view'): Preset { const p: Preset = { id: newId('pv'), name, visible: currentVisibleIds(ls) }; presets.push(p); presetUI.active = p.id; return p }
export function updatePreset(ls: Layer[], id: string) { const p = presets.find((x) => x.id === id); if (p) p.visible = currentVisibleIds(ls) }
export function renamePreset(id: string, name: string) { const p = presets.find((x) => x.id === id); if (p) p.name = name }
export function deletePreset(id: string) { const i = presets.findIndex((x) => x.id === id); if (i >= 0) presets.splice(i, 1); if (presetUI.active === id) presetUI.active = presets[0]?.id ?? '' }

// ── mutators over a model's list (the caller passes the model's reactive `layers` array) ──
export function addLayer(ls: Layer[], group = 'General'): Layer {
	const l: Layer = { id: newId('ly'), name: 'New Layer', color: '#64748b', swatch: 'color', visible: true, locked: false, ...(group === MODEL_GROUP ? {} : { group }) }
	ls.push(l); layerUI.active = l.id
	return ls[ls.length - 1]   // the stored proxy, not the literal (reference_svelte_state_proxy)
}
export function removeLayer(ls: Layer[], id: string) {
	const i = ls.findIndex((l) => l.id === id); if (i >= 0) ls.splice(i, 1)
	if (layerUI.active === id) layerUI.active = activeLayerIn(ls)?.id ?? ''
}
// Reorder: move layer `id` next to `targetId` (before it, or after it when `after`). `targetId` null =
// to the end. List order = draw order, so this sets the layer's z-position. Direction-aware drop (see
// LayersPanel): dragging a layer DOWN onto the next one inserts AFTER it, so adjacent swaps aren't a no-op.
export function moveLayer(ls: Layer[], id: string, targetId: string | null, after = false) {
	const from = ls.findIndex((l) => l.id === id); if (from < 0) return
	const [l] = ls.splice(from, 1)   // remove first, then find the target index in the shortened list
	let to = targetId ? ls.findIndex((x) => x.id === targetId) : ls.length
	if (to < 0) to = ls.length
	else if (after) to += 1
	ls.splice(to, 0, l)
}
