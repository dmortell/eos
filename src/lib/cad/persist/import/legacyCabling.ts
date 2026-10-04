// Legacy import, cabling half: Frames locations → outlets, racks docs → racks / devices, the Elevations allocation
// (engine + pins + baked sticker labels, via $lib/elevation/portmap) → links, Frames reservations → panel
// reservations, patching docs → cords. Labels: a port linked to a panel takes the label Elevations shows on that panel
// port (baked = the sticker); others take the engine's generated label (ADR 0002 import table).
import type { Outlet, Device, Rack, RackRow, Link, Cord, ProjectSettings, PortRef } from '../../domain/types'
import { portLabelsFor } from '../../domain/labels'
import { buildPortInfoMap, repairLocationIds } from '../../../elevation/portmap'
import { renderLabel, templateForLegacyFormat } from '../../../elevation/labelTemplate'
import { generatePortLabels } from '../../../elevation/frames/engine'
import { floorOfDocId, type ImportCtx } from './ctx'

/* eslint-disable @typescript-eslint/no-explicit-any -- legacy docs are untyped Firestore data */
const IMPORTED_AT = Date.now()

export function importCabling(c: ImportCtx): void {
	const settings = c.entities.find((e): e is ProjectSettings => e.type === 'settings')
	const outletsByLoc = new Map<string, Outlet>()   // `${floor}:${locationId}` → outlet
	const usedLocPorts = new Set<string>()           // across every room of a floor, not per racks doc

	for (const [docId, fd] of Object.entries(c.src.frames)) {
		const f = floorOfDocId(c.src.pid, docId)
		if (!f || !fd) continue
		importLocations(c, f.floor, fd, outletsByLoc, settings)
	}
	for (const [docId, rd] of Object.entries(c.src.racks)) {
		const f = floorOfDocId(c.src.pid, docId)
		if (!f?.room || !rd) continue
		const devices = importRacks(c, docId, f.floor, f.room, rd)
		const fd = c.src.frames[docId.replace(/_R[A-Z]$/, '')]
		if (fd) importAllocation(c, docId, f.floor, f.room, fd, rd, outletsByLoc, devices, usedLocPorts)
	}
	for (const [docId, pd] of Object.entries(c.src.patching)) {
		const f = floorOfDocId(c.src.pid, docId)
		if (!f?.room || !pd) continue
		importCords(c, docId, pd, settings)
	}
}

function importLocations(c: ImportCtx, floor: number, fd: any, out: Map<string, Outlet>, settings?: ProjectSettings): void {
	const zoneLocations = repairLocationIds(fd.zoneLocations).zoneLocations
	const floorFormat: string = fd.floorFormat ?? 'L01'
	const lf = fd.labelFormat
	if (settings && lf && !settings.labelPatterns) {
		settings.labelPatterns = { outlet: lf.outletTemplate ?? 'Z.NNN', port: lf.template ?? templateForLegacyFormat({ separator: lf.separator ?? 'legacy', includeZone: lf.includeZone ?? true, includeRoom: lf.includeRoom ?? false }, floorFormat) }
	}
	const cfg = (c.src.project?.floors ?? []).find((x: any) => x.number === floor)
	for (const [zone, locs] of Object.entries(zoneLocations)) {
		if (!locs?.length) continue
		const generated = new Map<string, string>()
		for (const l of generatePortLabels({ floor, zone, serverRoomCount: cfg?.serverRoomCount ?? 1, locations: locs }, floorFormat, lf as any)) {
			if (l.locationId) generated.set(`${l.locationId}:${l.portNumber}`, l.label)
		}
		for (const loc of locs) {
			const label = lf?.outletTemplate
				? renderLabel(lf.outletTemplate, { floor, zone, locationNumber: loc.locationNumber, serverRoom: 'A', port: 1, roomNumber: loc.roomNumber })
				: `${zone}.${String(loc.locationNumber).padStart(3, '0')}`
			const fallback = portLabelsFor(label, loc.portCount)
			const o: Outlet = {
				// Keyed by floor: location ids repaired from (zone, number) repeat on every floor.
				type: 'outlet', id: c.id(`location:${floor}:${loc.id}`), levelId: c.levelId(floor), label,
				zoneId: c.space(floor, 'zone', zone), ...(loc.roomNumber ? { roomId: c.space(floor, 'room', loc.roomNumber) } : {}),
				tier: loc.isHighLevel ? 'high' : 'low', usage: loc.locationType ?? 'desk', mount: loc.isHighLevel ? 'ceiling' : 'floor',
				ports: Array.from({ length: loc.portCount }, (_, i) => ({
					port: i + 1,
					label: generated.get(`${loc.id}:${i + 1}`) ?? fallback[i],
					serverRoomId: c.serverRoom(floor, loc.serverRoomAssignment?.[i] || 'A'),
					cableType: 'cat6a',
				})),
			}
			c.add(o)
			out.set(`${floor}:${loc.id}`, o)
		}
	}
}

