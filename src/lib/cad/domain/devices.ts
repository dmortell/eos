// Devices in racks (Phase 3.2): GLOBAL device templates (User: global, like blocks — built-ins here, the rest in
// `settings/cadDeviceTemplates`), making a device from a template, and the placement rules a rack enforces.
import type { Id, Device, DeviceKind, Rack, Pt, Space, Link, Cord } from './types'
import type { ProjectIndex } from './project'
import type { Entity } from './drawing'
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
	maker?: string
	model?: string
	/** The product's spec sheet: devices placed from it carry it (a link in Properties). */
	productUrl?: string
	builtin?: boolean
}
/** A 19" rack device's width WITHOUT its mounting ears (User: servers are ~430–451 mm, patch panels 462 mm without ears,
 *  482 mm with): devices with no width of their own are drawn this wide, the rack's mounting frame too (leaving room
 *  beside it for 0U PDUs and U numbers), and anything narrower can slide sideways (a tower PC, a monitor). */
export const RACK_DEVICE_W = 450
/** A device that can be offset sideways in its rack (narrower than a 19" device). */
export const narrowDevice = (d: Pick<Device, 'widthMm'>): boolean => !!d.widthMm && d.widthMm < RACK_DEVICE_W
/** The rack face a device is seen from: rear-mounted or rear-facing → rear (Find a device, Ctrl+K open that face). */
export const deviceFace = (d: Pick<Device, 'mount' | 'face'>): 'front' | 'rear' => (d.mount === 'rear' || d.face === 'rear' ? 'rear' : 'front')
/** A search finds a device by its name, kind, model or rack's name (one rule for Find a device and Ctrl+K; `w` is
 *  already lowercase). */
export const deviceMatches = (d: Pick<Device, 'name' | 'kind' | 'model'>, r: Pick<Rack, 'name'>, w: string): boolean =>
	`${d.name} ${d.kind} ${d.model ?? ''} ${r.name}`.toLowerCase().includes(w)

/** Where port `n` (1-based) sits in a device's grid of `rows` × `cols`: [row, col]. Along the rows ('row': 1–24 top,
 *  25–48 under) or DOWN ('column': 2 under 1), down each U's pair of rows in turn — a 96-port 2U switch has 1–48 on
 *  its top two rows and 49 under 2 (User 2026-10-10: Tourney's Arista CCS-720XP-96). */
/** The rows and columns of a device's ports — ONE layout for the rack view, the port map and the printed panel labels:
 *  ~24 a row, up to two rows a U (a 48-port 1U panel = 2 × 24; a 96-port 2U switch = 4 × 24). */
export function portGrid(d: Pick<Device, 'portCount' | 'heightU'>): { rows: number; cols: number } {
	const rows = d.portCount > 24 ? Math.max(1, Math.min(d.heightU * 2, Math.ceil(d.portCount / 24))) : 1   // 0U: one row, not ∞ columns
	return { rows, cols: Math.max(1, Math.ceil(d.portCount / rows)) }
}

export function portAt(numbering: Device['portNumbering'], n: number, rows: number, cols: number): [number, number] {
	const i = n - 1
	if (numbering !== 'column') return [Math.floor(i / cols), i % cols]
	const band = Math.floor(i / (2 * cols)), h = Math.min(2, rows - 2 * band), j = i - band * 2 * cols
	return [2 * band + (j % h), Math.floor(j / h)]
}

