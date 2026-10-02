// Devices in racks (Phase 3.2): GLOBAL device templates (Dave: global, like blocks — built-ins here, the rest in
// `settings/cadDeviceTemplates`), making a device from a template, and the placement rules a rack enforces.
import type { Id, Device, DeviceKind, Rack, Pt } from './types'
import type { ProjectIndex } from './project'
import { newId } from './ids'
import { rotate } from './conventions'
import { naturalCompare } from './labels'

export interface DeviceTemplate {
	id: Id
	name: string
	kind: DeviceKind
	heightU: number
	portCount: number
	portType?: Device['portType']
	portNumbering?: Device['portNumbering']
	/** Which face it mounts on by default; panels default to 'both' (front patching, rear terminations). */
	face?: Device['face']
	widthMm?: number
	depthMm?: number
	catalogId?: Id
	builtin?: boolean
}

export const BUILTIN_DEVICE_TEMPLATES: DeviceTemplate[] = [
	{ id: 'builtin:panel-24', name: 'Patch panel 24-port 1U', kind: 'panel', heightU: 1, portCount: 24, portType: 'RJ45', face: 'both', builtin: true },
	{ id: 'builtin:panel-48', name: 'Patch panel 48-port 1U', kind: 'panel', heightU: 1, portCount: 48, portType: 'RJ45', face: 'both', builtin: true },
	{ id: 'builtin:panel-48-2u', name: 'Patch panel 48-port 2U', kind: 'panel', heightU: 2, portCount: 48, portType: 'RJ45', face: 'both', builtin: true },
	{ id: 'builtin:fibre-24', name: 'Fibre panel 24 LC 1U', kind: 'panel', heightU: 1, portCount: 24, portType: 'LC', face: 'both', builtin: true },
	{ id: 'builtin:switch-48', name: 'Switch 48-port 1U', kind: 'switch', heightU: 1, portCount: 48, portType: 'RJ45', portNumbering: 'column', face: 'front', builtin: true },
	{ id: 'builtin:switch-24', name: 'Switch 24-port 1U', kind: 'switch', heightU: 1, portCount: 24, portType: 'RJ45', portNumbering: 'column', face: 'front', builtin: true },
	{ id: 'builtin:manager-1u', name: 'Cable manager 1U', kind: 'manager', heightU: 1, portCount: 0, face: 'front', builtin: true },
	{ id: 'builtin:manager-2u', name: 'Cable manager 2U', kind: 'manager', heightU: 2, portCount: 0, face: 'front', builtin: true },
	{ id: 'builtin:shelf-2u', name: 'Shelf 2U', kind: 'shelf', heightU: 2, portCount: 0, face: 'front', builtin: true },
	{ id: 'builtin:server-2u', name: 'Server 2U', kind: 'server', heightU: 2, portCount: 2, portType: 'RJ45', face: 'front', builtin: true },
	{ id: 'builtin:pdu-v', name: 'PDU (vertical, 0U, 1 network port)', kind: 'pdu', heightU: 24, portCount: 1, portType: 'RJ45', face: 'rear', builtin: true },
]

/** A new device from a template, in a rack at U `u` (its lowest U). `face` overrides the template's (a device placed
 *  while looking at the rear mounts at the rear). */
export function deviceFromTemplate(t: DeviceTemplate, rackId: Id, u: number, name: string, face?: Device['face']): Device {
	return {
		type: 'device', id: newId(), rackId, name, kind: t.kind, u, heightU: t.heightU, face: face ?? t.face ?? 'front', portCount: t.portCount,
		...(t.portType ? { portType: t.portType } : {}), ...(t.portNumbering ? { portNumbering: t.portNumbering } : {}),
		...(t.widthMm ? { widthMm: t.widthMm } : {}), ...(t.depthMm ? { depthMm: t.depthMm } : {}), ...(t.catalogId ? { catalogId: t.catalogId } : {}),
		...(t.kind === 'panel' ? { panel: { tier: 'low' as const } } : {}),
	}
}

/** A template from a device ("Save as template"). */
export function templateFromDevice(d: Device, name: string): DeviceTemplate {
	return {
		id: newId(), name, kind: d.kind, heightU: d.heightU, portCount: d.portCount,
		...(d.portType ? { portType: d.portType } : {}), ...(d.portNumbering ? { portNumbering: d.portNumbering } : {}),
		face: d.face, ...(d.widthMm ? { widthMm: d.widthMm } : {}), ...(d.depthMm ? { depthMm: d.depthMm } : {}), ...(d.catalogId ? { catalogId: d.catalogId } : {}),
	}
}

