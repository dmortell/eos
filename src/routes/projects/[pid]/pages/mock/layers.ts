// Default layer + view-preset seeds for the Pages tool (R10) — the initial layer stack and saved layer
// states a fresh session starts with, until Firestore persistence lands (§12). Kept here with the other
// mock seeds so the backend swap replaces these arrays, not the reactive store (`../layers.svelte.ts`).
// The type import is erased at runtime, so there is no import cycle with the store that consumes this.
// R5: these are no longer a global list — `layerStack` builds each MODEL's own list from them (mock/models.ts).
import type { Preset } from '../layers.svelte'
import type { Layer } from '../3dview/types'

// NOTE: array ORDER = draw order (earlier = painted first = underneath; later = on top). The Background
// group sits FIRST so imported PDF/image backgrounds render behind everything; new layers append (on top).
export const DEFAULT_LAYERS: Layer[] = [
	{ id: 'bg-1', name: 'Background 1', group: 'Background', color: '#64748b', swatch: 'color', visible: false, locked: false },
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
]

// The demo models' OBJECT layer ids (floor + rack, mock/models.ts). Every seed preset keeps them on — a
// preset now governs a model's whole list (R5), and "High Level Outlets" shouldn't hide the walls.
const MODEL_LAYER_IDS = ['walls', 'furniture', 'trunks', 'openings', 'cabinet', 'devices']

// A view preset = a named set of visible layer ids (a saved layer state). 'All Layers' is derived from
// the default stack so it stays in sync if the seed changes.
export const DEFAULT_PRESETS: Preset[] = [
	{ id: 'p-hi', name: 'High Level Outlets', visible: [...MODEL_LAYER_IDS, 'anno', 'dims', 'data', 'power', 'wireless'] },
	{ id: 'p-lo', name: 'Low Level Outlets', visible: [...MODEL_LAYER_IDS, 'anno', 'dims', 'data', 'power'] },
	{ id: 'p-trunk', name: 'Trunk Routes', visible: [...MODEL_LAYER_IDS, 'anno', 'dims', 'copper', 'fiber'] },
	{ id: 'p-desk', name: 'Desk Numbering', visible: [...MODEL_LAYER_IDS, 'anno', 'dims'] },
	{ id: 'p-all', name: 'All Layers', visible: [...MODEL_LAYER_IDS, ...DEFAULT_LAYERS.map((l) => l.id)] },
]

/** A model's full layer list (R5): the Background layers first (underneath), then the model's own object
 *  layers, then the annotation / outlet / trunk / architectural layers — every entry a fresh copy, with the
 *  first preset's visibility applied (so the panel starts un-"modified"). */
export function layerStack(objectLayers: Layer[]): Layer[] {
	const vis = new Set(DEFAULT_PRESETS[0].visible)
	const bg = DEFAULT_LAYERS.filter((l) => l.group === 'Background')
	const rest = DEFAULT_LAYERS.filter((l) => l.group !== 'Background')
	return [...bg, ...objectLayers, ...rest].map((l) => ({ ...l, visible: l.group === 'Background' ? l.visible : vis.has(l.id) }))
}
