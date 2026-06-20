import type { Conduit, Model, Wall } from './types'
import { polyToGraph } from './migrate'

// Seed builders — author walls/conduits as polylines; stored as node/segment graphs.
const wall = (pts: { x: number; y: number }[], h: number, thickness: number, layer: string): Wall =>
	({ type: 'wall', h, thickness, layer, ...polyToGraph(pts.map((p) => ({ x: p.x, y: p.y, z: 0 }))) }) as Wall
const conduit = (path: { x: number; y: number; z: number }[], w: number, h: number, edges: number, layer: string): Conduit =>
	({ type: 'conduit', w, h, edges, layer, ...polyToGraph(path) }) as Conduit

// Seed model used when a project has no saved model3d models yet.
export const seedModels: Model[] = [
	{
		id: 1,
		name: '33F office',
		layers: [
			{ id: 'walls', name: 'Walls', color: '#475569', visible: true, locked: false },
			{ id: 'furniture', name: 'Furniture', color: '#9a3412', visible: true, locked: false },
			{ id: 'services', name: 'Services', color: '#0e7490', visible: true, locked: false },
			{ id: 'structure', name: 'Structure', color: '#1e293b', visible: true, locked: false },
		],
		// Dimensions in mm. Room 6600 × 4200, 2800 ceiling.
		objects: [
			wall([{ x: 0, y: 0 }, { x: 6600, y: 0 }, { x: 6600, y: 4200 }, { x: 0, y: 4200 }, { x: 0, y: 0 }], 2800, 150, 'walls'),
			wall([{ x: 4500, y: 4200 }, { x: 4500, y: 2700 }, { x: 6600, y: 2700 }], 2800, 100, 'walls'),

			{ type: 'prism', layer: 'furniture', x: 300, y: 450, z: 0, w: 1500, d: 700, h: 750, edges: 4 },
			{ type: 'prism', layer: 'furniture', x: 300, y: 1300, z: 0, w: 1500, d: 700, h: 750, edges: 4 },
			{ type: 'prism', layer: 'furniture', x: 2100, y: 450, z: 0, w: 1500, d: 700, h: 750, edges: 4 },
			{ type: 'prism', layer: 'furniture', x: 2100, y: 1300, z: 0, w: 1500, d: 700, h: 750, edges: 4 },
			{ type: 'prism', layer: 'furniture', x: 300, y: 2900, z: 0, w: 1500, d: 700, h: 750, edges: 4 },
			{ type: 'prism', layer: 'furniture', x: 2100, y: 2900, z: 0, w: 1500, d: 700, h: 750, edges: 4 },

			{ type: 'prism', layer: 'structure', x: 3000, y: 2100, z: 0, w: 360, d: 360, h: 2800, edges: 16 },
			{ type: 'prism', layer: 'furniture', x: 4950, y: 3000, z: 0, w: 1200, d: 900, h: 750, edges: 16 },
			{ type: 'prism', layer: 'furniture', x: 6550, y: 2750, z: 1400, w: 50, d: 1400, h: 800, edges: 4 },

			conduit([{ x: 6600, y: 3450, z: 1800 }, { x: 6600, y: 3450, z: 0 }, { x: 5550, y: 3450, z: 0 }], 80, 80, 16, 'services'),
			conduit([{ x: 240, y: 180, z: 2600 }, { x: 6300, y: 180, z: 2600 }, { x: 6300, y: 2400, z: 2600 }], 180, 150, 4, 'services'),
		],
	},
	{
		id: 2,
		name: 'Rack A',
		layers: [{ id: 'default', name: 'Default', color: '#111827', visible: true, locked: false }],
		objects: [
			{ type: 'prism', layer: 'default', x: 0, y: 0, z: 0, w: 60, d: 40, h: 200, edges: 4 },
			{ type: 'prism', layer: 'default', x: 15, y: 5, z: 0, w: 30, d: 30, h: 50, edges: 4 },
		],
	},
]