const DEVICE_KINDS = new Set(['panel', 'switch', 'server', 'manager', 'shelf', 'pdu', 'enclosure', 'other'])

function importRacks(c: ImportCtx, docId: string, floor: number, room: string, rd: any): Map<string, Device> {
	const devices = new Map<string, Device>()
	for (const r of rd.rows ?? []) {
		const row: RackRow = { type: 'rackRow', id: c.id(`row:${docId}:${r.id}`), spaceId: c.serverRoom(floor, room), name: r.label ?? 'Row', order: 0, ...(r.defaults?.containment ? { containment: r.defaults.containment } : {}) }
		c.add(row)
	}
	for (const r of rd.racks ?? []) {
		const rack: Rack = {
			type: 'rack', id: c.id(`rack:${docId}:${r.id}`), levelId: c.levelId(floor), spaceId: c.serverRoom(floor, r.serverRoom ?? room),
			...(r.rowId && c.known(`row:${docId}:${r.rowId}`) ? { rowId: c.id(`row:${docId}:${r.rowId}`) } : {}),
			order: r.order ?? 0, name: r.label ?? r.id, kind: r.type ?? 'cabinet', heightU: r.heightU ?? 42, widthMm: r.widthMm ?? 600, depthMm: r.depthMm ?? 1000,
			...(r.heightMm ? { heightMm: r.heightMm } : {}), ...(r.productRef ? { catalogId: r.productRef } : {}), ...(r.color ? { color: r.color } : {}),
			...(r.notes ? { notes: r.notes } : {}), ...(r.frontProtrusionMm ? { frontProtrusionMm: r.frontProtrusionMm } : {}),
			...(r.maker ? { maker: String(r.maker) } : {}), ...(r.model ? { model: String(r.model) } : {}),
		}
		c.add(rack)
	}
	for (const d of rd.devices ?? []) {
		const rackId = c.known(`rack:${docId}:${d.rackId}`)
		if (!rackId) { c.issue(docId, 'device-orphan', `Device ${d.label ?? d.id} is in a missing rack ${d.rackId} — skipped`); continue }
		const kind = DEVICE_KINDS.has(d.type) ? d.type : 'other'
		const portLabels = d.portLabels ? Object.fromEntries(Object.entries(d.portLabels).map(([k, v]) => [String(k), String(v)])) : undefined
		const dev: Device = {
			type: 'device', id: c.id(`device:${docId}:${d.id}`), rackId, name: d.label || d.type || 'Device', kind,
			u: d.positionU ?? 1, heightU: d.heightU ?? 1, face: d.mounting ?? 'both', portCount: d.portCount ?? 0,
			...(d.portType ? { portType: d.portType } : {}), ...(d.widthMm ? { widthMm: d.widthMm } : {}), ...(d.depthMm ? { depthMm: d.depthMm } : {}),
			...(d.offsetX ? { offsetX: d.offsetX } : {}), ...(d.color ? { color: d.color } : {}), ...(portLabels ? { portLabels } : {}),
			...(d.maker ? { maker: String(d.maker) } : {}), ...(d.model ? { model: String(d.model) } : {}),
			...(kind === 'panel' ? { panel: { tier: d.patchLevel === 'high' ? 'high' : 'low', ...(d.serverRoom ? { serverRoomId: c.serverRoom(floor, d.serverRoom) } : {}), ...(d.labelsPrinted ? { labelsPrintedAt: IMPORTED_AT } : {}) } } : {}),
		}
		c.add(dev)
		devices.set(d.id, dev)
	}
	return devices
}