/** Maker / model travel between a device and its template. */
const makerModel = (x: { maker?: string; model?: string }) => ({ ...(x.maker ? { maker: x.maker } : {}), ...(x.model ? { model: x.model } : {}) })

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
	{ id: 'builtin:switch-48-2u', name: 'Switch 48-port 2U', kind: 'switch', heightU: 2, portCount: 48, portType: 'RJ45', portNumbering: 'column', face: 'front', builtin: true },
	{ id: 'builtin:server-1u', name: 'Server 1U', kind: 'server', heightU: 1, portCount: 2, portType: 'RJ45', face: 'front', builtin: true },
	{ id: 'builtin:fibre-enclosure', name: 'Fibre enclosure 1U (24 LC)', kind: 'enclosure', heightU: 1, portCount: 24, portType: 'LC', face: 'both', builtin: true },
	// not 19": a tower PC is narrower than RACK_DEVICE_W (it can slide sideways on a shelf); a 27" monitor is about
	// 615 mm wide (drawn no wider than its rack)
	{ id: 'builtin:tower-pc', name: 'Tower PC (200 mm)', kind: 'other', heightU: 9, portCount: 2, portType: 'RJ45', face: 'both', widthMm: 200, depthMm: 450, builtin: true },
	{ id: 'builtin:monitor-27', name: 'Monitor 27"', kind: 'other', heightU: 9, portCount: 0, face: 'front', widthMm: 615, depthMm: 200, builtin: true },
]

/** A new device from a template, in a rack at U `u` (its lowest U). `face` overrides the template's (a device placed
 *  while looking at the rear mounts at the rear). */
export function deviceFromTemplate(t: DeviceTemplate, rackId: Id, u: number, name: string, face?: Device['face']): Device {
	return {
		type: 'device', id: newId(), rackId, name, kind: t.kind, u, heightU: t.heightU, face: face ?? t.face ?? 'front', portCount: t.portCount,
		...(t.portType ? { portType: t.portType } : {}), ...(t.portNumbering ? { portNumbering: t.portNumbering } : {}),
		...(t.widthMm ? { widthMm: t.widthMm } : {}), ...(t.depthMm ? { depthMm: t.depthMm } : {}), ...(t.catalogId ? { catalogId: t.catalogId } : {}),
		...makerModel(t), ...(t.productUrl ? { productUrl: t.productUrl } : {}), ...(t.kind === 'panel' ? { panel: { tier: 'low' as const } } : {}),
	}
}

/** A template from a device ("Save as template"). */
export function templateFromDevice(d: Device, name: string): DeviceTemplate {
	return {
		id: newId(), name, kind: d.kind, heightU: d.heightU, portCount: d.portCount,
		...(d.portType ? { portType: d.portType } : {}), ...(d.portNumbering ? { portNumbering: d.portNumbering } : {}),
		face: d.face, ...(d.widthMm ? { widthMm: d.widthMm } : {}), ...(d.depthMm ? { depthMm: d.depthMm } : {}), ...(d.catalogId ? { catalogId: d.catalogId } : {}),
		...makerModel(d), ...(d.productUrl ? { productUrl: d.productUrl } : {}),
	}
}

/**
 * The racks of a server room in ROW ORDER — the order the rack view shows them (front) and allocation fills them.
 * Rows by their order; within a row, racks drawn on the plan run left to right as seen from the front of the row's
 * first placed rack (User: racks are drawn on the plan, then put in rows); racks not on the plan follow, by `order`.
 */
/** A room's patch panels in fill order: racks in row order, then top U down (labels, printed panel sheets). */
export function panelsInFillOrder(ix: ProjectIndex, spaceId: Id): Device[] {
	const rank = new Map(racksInOrder(ix, spaceId).map((r, i) => [r.id, i]))
	return ix.devices.filter((d) => d.kind === 'panel' && rank.has(d.rackId))
		.sort((a, b) => rank.get(a.rackId)! - rank.get(b.rackId)! || b.u + b.heightU - (a.u + a.heightU))
}

/** Where a room's racks stand: its own floor, mm above the level's FFL (0 when it has none). */
export const roomFloor = (ix: ProjectIndex, spaceId: Id | undefined): number => {
	const s = spaceId ? ix.get(spaceId) : undefined
	return s?.type === 'space' ? (s.floorMm ?? 0) : 0
}

