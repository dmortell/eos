// G4: a Racks-tool ROW (`racks/{pid}_F{NN}_R{room}`: rows / racks / devices) → a Pages RACK-ROW model: each rack
// a box (its width × depth × height, side by side in row order with a 10 mm gap), each device a box inside it at
// its U position, on its mounting face. The front / rear elevations then ARE the rack elevations (Model3d draws
// the RU numbers; a front-only device hides in the rear view). Pure; tested in racksImport.test.ts.
// Racks-tool conventions (racks/parts/constants.ts): 1 U = 45 mm (44.45 rounded), 40 mm frame rail top + bottom,
// devices 445 mm wide (19") centred unless `widthMm` / `offsetX`.
import type { Obj, Layer, Model } from '../3dview/types'
import { PLAN_CX, PLAN_CY } from '../ui/geometry'

export const RU_MM = 45
export const RAIL_MM = 40
export const DEVICE_W = 445
export const rackHeightMm = (u: number) => u * RU_MM + 2 * RAIL_MM
/** The z of U `u`'s bottom in a rack standing at `z0`. */
export const uToZ = (z0: number, u: number) => z0 + RAIL_MM + (u - 1) * RU_MM
/** The U whose bottom is nearest `z` (clamped to 1 … maxU). */
export const zToU = (z0: number, z: number, maxU = 99) => Math.max(1, Math.min(maxU, Math.round((z - z0 - RAIL_MM) / RU_MM) + 1))

export type RackIn = { id: string; label?: string; rowId?: string; order?: number; heightU?: number; heightMm?: number; widthMm?: number; depthMm?: number; type?: string; color?: string }
export type DeviceIn = { id: string; rackId: string; label?: string; type?: string; heightU?: number; positionU?: number; portCount?: number; color?: string; widthMm?: number; depthMm?: number; mounting?: 'front' | 'rear' | 'both' | 'none'; offsetX?: number }
export type RacksDocIn = { rows?: { id: string; label?: string }[]; racks?: RackIn[]; devices?: DeviceIn[] }

export const RACK_LAYERS: Layer[] = [
	{ id: 'racks', name: 'Racks', group: 'Racks', color: '#475569', visible: true, locked: false },
	{ id: 'devices', name: 'Devices', group: 'Racks', color: '#0ea5e9', visible: true, locked: false },
]
/** The Racks tool's device colours by type. */
export const DEVICE_COLORS: Record<string, string> = { panel: '#3b82f6', switch: '#22c55e', server: '#64748b', enclosure: '#0ea5e9', manager: '#a855f7', shelf: '#f97316', pdu: '#ab7240', other: '#6b7280' }
const GAP = 10

/** One row's racks + devices as model objects (ids `rk-<rack>` / `dv-<device>`), centred on the plan centre. */
export function rowToObjects(doc: RacksDocIn, rowId: string): Obj[] {
	const racks = (doc.racks ?? []).filter((r) => r.rowId === rowId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
	const total = racks.reduce((s, r) => s + (r.widthMm ?? 600), 0) + GAP * Math.max(0, racks.length - 1)
	const depth = Math.max(0, ...racks.map((r) => r.depthMm ?? 1000))
	let x = Math.round(PLAN_CX - total / 2)
	const y0 = Math.round(PLAN_CY - depth / 2), out: Obj[] = []
	for (const r of racks) {
		const w = r.widthMm ?? 600, d = r.depthMm ?? 1000, u = r.heightU ?? 42, rid = `rk-${r.id}`
		out.push({ type: 'prism', id: rid, layer: 'racks', x, y: y0, z: 0, w, d, h: r.heightMm ?? rackHeightMm(u), edges: 4, label: r.label || r.id, ...(r.color ? { color: r.color } : {}), rack: { u, src: r.id } })
		for (const dv of (doc.devices ?? []).filter((v) => v.rackId === r.id)) {
			if (dv.mounting === 'none') continue
			const hU = dv.heightU ?? 1, dw = Math.min(w, dv.widthMm ?? DEVICE_W), dd = Math.min(d, dv.depthMm ?? d - 100)
			const mount = dv.mounting ?? 'both'
			out.push({
				type: 'prism', id: `dv-${dv.id}`, layer: 'devices', edges: 4,
				x: Math.round(x + (w - dw) / 2 + (dv.offsetX ?? 0)), y: mount === 'rear' ? y0 + d - dd : y0, z: uToZ(0, dv.positionU ?? 1),
				w: dw, d: dd, h: hU * RU_MM, label: dv.label || dv.type || 'Device', color: dv.color ?? DEVICE_COLORS[dv.type ?? 'other'] ?? DEVICE_COLORS.other,
				device: { rackId: rid, u: dv.positionU ?? 1, hU, mount, ports: dv.portCount, kind: dv.type, src: dv.id },
			} as Obj)
		}
		x += w + GAP
	}
	return out
}

/** Merge a row's racks + devices into a rack-row model: the previously imported ones (`rk-` / `dv-`) are replaced,
 *  anything drawn by hand stays; the Racks / Devices layers are added when missing. */
export function mergeRackRow(m: Model, objs: Obj[]): Pick<Model, 'objects' | 'layers'> {
	const keep = m.objects.filter((o) => !/^(rk|dv)-/.test(o.id ?? ''))
	const layers = [...(m.layers ?? [])]
	for (const l of RACK_LAYERS) if (!layers.some((x) => x.id === l.id)) layers.push({ ...l })
	// a panel's port ALLOCATION (E8) is Pages data — it survives a re-import of the same device
	const allocOf = new Map(m.objects.filter((o) => o.device?.alloc).map((o) => [o.id, o.device!.alloc!]))
	const merged = objs.map((o) => (o.device && allocOf.has(o.id) ? { ...o, device: { ...o.device, alloc: allocOf.get(o.id) } } : o))
	return { objects: [...keep, ...merged], layers }
}

/** The first free U (from the bottom) in a rack for a device `hU` high, or null when it doesn't fit. */
export function freeU(objects: Obj[], rackId: string, rackU: number, hU: number): number | null {
	const used = objects.filter((o) => o.device?.rackId === rackId).map((o) => [o.device!.u, o.device!.u + o.device!.hU - 1] as const)
	for (let u = 1; u + hU - 1 <= rackU; u++) if (!used.some(([a, b]) => u <= b && u + hU - 1 >= a)) return u
	return null
}
