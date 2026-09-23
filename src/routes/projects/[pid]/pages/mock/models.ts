// Demo 3D-model seeds for the Pages tool (R10) — the two in-memory models the registry starts with
// until Firestore `models3d/{pid}` lands (P6, see model-plan.md). Kept here with the other mock seed
// data so the swap to a real backend touches `mock/`, not the reactive store (`3dview/models.svelte.ts`,
// which now just wraps `demoModels()` and owns the mutators/undo). All coords are real mm near the plan
// centre (PLAN_CX/CY = 14000/8750).
import type { Model, Obj, Layer } from '../3dview/types'
import { layerStack } from './layers'

const LAYERS: Layer[] = [
	{ id: 'walls', name: 'Walls', color: '#8a7f72', visible: true, locked: false, weight: 1.6 },
	{ id: 'furniture', name: 'Furniture', color: '#94a58c', visible: true, locked: false, weight: 0.9 },
	{ id: 'trunks', name: 'Trunks', color: '#0e7490', visible: true, locked: false, weight: 1 },
	{ id: 'openings', name: 'Openings', color: '#334155', visible: true, locked: false, weight: 1.2, opening: true },
]

let ns = 0
const gn = (x: number, y: number, z = 0) => ({ id: 'n' + ns++, x, y, z })
const gs = (a: string, b: string) => ({ id: 's' + ns++, a, b })

// A rectangular room of walls (4 mitred segments) with a couple of furniture prisms inside.
function demoFloor(): Model {
	const n1 = gn(10000, 5000), n2 = gn(18000, 5000), n3 = gn(18000, 12000), n4 = gn(10000, 12000)
	const wall: Obj = {
		type: 'wall', h: 2800, thickness: 100, layer: 'walls', id: 'wall1',
		nodes: [n1, n2, n3, n4],
		segments: [gs(n1.id, n2.id), gs(n2.id, n3.id), gs(n3.id, n4.id), gs(n4.id, n1.id)],
	}
	const desk = (x: number, y: number): Obj => ({ type: 'prism', x, y, z: 0, w: 1600, d: 800, h: 730, edges: 4, layer: 'furniture', id: 'd' + ns++ })
	const t0 = gn(10500, 5300, 2600), t1 = gn(17500, 5300, 2600)   // a rectangular trunk run near the ceiling
	const trunk: Obj = { type: 'conduit', w: 300, h: 150, edges: 4, layer: 'trunks', id: 'trunk1', nodes: [t0, t1], segments: [gs(t0.id, t1.id)] }
	return {
		id: 1, name: '33F', layers: layerStack(LAYERS),
		levels: { floorSlab: 0, raisedFloor: 150, ceilingTile: 2700, ceilingSlab: 3200 },
		objects: [wall, desk(11500, 6200), desk(11500, 8000), desk(15000, 6200), desk(15000, 8000), trunk],
		// A seeded background image on the 'bg-1' Background layer, for exercising the image import /
		// crop / scale / origin / aspect-lock tooling without an upload. (static/trump-juvenile.jpg.)
		ents: [{ id: 'bgimg', type: 'image', a: [9000, 4400], b: [19000, 11550], src: '/trump-juvenile.jpg', plane: 'plan', layer: 'bg-1', lockAspect: true }],
	}
}

// A second demo model — a server RACK (id 2) — so the model REGISTRY is exercised: a viewport can point
// at the floor OR the rack via its `modelId`. A tall cabinet (box prism) with a few 1U device slabs, near
// the plan centre so it frames well in any projection. Distinct layers/name from the floor.
function demoRack(): Model {
	const RACK_LAYERS: Layer[] = [
		{ id: 'cabinet', name: 'Cabinet', color: '#5b6472', visible: true, locked: false, weight: 1.4 },
		{ id: 'devices', name: 'Devices', color: '#0e7490', visible: true, locked: false, weight: 1 },
	]
	const x = 13700, y = 8450, w = 600, d = 1000
	const cabinet: Obj = { type: 'prism', x, y, z: 0, w, d, h: 2000, edges: 4, layer: 'cabinet', id: 'cab1' }
	const dev = (i: number): Obj => ({ type: 'prism', x: x + 30, y: y + 40, z: 150 + i * 320, w: w - 60, d: d - 80, h: 180, edges: 4, layer: 'devices', id: 'dev' + i })
	return {
		id: 2, name: 'Rack A', layers: layerStack(RACK_LAYERS),
		levels: { floorSlab: 0, ceilingSlab: 2100 },
		objects: [cabinet, dev(0), dev(1), dev(2), dev(3), dev(4)],
	}
}

// An empty floor model — one per floor in the navigator tree (mock/data.ts NAV_TREE) that has no demo
// content, so clicking the floor opens ITS model rather than 33F's.
const emptyFloor = (id: number, name: string): Model => ({
	id, name, layers: layerStack(LAYERS), objects: [],
	levels: { floorSlab: 0, raisedFloor: 150, ceilingTile: 2700, ceilingSlab: 3200 },
})

/** The demo model registry a fresh Pages session starts with (floor 33F id 1 + rack id 2 + empty 30F / 18F). */
export function demoModels(): Model[] { return [demoFloor(), demoRack(), emptyFloor(3, '30F'), emptyFloor(4, '18F')] }