export function racksInOrder(ix: ProjectIndex, spaceId: Id, rowId?: Id): Rack[] {
	const racks = ix.racks.filter((r) => r.spaceId === spaceId && (!rowId || r.rowId === rowId))
	const rowOrder = (r: Rack) => { const row = r.rowId ? ix.get(r.rowId) : undefined; return row?.type === 'rackRow' ? row.order : 1e6 }
	// A row can turn a corner (racks along one wall, a frame and its managers along the next — User's IDF 2), so each
	// RUN — the racks along one line, whichever way each faces (a manager turned round is still in the line: Tourney
	// IDF1) — is ordered along its own "right" as seen from the front of its widest racks, and the runs are ordered
	// along the right of the widest run (not whichever rack happens to come first). Racks not on the plan follow, by `order`.
	const pos = new Map<Id, number[]>()
	const byRow = new Map<string, Rack[]>()
	for (const r of racks) byRow.set(r.rowId ?? '', [...(byRow.get(r.rowId ?? '') ?? []), r])
	const rotOf = (r: Rack) => (((r.rot ?? 0) % 360) + 360) % 360
	const width = (rs: Rack[]) => rs.reduce((s, r) => s + r.widthMm, 0)
	/** The facing of most width in a run (ties: the first) — the way its viewer stands. */
	const facing = (rs: Rack[]) => {
		const w = new Map<number, number>()
		for (const r of rs) w.set(rotOf(r), (w.get(rotOf(r)) ?? 0) + r.widthMm)
		return [...w].reduce((a, b) => (b[1] > a[1] ? b : a))[0]
	}
	for (const rs of byRow.values()) {
		const placed = rs.filter((r) => r.at)
		if (!placed.length) continue
		const runs = new Map<number, Rack[]>()
		for (const r of placed) { const k = rotOf(r) % 180; runs.set(k, [...(runs.get(k) ?? []), r]) }
		const dot = (p: Pt, t: Pt) => p.x * t.x + p.y * t.y
		const main = [...runs.values()].reduce((a, b) => (width(b) > width(a) ? b : a))
		const first = rotate({ x: 1, y: 0 }, facing(main))
		const centre = (rs: Rack[]): Pt => ({ x: rs.reduce((s, r) => s + r.at!.x, 0) / rs.length, y: rs.reduce((s, r) => s + r.at!.y, 0) / rs.length })
		const runRank = new Map([...runs.entries()].sort((a, b) => dot(centre(a[1]), first) - dot(centre(b[1]), first)).map(([k], i) => [k, i]))
		for (const [k, run] of runs) { const t = rotate({ x: 1, y: 0 }, facing(run)); for (const r of run) pos.set(r.id, [runRank.get(k)!, dot(r.at!, t)]) }
	}
	const cmp = (a: Rack, b: Rack) => {
		const pa = pos.get(a.id), pb = pos.get(b.id)
		if (pa && pb) return pa[0] - pb[0] || pa[1] - pb[1]
		return pa ? -1 : pb ? 1 : 0
	}
	// a row's order set by hand (Space.rackOrder) wins: its listed racks first, in that order
	const space = ix.get(spaceId), hand = space?.type === 'space' ? space.rackOrder : undefined
	const handRank = (r: Rack) => { const i = hand?.[rowKey(r)]?.indexOf(r.id) ?? -1; return i < 0 ? 1e6 : i }
	return racks.sort((a, b) => rowOrder(a) - rowOrder(b) || (a.rowId ?? '').localeCompare(b.rowId ?? '') || handRank(a) - handRank(b) || cmp(a, b) || a.order - b.order || naturalCompare(a.name, b.name))
}

/** The key of a rack's row in `Space.rackOrder`: its row's id, `none` for a rack in no row. */
export const rowKey = (r: Pick<Rack, 'rowId'>): string => r.rowId ?? 'none'

/** Move a rack before / after another of its row (dragged in the racks list, backlog "Rack order in a row"): the room's
 *  hand order for that row, written in full. Null = not the same row (or itself). */
