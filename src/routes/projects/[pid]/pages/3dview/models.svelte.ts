// Pages 3D model registry (P1 — in-memory; Firestore `models3d/{pid}` comes in P6, see model-plan.md).
// A MODEL is a floor's 3D (walls / prisms / conduits, real mm). A page's viewport references a model by
// id + view config. Seeds one demo floor near the plan centre (PLAN_CX/CY = 14000/8750 mm).
import type { Model, Obj, Layer } from './types'
import { migrateModels } from './migrate'

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
		id: 1, name: '33F', layers: LAYERS,
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
		id: 2, name: 'Rack A', layers: RACK_LAYERS,
		levels: { floorSlab: 0, ceilingSlab: 2100 },
		objects: [cabinet, dev(0), dev(1), dev(2), dev(3), dev(4)],
	}
}

export const FLOOR_MODEL_ID = 1   // the default model a new viewport / tab points at
export const models = $state<Model[]>(migrateModels([demoFloor(), demoRack()]))
export const modelById = (id?: number) => (id == null ? undefined : models.find((m) => m.id === id))
// Replace the whole model list in place (keeps the reactive reference) — used by undo/redo to restore a
// history snapshot. `$state.snapshot` UNWRAPS Svelte proxies to plain data (structuredClone throws on a
// proxy — and the stored step's model IS a proxy, living inside the $state history tree), giving a deep
// plain copy so the restored live state never aliases the stored step; splice re-proxies it reactively.
export const snapModels = (): Model[] => $state.snapshot(models) as Model[]
export const setModels = (next: Model[]) => { models.splice(0, models.length, ...($state.snapshot(next) as Model[])) }

// Selected MODEL-object ids (P2). Global to the model for now (a pick in any view highlights it in
// all) — per-view model selection can come with the registry (§5). Mutated in place so importers
// keep the same reactive reference.
export const modelSel = $state<string[]>([])
export const setModelSel = (ids: string[]) => { if (ids.length !== modelSel.length || ids.some((v, i) => v !== modelSel[i])) modelSel.splice(0, modelSel.length, ...ids) }
