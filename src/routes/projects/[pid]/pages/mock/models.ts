// The default model content for a NEW floor model: its layer stack + nominal floor levels. (The demo models the
// registry used to start with — 33F, Rack A, 30F, 18F — were removed 2026-10-02: a real project never contains them.)
import type { Model, Layer } from '../3dview/types'
import { layerStack } from './layers'

const LAYERS: Layer[] = [
	{ id: 'walls', name: 'Walls', color: '#8a7f72', visible: true, locked: false, weight: 1.6 },
	{ id: 'furniture', name: 'Furniture', color: '#94a58c', visible: true, locked: false, weight: 0.9 },
	{ id: 'trunks', name: 'Trunks', color: '#0e7490', visible: true, locked: false, weight: 1 },
	{ id: 'openings', name: 'Openings', color: '#334155', visible: true, locked: false, weight: 1.2, opening: true },
]

/** An empty floor model (a floor / place that has none yet): the default layers and nominal levels. */
export const emptyFloor = (id: string, name: string): Model => ({
	id, name, layers: layerStack(LAYERS), objects: [],
	levels: { floorSlab: 0, raisedFloor: 150, ceilingTile: 2700, ceilingSlab: 3200 },
})