/**
 * The racks of a server room in ROW ORDER — the order the rack view shows them (front) and allocation fills them.
 * Rows by their order; within a row, racks drawn on the plan run left to right as seen from the front of the row's
 * first placed rack (Dave: racks are drawn on the plan, then put in rows); racks not on the plan follow, by `order`.
 */
export function racksInOrder(ix: ProjectIndex, spaceId: Id, rowId?: Id): Rack[] {
	const racks = ix.racks.filter((r) => r.spaceId === spaceId && (!rowId || r.rowId === rowId))
	const rowOrder = (r: Rack) => { const row = r.rowId ? ix.get(r.rowId) : undefined; return row?.type === 'rackRow' ? row.order : 1e6 }
	// A row can turn a corner (racks along one wall, a frame and its managers along the next — Dave's IDF 2), so each
	// run of racks with the SAME rotation is ordered along its own "right" (as seen from its front), and the runs are
	// ordered along the first run's right. Racks not on the plan follow, by `order`.
	const pos = new Map<Id, number[]>()
	const byRow = new Map<string, Rack[]>()
	for (const r of racks) byRow.set(r.rowId ?? '', [...(byRow.get(r.rowId ?? '') ?? []), r])
	for (const rs of byRow.values()) {
		const placed = rs.filter((r) => r.at)
		if (!placed.length) continue
		const runs = new Map<number, Rack[]>()
		for (const r of placed) { const k = (((r.rot ?? 0) % 360) + 360) % 360; runs.set(k, [...(runs.get(k) ?? []), r]) }
		const dot = (p: Pt, t: Pt) => p.x * t.x + p.y * t.y
		const first = rotate({ x: 1, y: 0 }, placed[0].rot ?? 0)
		const centre = (rs: Rack[]): Pt => ({ x: rs.reduce((s, r) => s + r.at!.x, 0) / rs.length, y: rs.reduce((s, r) => s + r.at!.y, 0) / rs.length })
		const runRank = new Map([...runs.entries()].sort((a, b) => dot(centre(a[1]), first) - dot(centre(b[1]), first)).map(([k], i) => [k, i]))
		for (const [k, run] of runs) { const t = rotate({ x: 1, y: 0 }, k); for (const r of run) pos.set(r.id, [runRank.get(k)!, dot(r.at!, t)]) }
	}
	const cmp = (a: Rack, b: Rack) => {
		const pa = pos.get(a.id), pb = pos.get(b.id)
		if (pa && pb) return pa[0] - pb[0] || pa[1] - pb[1]
		return pa ? -1 : pb ? 1 : 0
	}
	return racks.sort((a, b) => rowOrder(a) - rowOrder(b) || (a.rowId ?? '').localeCompare(b.rowId ?? '') || cmp(a, b) || a.order - b.order || naturalCompare(a.name, b.name))
}

const faces = (d: Pick<Device, 'face' | 'kind'>) => (d.kind === 'pdu' || d.face === 'none' ? [] : d.face === 'both' ? ['front', 'rear'] : [d.face])

/**
 * Can `d` sit where it says (its rack, U, height) beside the rack's other devices? Null = yes, else why not. PDUs are
 * 0U strips and never collide; front-only and rear-only devices can share a U.
 */
export function placementProblem(d: Device, rack: Rack, others: Device[]): string | null {
	if (d.kind !== 'pdu' && (d.u < 1 || d.u + d.heightU - 1 > rack.heightU)) return `${d.name} (${d.heightU}U at U${d.u}) does not fit a ${rack.heightU}U rack`
	for (const o of others) {
		if (o.id === d.id || o.rackId !== d.rackId || !faces(d).some((f) => faces(o).includes(f))) continue
		if (d.u <= o.u + o.heightU - 1 && o.u <= d.u + d.heightU - 1) return `${d.name} would overlap ${o.name} at U${Math.max(d.u, o.u)}`
	}
	return null
}

/** The lowest free U where a `heightU` device fits on `face`, scanning from the TOP down (the allocation order too). */
export function firstFreeU(rack: Rack, others: Device[], heightU: number, face: Device['face']): number | null {
	for (let u = rack.heightU - heightU + 1; u >= 1; u--) {
		const probe = { id: '_', rackId: rack.id, name: '', kind: 'other', u, heightU, face, portCount: 0, type: 'device' } as Device
		if (!placementProblem(probe, rack, others)) return u
	}
	return null
}
