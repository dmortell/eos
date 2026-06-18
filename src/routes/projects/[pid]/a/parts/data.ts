import type { Model, View } from './types'

// Placeholder CAD models — replace with real model sources later.
export const models: Model[] = [
	{
		id: 1,
		name: '33F plan',
		objects: [
			{ type: 'rect', x: 0, y: 0, w: 200, h: 140 },
			{ type: 'line', points: [{ x: 0, y: 40 }, { x: 200, y: 40 }] },
			{ type: 'line', points: [{ x: 80, y: 40 }, { x: 80, y: 140 }] },
			{ type: 'circle', x: 150, y: 90, r: 25 },
		],
	},
	{
		id: 2,
		name: 'Rack A',
		objects: [
			{ type: 'rect', x: 0, y: 0, w: 60, h: 200 },
			{ type: 'line', points: [{ x: 0, y: 25 }, { x: 60, y: 25 }] },
			{ type: 'line', points: [{ x: 0, y: 50 }, { x: 60, y: 50 }] },
			{ type: 'line', points: [{ x: 0, y: 75 }, { x: 60, y: 75 }] },
		],
	},
]

export const initialViews: View[] = [
	{ id: 1, modelId: 1, name: '33F plan', fx: 20, fy: 20, fw: 240, fh: 180, mx: 0, my: 0, scale: 1 },
	{ id: 2, modelId: 2, name: 'Rack A', fx: 290, fy: 20, fw: 110, fh: 257, mx: 0, my: 0, scale: 1 },
]
