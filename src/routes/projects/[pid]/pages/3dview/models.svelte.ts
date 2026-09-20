// Pages 3D model registry (P1 — in-memory; Firestore `models3d/{pid}` comes in P6, see model-plan.md).
// A MODEL is a floor's 3D (walls / prisms / conduits, real mm). A page's viewport references a model by
// id + view config. Seeds one demo floor near the plan centre (PLAN_CX/CY = 14000/8750 mm).
import type { Model, Obj, Layer } from './types'
import { migrateModels } from './migrate'

const LAYERS: Layer[] = [
	{ id: 'walls', name: 'Walls', color: '#8a7f72', visible: true, locked: false, weight: 1.6 },
	{ id: 'furniture', name: 'Furniture', color: '#94a58c', visible: true, locked: false, weight: 0.9 },
	{ id: 'trunks', name: 'Trunks', color: '#0e7490', visible: true, locked: false, weight: 1 },
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
		id: 1, name: '33F', layers: LAYERS,
		levels: { floorSlab: 0, raisedFloor: 150, ceilingTile: 2700, ceilingSlab: 3200 },
		objects: [wall, desk(11500, 6200), desk(11500, 8000), desk(15000, 6200), desk(15000, 8000), trunk],
	}
}

export const models = $state<Model[]>(migrateModels([demoFloor()]))
export const modelById = (id?: number) => (id == null ? undefined : models.find((m) => m.id === id))