function importAllocation(c: ImportCtx, docId: string, floor: number, room: string, fd: any, rd: any, outlets: Map<string, Outlet>, devices: Map<string, Device>, usedLocPorts: Set<string>): void {
	const cfg = (c.src.project?.floors ?? []).find((x: any) => x.number === floor)
	const info = buildPortInfoMap(fd, room, rd.devices ?? [], rd.racks ?? [], floor, cfg?.serverRoomCount, fd.floorFormat ?? 'L01')
	const structured: Record<string, any> = fd.structuredLinks ?? {}
	const byPanelPort = new Map<string, any>(Object.values(structured).map((l: any) => [`${l.a?.deviceId}:${l.a?.portIndex}`, l]))

	for (const [key, pi] of info) {
		if (!pi.locationId || !pi.locationPort) continue
		const [devLegacy, portStr] = [key.slice(0, key.lastIndexOf(':')), key.slice(key.lastIndexOf(':') + 1)]
		const dev = devices.get(devLegacy), out = outlets.get(`${floor}:${pi.locationId}`)
		if (!dev || !out) continue
		const lp = `${floor}:${pi.locationId}:${pi.locationPort}`
		if (usedLocPorts.has(lp)) { c.issue(out.id, 'location-port-twice', `${out.label} port ${pi.locationPort} is allocated to two panel ports — kept the first`); continue }
		usedLocPorts.add(lp)
		const sl = byPanelPort.get(key)
		const link: Link = {
			type: 'link', id: c.id(`link:${docId}:${key}`), kind: 'horizontal',
			a: { on: dev.id, port: Number(portStr), face: 'rear' }, b: { on: out.id, port: pi.locationPort },
			status: sl?.status === 'installed' ? 'installed' : 'design',
			...(sl?.cableType ? { cableType: sl.cableType } : {}), ...(sl?.lengthM ? { lengthM: sl.lengthM } : {}), ...(sl?.notes ? { notes: sl.notes } : {}),
			...(pi.pinned || pi.baked ? { pinned: true } : {}),
		}
		c.add(link)
		// The label on the panel port (the sticker, when baked) is the outlet port's label from now on.
		const port = out.ports[pi.locationPort - 1]
		if (port && pi.label && port.label !== pi.label) port.label = pi.label
		if (port && sl?.cableType) port.cableType = sl.cableType
		const override = dev.portLabels?.[portStr]
		if (override && override !== pi.label) c.issue(dev.id, 'port-label-override', `${dev.name} port ${portStr} had the hand label "${override}" but is linked to ${pi.label} — the linked label is shown`)
	}
	for (const sl of Object.values(structured) as any[]) {
		if (sl.kind !== 'tie') continue
		const a = devices.get(sl.a?.deviceId), b = devices.get(sl.b?.deviceId)
		if (!a || !b) continue
		c.add({ type: 'link', id: c.id(`link:${docId}:${sl.id}`), kind: 'tie', a: { on: a.id, port: sl.a.portIndex }, b: { on: b.id, port: sl.b.portIndex }, status: sl.status === 'installed' ? 'installed' : 'design', ...(sl.cableType ? { cableType: sl.cableType } : {}), ...(sl.lengthM ? { lengthM: sl.lengthM } : {}) })
	}
	importReservations(fd, rd, devices)
}

type Reservation = NonNullable<NonNullable<Device['panel']>['reservations']>[number]

/** Frames reservations are panel cells (rack, RU, top/bottom row, column) → a panel's port numbers. */
function importReservations(fd: any, rd: any, devices: Map<string, Device>): void {
	for (const res of fd.portReservations ?? []) {
		for (const pos of res.ports ?? []) {
			const legacy = (rd.devices ?? []).find((d: any) => d.rackId === pos.frameId && d.type === 'panel' && pos.ru >= d.positionU && pos.ru < d.positionU + (d.heightU ?? 1))
			const dev = legacy && devices.get(legacy.id)
			if (!dev?.panel) continue
			const port = (pos.row === 'bottom' ? 24 : 0) + pos.col + 1
			const list: Reservation[] = (dev.panel.reservations ??= [])
			let r = list.find((x) => x.id === res.id)
			if (!r) { r = { id: res.id, usage: res.type, ports: [], ...(res.label ? { note: res.label } : {}) }; list.push(r) }
			if (!r.ports.includes(port)) r.ports.push(port)
		}
	}
}

function importCords(c: ImportCtx, docId: string, pd: any, settings?: ProjectSettings): void {
	const ref = (r: any): PortRef | undefined => {
		const on = r && c.known(`device:${docId}:${r.deviceId}`)
		return on ? { on, port: r.portIndex, ...(r.face ? { face: r.face } : {}) } : undefined
	}
	for (const t of pd.customCableTypes ?? []) {
		if (settings && !settings.cableTypes.some((x) => x.id === t.id)) settings.cableTypes.push({ id: t.id, label: t.label, media: t.category === 'fiber' ? 'fibre' : t.category === 'copper' ? 'copper' : 'other', color: t.color })
	}
	for (const k of pd.connections ?? []) {
		const a = ref(k.fromPortRef), b = ref(k.toPortRef)
		if (!a || !b) { c.issue(docId, 'cord-orphan', `Patch cord ${k.cordId ?? k.id} ends at a missing device — skipped`); continue }
		const pa = ref(k.previousFromRef), pb = ref(k.previousToRef)
		const cord: Cord = {
			type: 'cord', id: c.id(`cord:${docId}:${k.id}`), kind: k.kind === 'cross-connect' ? 'cross-connect' : 'patch', a, b,
			cableType: k.cableType ?? 'cat6a', colour: k.cableColor ?? '#3b82f6', lengthM: k.lengthMeters ?? 1, lengthLocked: !!k.lengthLocked,
			status: k.status ?? 'add', ...(k.cordId ? { cordId: k.cordId } : {}), ...(k.notes ? { notes: k.notes } : {}),
			...(pa && pb ? { previous: { a: pa, b: pb, status: k.previousStatus ?? 'installed' } } : {}),
		}
		c.add(cord)
	}
}
