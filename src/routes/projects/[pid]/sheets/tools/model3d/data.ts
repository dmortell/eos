import type { Model } from './types'

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
			{ type: 'wall', layer: 'walls', z: 0, h: 2800, thickness: 150, pts: [
				{ x: 0, y: 0 }, { x: 6600, y: 0 }, { x: 6600, y: 4200 }, { x: 0, y: 4200 }, { x: 0, y: 0 },
			] },
			{ type: 'wall', layer: 'walls', z: 0, h: 2800, thickness: 100, pts: [{ x: 4500, y: 4200 }, { x: 4500, y: 2700 }, { x: 6600, y: 2700 }] },

			{ type: 'prism', layer: 'furniture', x: 300, y: 450, z: 0, w: 1500, d: 700, h: 750, edges: 4 },
			{ type: 'prism', layer: 'furniture', x: 300, y: 1300, z: 0, w: 1500, d: 700, h: 750, edges: 4 },
			{ type: 'prism', layer: 'furniture', x: 2100, y: 450, z: 0, w: 1500, d: 700, h: 750, edges: 4 },
			{ type: 'prism', layer: 'furniture', x: 2100, y: 1300, z: 0, w: 1500, d: 700, h: 750, edges: 4 },
			{ type: 'prism', layer: 'furniture', x: 300, y: 2900, z: 0, w: 1500, d: 700, h: 750, edges: 4 },
			{ type: 'prism', layer: 'furniture', x: 2100, y: 2900, z: 0, w: 1500, d: 700, h: 750, edges: 4 },

			{ type: 'prism', layer: 'structure', x: 3000, y: 2100, z: 0, w: 360, d: 360, h: 2800, edges: 16 },
			{ type: 'prism', layer: 'furniture', x: 4950, y: 3000, z: 0, w: 1200, d: 900, h: 750, edges: 16 },
			{ type: 'prism', layer: 'furniture', x: 6550, y: 2750, z: 1400, w: 50, d: 1400, h: 800, edges: 4 },

			{ type: 'conduit', layer: 'services', w: 80, h: 80, edges: 16, path: [
				{ x: 6600, y: 3450, z: 1800 }, { x: 6600, y: 3450, z: 0 }, { x: 5550, y: 3450, z: 0 },
			] },
			{ type: 'conduit', layer: 'services', w: 180, h: 150, edges: 4, path: [
				{ x: 240, y: 180, z: 2600 }, { x: 6300, y: 180, z: 2600 }, { x: 6300, y: 2400, z: 2600 },
			] },
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
