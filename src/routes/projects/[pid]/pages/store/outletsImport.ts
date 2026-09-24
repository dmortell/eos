// One-off IMPORT from the Outlets tool (drawings-plan §6): an `outlets/{docId}` doc → the place's model.
//   outlet → an `insert` of an outlet block (mount type picks the block: wall → wall mount, floor → floorbox,
//            anything else → rosette / box), attributes LABEL / PORTS / TYPE (usage) / NOTE (room field);
//            colour from the usage, filled when LOW level; layer by level ("Outlets low level" / "… high level").
//   trunk  → a conduit object (pipe = round, rect = rectangular), same nodes (x, y, z) and segments.
// Positions are already real mm from the floorplan origin — the model's coordinates — so nothing is moved.
// Ids are deterministic (`out-<id>`, `trk-<id>`): importing again UPDATES what was imported and adds new items;
// nothing the user drew is touched, and items deleted in the Outlets tool are left in the model.
// Pure; tested in outletsImport.test.ts.
import type { Ent } from '../ui/geometry'
import type { Model, Obj, Layer } from '../3dview/types'
import type { OutletConfig } from '../../outlets/parts/types'
import type { TrunkConfig, PipeSpec, RectSpec } from '../../outlets/trunks/types'
import { USAGE_COLORS } from '../../outlets/parts/constants'

export type OutletsDoc = { outlets?: OutletConfig[]; trunks?: TrunkConfig[]; selectedFileId?: string; selectedPage?: number }

export const OUTLET_LAYERS: Layer[] = [
	{ id: 'outlets-low', name: 'Outlets low level', group: 'Outlets', color: '#2563eb', visible: true, locked: false },
	{ id: 'outlets-high', name: 'Outlets high level', group: 'Outlets', color: '#7c3aed', visible: true, locked: false },
]
export const TRUNKS_LAYER: Layer = { id: 'trunks', name: 'Trunks', color: '#0e7490', visible: true, locked: false, weight: 1 }
const MOUNT_BLOCK: Record<string, string> = { wall: 'outlet-wall', floor: 'outlet-floor' }

/** The Outlets-tool doc id for a seeded place: its floor's doc, or its tenant area's (`__<area>`) — the
 *  floor's LEGACY area keeps the unsuffixed id (docs/firestore-structure.md). null = no link to old data. */
export function outletsDocIdFor(pid: string, legacy: { floor?: number; area?: string; room?: string; row?: string } | undefined,
	floors: { number: number; areas?: { id: string; legacy?: boolean }[] }[] = []): string | null {
	if (legacy?.floor == null || legacy.room != null || legacy.row != null) return null
	const base = `${pid}_F${String(legacy.floor).padStart(2, '0')}`
	if (!legacy.area) return base
	const legacyArea = floors.find((f) => f.number === legacy.floor)?.areas?.find((a) => a.legacy)?.id
	return legacy.area === legacyArea ? base : `${base}__${legacy.area}`
}

export function outletToInsert(o: OutletConfig): Ent {
	const c = USAGE_COLORS[o.usage] ?? USAGE_COLORS.network
	const e: Ent = {
		id: `out-${o.id}`, type: 'insert', block: MOUNT_BLOCK[o.mountType] ?? 'outlet-box', a: [o.position.x, o.position.y],
		layer: o.level === 'high' ? 'outlets-high' : 'outlets-low', color: c.stroke,
		attrs: { LABEL: o.label ?? '', PORTS: String(o.portCount ?? 1), TYPE: o.usage ?? 'network', NOTE: o.roomNumber ?? '' },
	}
	if (o.level !== 'high') e.fill = c.fill
	if (o.rotation) e.rot = o.rotation
	return e
}

export function trunkToConduit(t: TrunkConfig): Obj {
	const pipe = t.shape === 'pipe'
	const w = pipe ? (t.spec as PipeSpec).outerDiameterMm : (t.spec as RectSpec).widthMm
	const h = pipe ? w : (t.spec as RectSpec).heightMm
	return {
		type: 'conduit', id: `trk-${t.id}`, layer: TRUNKS_LAYER.id, w, h, edges: pipe ? 16 : 4,
		nodes: t.nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, z: n.z ?? 0 })),
		segments: t.segments.map((s) => ({ id: s.id, a: s.nodes[0], b: s.nodes[1] })),
	} as Obj
}

/** The model with the doc's outlets + trunks merged in (a NEW model object; the input isn't mutated). */
export function importOutletsInto(m: Model, doc: OutletsDoc): { model: Model; added: number; updated: number; trunks: number } {
	const inserts = (doc.outlets ?? []).map(outletToInsert)
	const conduits = (doc.trunks ?? []).filter((t) => t.nodes?.length && t.segments?.length).map(trunkToConduit)
	const shapes = [...(m.shapes ?? [])], objects = [...m.objects]
	let added = 0, updated = 0
	for (const e of inserts) { const i = shapes.findIndex((x) => x.id === e.id); if (i >= 0) { shapes[i] = e; updated++ } else { shapes.push(e); added++ } }
	for (const o of conduits) { const i = objects.findIndex((x) => x.id === o.id); if (i >= 0) objects[i] = o; else objects.push(o) }
	const layers = [...(m.layers ?? [])]
	for (const l of [...(inserts.length ? OUTLET_LAYERS : []), ...(conduits.length ? [TRUNKS_LAYER] : [])]) if (!layers.some((x) => x.id === l.id)) layers.push({ ...l })
	return { model: { ...m, shapes, objects, layers }, added, updated, trunks: conduits.length }
}
