import type { Model, View } from './types'

// Placeholder CAD models — replace with real model sources later.
export const models: Model[] = [
	{
		id: 1,
		name: '33F plan',
		objects: [
			{ type: 'prism', x: 0, y: 0, z: 0, w: 200, d: 140, h: 20, edges: 4 },
			{ type: 'wall', z: 0, h: 30, pts: [{ x: 0, y: 40 }, { x: 200, y: 40 }] },
			{ type: 'wall', z: 0, h: 30, pts: [{ x: 80, y: 40 }, { x: 80, y: 140 }] },
			{ type: 'prism', x: 125, y: 65, z: 0, w: 50, d: 50, h: 40, edges: 16 },
			{ type: 'conduit', w: 10, h: 10, edges: 16, path: [
				{ x: 10, y: 60, z: 60 }, { x: 120, y: 60, z: 60 },
				{ x: 120, y: 60, z: 80},
				{ x: 120, y: 160, z: 80},
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
	{ id: 1, modelId: 1, name: '33F plan', direction: 'plan', fx: 20, fy: 20, fw: 240, fh: 125, mx: -10, my: 5, scale: .8 },
	{ id: 2, modelId: 1, name: '33F — 3D', direction: 'iso', fx: 290, fy: 20, fw: 110, fh: 257, mx: -160, my: -210, scale: 0.3 },
	{ id: 3, modelId: 1, name: '33F front', direction: 'front', fx: 20, fy: 155, fw: 240, fh: 125, mx: -10, my: -10, scale: 1 },
]