export function moveRack(ix: ProjectIndex, rackId: Id, targetId: Id, after: boolean): Space | null {
	const r = ix.get(rackId), t = ix.get(targetId), space = r?.type === 'rack' ? ix.get(r.spaceId) : undefined
	if (r?.type !== 'rack' || t?.type !== 'rack' || space?.type !== 'space' || t.spaceId !== r.spaceId || rowKey(t) !== rowKey(r) || r.id === t.id) return null
	const ids = racksInOrder(ix, r.spaceId).filter((x) => rowKey(x) === rowKey(r)).map((x) => x.id).filter((id) => id !== rackId)
	const at = ids.indexOf(targetId)
	if (at < 0) return null
	ids.splice(at + (after ? 1 : 0), 0, rackId)
	return { ...space, rackOrder: { ...space.rackOrder, [rowKey(r)]: ids } }
}

/** Back to the plan's order for a row (drops the hand order). */
export function planOrder(space: Space, key: string): Space {
	const { [key]: _drop, ...rest } = space.rackOrder ?? {}
	const { rackOrder: _all, ...base } = space
	return Object.keys(rest).length ? { ...base, rackOrder: rest } : base
}

/** The sides of the rack a device takes at its Us: its mount if set, else the faces it shows (PDUs: none, 0U). */
export const sidesOf = (d: Pick<Device, 'face' | 'kind' | 'mount'>): ('front' | 'rear')[] =>
	d.kind === 'pdu' || d.face === 'none' ? [] : d.mount ? [d.mount] : d.face === 'both' ? ['front', 'rear'] : [d.face]
export const sharesU = (a: Pick<Device, 'u' | 'heightU'>, b: Pick<Device, 'u' | 'heightU'>) => a.u <= b.u + b.heightU - 1 && b.u <= a.u + a.heightU - 1

/** Shift-click a second device in a rack view (User 2026-10-10: select U10, Shift-click U4): every device of that rack
 *  shown on this face whose Us fall between the two (inclusive), top down. Null = not two devices in one rack. */
export function devicesBetween(ix: ProjectIndex, aId: Id, bId: Id, face: 'front' | 'rear'): Id[] | null {
	const a = ix.getOf('device', aId), b = ix.getOf('device', bId)
	if (a?.type !== 'device' || b?.type !== 'device' || a.rackId !== b.rackId) return null
	const lo = Math.min(a.u, b.u), hi = Math.max(a.u + a.heightU - 1, b.u + b.heightU - 1)
	return ix.devicesIn(a.rackId).filter((d) => d.kind !== 'pdu' && (d.face === 'both' || d.face === face) && sharesU(d, { u: lo, heightU: hi - lo + 1 })).map((d) => d.id)
}

/** Two devices on the same side may share Us (backlog "Allow U overlaps with a warning"): when either is a shelf (a
 *  device sits on it) or has "May overlap" ticked. */
export const overlapAllowed = (a: Pick<Device, 'kind' | 'overlapOk'>, b: Pick<Device, 'kind' | 'overlapOk'>) =>
	a.kind === 'shelf' || b.kind === 'shelf' || !!a.overlapOk || !!b.overlapOk

/** The Us of a rack where two devices on the same side share the U (allowed overlaps) — the rack view marks them. */
export function clashUs(devices: Device[]): Set<number> {
	const out = new Set<number>()
	for (let i = 0; i < devices.length; i++) for (let j = i + 1; j < devices.length; j++) {
		const a = devices[i], b = devices[j], sa = sidesOf(a), sb = sidesOf(b)
		if (!sa.some((f) => sb.includes(f)) || !sharesU(a, b)) continue
		for (let u = Math.max(a.u, b.u); u <= Math.min(a.u + a.heightU, b.u + b.heightU) - 1; u++) out.add(u)
	}
	return out
}

/**
 * Can `d` sit where it says (its rack, U, height) beside the rack's other devices? Null = yes, else why not. PDUs are
 * 0U strips and never collide; devices on opposite sides (front / rear face or mount) can share a U, unless their
 * depths (when both are known) add up to more than the rack's.
 */
