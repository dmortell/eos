import type { Model, View } from './types'

// Placeholder CAD models — replace with real model sources later.
export const models: Model[] = [
	{
		id: 1,
		name: '33F office',
		// Dimensions in mm. Room 6600 × 4200, 2800 ceiling.
		objects: [
			// Perimeter walls (closed loop) + a partitioned meeting room top-right.
			{ type: 'wall', z: 0, h: 2800, thickness: 150, pts: [
				{ x: 0, y: 0 }, { x: 6600, y: 0 }, { x: 6600, y: 4200 }, { x: 0, y: 4200 }, { x: 0, y: 0 },
			] },
			{ type: 'wall', z: 0, h: 2800, thickness: 100, pts: [{ x: 4500, y: 4200 }, { x: 4500, y: 2700 }, { x: 6600, y: 2700 }] },

			// Desk pods (open-plan area), desk = 1500 × 700 × 750.
			{ type: 'prism', x: 300, y: 450, z: 0, w: 1500, d: 700, h: 750, edges: 4 },
			{ type: 'prism', x: 300, y: 1300, z: 0, w: 1500, d: 700, h: 750, edges: 4 },
			{ type: 'prism', x: 2100, y: 450, z: 0, w: 1500, d: 700, h: 750, edges: 4 },
			{ type: 'prism', x: 2100, y: 1300, z: 0, w: 1500, d: 700, h: 750, edges: 4 },
			{ type: 'prism', x: 300, y: 2900, z: 0, w: 1500, d: 700, h: 750, edges: 4 },
			{ type: 'prism', x: 2100, y: 2900, z: 0, w: 1500, d: 700, h: 750, edges: 4 },

			// Round structural column (Ø360, full height).
			{ type: 'prism', x: 3000, y: 2100, z: 0, w: 360, d: 360, h: 2800, edges: 16 },

			// Round meeting table (Ø1200 × 900), centre ≈ (5550, 3450).
			{ type: 'prism', x: 4950, y: 3000, z: 0, w: 1200, d: 900, h: 750, edges: 16 },

			// Wall-mounted TV on the meeting room's east wall (faces west), 1400 × 800,
			// 50 deep, mounted at 1400 mm. Centre ≈ (6575, 3450, 1800).
			{ type: 'prism', x: 6550, y: 2750, z: 1400, w: 50, d: 1400, h: 800, edges: 4 },

			// Round conduit (Ø80): back of TV → down inside the wall → floor → table centre.
			{ type: 'conduit', w: 80, h: 80, edges: 16, path: [
				{ x: 6600, y: 3450, z: 1800 }, { x: 6600, y: 3450, z: 0 }, { x: 5550, y: 3450, z: 0 },
			] },

			// Rectangular cable trunk run along the ceiling.
			{ type: 'conduit', w: 180, h: 150, edges: 4, path: [
				{ x: 240, y: 180, z: 2600 }, { x: 6300, y: 180, z: 2600 }, { x: 6300, y: 2400, z: 2600 },
			] },
		],
	},
	{
		id: 2,
		name: 'Rack A',
		objects: [
			{ type: 'prism', x: 0, y: 0, z: 0, w: 60, d: 40, h: 200, edges: 4 },
			{ type: 'prism', x: 15, y: 5, z: 0, w: 30, d: 30, h: 50, edges: 4 },
		],
	},
]

export const initialViews: View[] = [
	{ id: 1, modelId: 1, name: '33F plan', direction: 'plan', fx: 20, fy: 20, fw: 240, fh: 125, mx: -1000, my: -150, scale: .028 },
	{ id: 2, modelId: 1, name: '33F — 3D', direction: 'iso', fx: 265, fy: 20, fw: 140, fh: 140, mx: -5000, my: -4100, scale: .013 },
	{ id: 3, modelId: 1, name: '33F front', direction: 'front', fx: 20, fy: 155, fw: 240, fh: 125, mx: -1000, my: -200, scale: .028 },
]
