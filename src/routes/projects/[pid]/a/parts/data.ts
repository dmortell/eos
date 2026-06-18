import type { Model, View } from './types'

// Placeholder CAD models — replace with real model sources later.
export const models: Model[] = [
	{
		id: 1,
		name: '33F plan',
		objects: [
			{ type: 'cuboid', x: 0, y: 0, z: 0, w: 200, d: 140, h: 20 },
			{ type: 'wall', z: 0, h: 30, pts: [{ x: 0, y: 40 }, { x: 200, y: 40 }] },
			{ type: 'wall', z: 0, h: 30, pts: [{ x: 80, y: 40 }, { x: 80, y: 140 }] },
			{ type: 'polygon', x: 150, y: 90, z: 0, r: 25, h: 40, edges: 16 },
		],
	},
	{
		id: 2,
		name: 'Rack A',
		objects: [
			{ type: 'cuboid', x: 0, y: 0, z: 0, w: 60, d: 40, h: 200 },
			{ type: 'polygon', x: 30, y: 20, z: 0, r: 15, h: 50, edges: 4 },
		],
	},
]

export const initialViews: View[] = [
	{ id: 1, modelId: 1, name: '33F plan', direction: 'plan', fx: 20, fy: 20, fw: 240, fh: 180, mx: -10, my: -10, scale: 1 },
	{ id: 2, modelId: 2, name: 'Rack A — front', direction: 'front', fx: 290, fy: 20, fw: 110, fh: 257, mx: -10, my: -10, scale: 1 },
]