export function placementProblem(d: Device, rack: Rack, others: Device[]): string | null {
	if (d.kind !== 'pdu' && (d.u < 1 || d.u + d.heightU - 1 > rack.heightU)) return `${d.name} (${d.heightU}U at U${d.u}) does not fit a ${rack.heightU}U rack`
	const mine = sidesOf(d)
	for (const o of others) {
		if (o.id === d.id || o.rackId !== d.rackId || !mine.length || !sidesOf(o).length || !sharesU(d, o)) continue
		const at = `U${Math.max(d.u, o.u)}`
		if (mine.some((f) => sidesOf(o).includes(f))) {
			if (overlapAllowed(d, o)) continue   // allowed (a shelf, or "May overlap"): marked in the rack view, not refused
			const behind = !d.mount && d.face === 'both' && sidesOf(o).length === 1 ? ` (${o.name} is on the ${sidesOf(o)[0]}: set this one's Mount to ${sidesOf(o)[0] === 'rear' ? 'front' : 'rear'} to share the U)` : ''
			return `${d.name} would overlap ${o.name} at ${at}${behind}`
		}
		if (d.depthMm && o.depthMm && d.depthMm + o.depthMm > rack.depthMm) return `${d.name} (${d.depthMm} mm) and ${o.name} (${o.depthMm} mm) at ${at} are deeper together than ${rack.name} (${rack.depthMm} mm)`
	}
	return null
}

/** A new server room on a level: the next letter as its code ("A", "B" …), after the level's other rooms. */
export function newServerRoom(ix: ProjectIndex, levelId: Id, name: string): Space {
	const n = ix.spaces.filter((s) => s.levelId === levelId && s.kind === 'server room').length
	return { type: 'space', id: newId(), levelId, kind: 'server room', name, code: String.fromCharCode(65 + n), order: n + 1 }
}
/**
 * Racks moved to another level (with their devices, links and cords — those hang off the rack). They come off the
 * plan, since each level's plan has its own coordinates. A room whose racks ALL move goes with them (rows too);
 * otherwise the racks join the target level's room of the same name, or a new room with that name. Returns what to
 * write.
 */
export function moveRacksToLevel(ix: ProjectIndex, racks: Rack[], levelId: Id): Entity[] {
	const moving = racks.filter((r) => r.levelId !== levelId)
	const out: Entity[] = [], made = new Map<string, Space>()
	for (const spaceId of new Set(moving.map((r) => r.spaceId))) {
		const room = ix.get(spaceId) as Space | undefined, mine = moving.filter((r) => r.spaceId === spaceId)
		const all = ix.racks.filter((r) => r.spaceId === spaceId).every((r) => mine.includes(r))
		let to = spaceId
		if (room && all) out.push({ ...room, levelId })
		else {
			const name = room?.name ?? 'Server room'
			const there = ix.spaces.find((s) => s.levelId === levelId && s.kind === 'server room' && s.name === name) ?? made.get(name)
			const target = there ?? { ...newServerRoom(ix, levelId, name), order: ix.spaces.filter((s) => s.levelId === levelId).length + made.size + 1 }
			if (!there) { made.set(name, target); out.push(target) }
			to = target.id
		}
		for (const r of mine) out.push({ ...r, levelId, spaceId: to, at: undefined, ...(to === spaceId ? {} : { rowId: undefined }) })
		// panels that named the old room as the one they serve now serve the new one (else allocation kept filling them
		// from the old room's outlets)
		if (to !== spaceId) for (const d of ix.devices) if (mine.some((r) => r.id === d.rackId) && d.panel?.serverRoomId === spaceId) out.push({ ...d, panel: { ...d.panel, serverRoomId: to } })
	}
	return out
}

/** Racks into another room on their level: their row goes (rows belong to a room), and their panels that served the old
 *  room serve the new one — else allocation keeps filling them from the old room's outlets (Review 2 Q2, as
 *  `moveRacksToLevel` does). */
export function racksToRoom(ix: ProjectIndex, racks: Rack[], spaceId: Id): Entity[] {
	const out: Entity[] = []
	for (const r of racks) {
		if (r.spaceId === spaceId) continue
		out.push({ ...r, spaceId, rowId: undefined })
		for (const d of ix.devicesIn(r.id)) if (d.panel?.serverRoomId === r.spaceId) out.push({ ...d, panel: { ...d.panel, serverRoomId: spaceId } })
	}
	return out
}

/** The links and cords on ports that a new port count takes away: each device in `next` (its new count) against what's
 *  plugged into its ports above that count — they go with the ports, in the same step (Review 2 Q9). */
export function beyondPorts(ix: ProjectIndex, next: Pick<Device, 'id' | 'portCount'>[]): { links: Link[]; cords: Cord[] } {
	const count = new Map(next.map((d) => [d.id, d.portCount]))
	const gone = (e: { a: { on: Id; port: number }; b: { on: Id; port: number } }) =>
		[e.a, e.b].some((r) => count.has(r.on) && r.port > count.get(r.on)!)
	return { links: ix.links.filter(gone), cords: ix.cords.filter(gone) }
}

/** "3 links and 2 cords" for the question (installed cords named: they leave the record, not into the removal list), or
 *  '' when nothing goes. */
export function beyondPortsText(going: { links: Link[]; cords: Cord[] }): string {
	const n = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`
	const parts = [going.links.length ? n(going.links.length, 'link') : '', going.cords.length ? n(going.cords.length, 'cord') : ''].filter(Boolean)
	const inst = going.cords.filter((c) => c.status === 'installed').length
	return parts.join(' and ') + (inst ? ` (${inst} installed — ${inst === 1 ? 'it goes' : 'they go'} from the record, not into the removal list)` : '')
}

/** The name a new server room is offered: "IDF 1", "IDF 2" … */
export const nextRoomName = (ix: ProjectIndex, levelId: Id): string => `IDF ${ix.spaces.filter((s) => s.levelId === levelId && s.kind === 'server room').length + 1}`

const KIND_NAMES: Record<DeviceKind, [string, string]> = {
	panel: ['panel', 'panels'], switch: ['switch', 'switches'], server: ['server', 'servers'], manager: ['cable manager', 'cable managers'],
	shelf: ['shelf', 'shelves'], pdu: ['PDU', 'PDUs'], enclosure: ['enclosure', 'enclosures'], other: ['other', 'other'],
}
/** "12 panels · 2 switches · 1 PDU": devices counted by kind, most first. */
export function deviceCounts(devices: Device[]): string {
	const n = new Map<DeviceKind, number>()
	for (const d of devices) n.set(d.kind, (n.get(d.kind) ?? 0) + 1)
	return [...n].sort((a, b) => b[1] - a[1]).map(([k, c]) => `${c} ${KIND_NAMES[k][c === 1 ? 0 : 1]}`).join(' · ') || 'no devices'
}

/** The free U nearest the one asked for where `d` fits (its U itself when free; then 1 away above / below, 2 …; a tie
 *  goes UP — the drop was just under a device, walkthrough B45). null = nowhere in the rack. */
export function nearestFreeU(d: Device, rack: Rack, others: Device[]): number | null {
	for (let k = 0; k < rack.heightU; k++) for (const u of k ? [d.u + k, d.u - k] : [d.u]) {
		if (u >= 1 && !placementProblem({ ...d, u }, rack, others)) return u
	}
	return null
}

/** The lowest free U where a `heightU` device fits on `face`, scanning from the TOP down (the allocation order too). (Used by tests only.) */
export function firstFreeU(rack: Rack, others: Device[], heightU: number, face: Device['face']): number | null {
	for (let u = rack.heightU - heightU + 1; u >= 1; u--) {
		const probe = { id: '_', rackId: rack.id, name: '', kind: 'other', u, heightU, face, portCount: 0, type: 'device' } as Device
		if (!placementProblem(probe, rack, others)) return u
	}
	return null
}
