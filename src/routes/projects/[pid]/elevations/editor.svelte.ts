/**
 * ElevationsEditor — the single state class for the Elevations tool
 * (elevations-plan.md §4.2). Owns entities from the racks doc, UI state
 * (selection / face / active row / view), all CRUD with undo/redo, and
 * autosave. Components read the editor from props/context — no
 * 30-callback prop drilling.
 *
 * Types and constants still live under racks/parts/ — they migrate to
 * $lib together with the renderer in a later phase (transitional seam,
 * same as $lib/elevation/portmap.ts).
 */
import { HistoryStore } from '$lib/history/HistoryStore.svelte'
import { AutoSave } from '$lib/autosave/AutoSave.svelte'
import { buildPortInfoMap, buildReservationMap, type PortAssignment } from '$lib/elevation/portmap'
import type {
	RackConfig, DeviceConfig, DeviceTemplate, RackRow, RackSettings, RoomObject, ViewState, ElevationFace,
} from '../racks/parts/types'
import type { LocationConfig, LocType, PortReservation } from '../frames/parts/types'
import { portPosKey } from '../frames/parts/types'
import type { PatchConnection, PortRef, CustomCableType, PatchSettings, PatchStatus } from '../patching/parts/types'
import { DEFAULT_SETTINGS as DEFAULT_PATCH_SETTINGS } from '../patching/parts/types'
import { getCableType } from '../patching/parts/constants'
import { calculateCableLength } from '../patching/parts/cableUtils'
import { buildPortConnectionMap, findDuplicatePorts } from '../patching/parts/elevationUtils'
import { DEFAULT_SETTINGS, SCALE, RU_HEIGHT_MM, RACK_GAP_PX, rackHeightMm } from '../racks/parts/constants'
import { rackFromCatalog } from '$lib/catalog/service'
import type { CatalogProduct } from '$lib/catalog/types'
import type { ChangeDetail } from '$lib/logger'

export type SidebarTab = 'racks' | 'devices' | 'library' | 'catalog' | 'locations' | 'bom'

const isRUType = (t: string) => t !== 'desk' && t !== 'shelf' && t !== 'vcm'
const hydrateRack = (r: any): RackConfig => ({
	...r,
	heightMm: isRUType(r.type) ? rackHeightMm(r.heightU ?? 42) : (r.heightMm ?? 1600),
})

export interface EditorCallbacks {
	onsave?: (payload: any, changes: ChangeDetail[]) => void
	/** Saves location edits back to the frames doc (merge — only zoneLocations). */
	onsaveframes?: (payload: any, changes: ChangeDetail[]) => void
	/** Saves patch connections to the patching doc. */
	onsavepatching?: (payload: any, changes: ChangeDetail[]) => void
}

export class ElevationsEditor {
	// ── Context (set by the shell before/with sync) ──
	projectId = $state('')
	floor = $state(1)
	room = $state('A')

	// ── Entities (racks doc) ──
	rows = $state<RackRow[]>([{ id: 'default', label: 'Row A' }])
	racks = $state<RackConfig[]>([])
	devices = $state<DeviceConfig[]>([])
	settings = $state<RackSettings>({ ...DEFAULT_SETTINGS })
	/** Plan-view objects — not edited here, but preserved through the save round-trip. */
	roomObjects = $state<RoomObject[]>([])
	catalog = $state<CatalogProduct[]>([])

	// ── Frames doc (labels + locations) ──
	/** Raw frames doc — labelFormat, portReservations, customLocationTypes, etc. */
	framesData = $state<any>(null)
	/** Locally-editable copy of zoneLocations (the Locations tab edits this). */
	zoneLocations = $state<Record<string, LocationConfig[]>>({})
	/** Locally-editable block reservations (frames doc). */
	portReservations = $state<PortReservation[]>([])
	/** Sticky label pins: portPosKey → specific location port (frames doc). */
	portAssignments = $state<Record<string, PortAssignment>>({})
	private nextReservationId = 1
	/** Multi-selected ports for block operations — keys are portPosKey (rackId:ru:row:col). */
	selectedPorts = $state<Set<string>>(new Set())
	activeZone = $state('A')
	floorFormat = $state('L01')
	/** Authoritative per-floor server-room count (projects.floors). */
	serverRoomCountCfg = $state(1)

	// ── Patching doc ──
	connections = $state<PatchConnection[]>([])
	customCableTypes = $state<CustomCableType[]>([])
	patchSettings = $state<PatchSettings>({ ...DEFAULT_PATCH_SETTINGS })

	// ── UI state ──
	mode = $state<'select' | 'patch'>('select')
	face = $state<ElevationFace>('front')
	activeRowId = $state('default')
	/** Armed first endpoint while click-click patching. */
	patchArm = $state<PortRef | null>(null)
	selectedConnectionId = $state<string | null>(null)
	/** Sticky defaults: each cord edit teaches the next cord. */
	stickyCable = $state<{ type: string; status: PatchStatus }>({ type: 'uutp', status: 'add' })
	/** Cursor position in unscaled canvas px (rubber band while armed). */
	cursor = $state<{ x: number; y: number } | null>(null)
	/** One-line contextual hint for the status bar (port gate, arm state). */
	statusHint = $state<string | null>(null)
	/** Focus navigation stack level: the rack(s) the viewport is framed on. */
	focus = $state<{ rackIds: string[] } | null>(null)
	/** Selected port (panel device + 1-based index) — separate from the rack/device set. */
	selectedPort = $state<{ deviceId: string; portIndex: number } | null>(null)
	locationSelection = $state<Set<string>>(new Set())
	private lastLocationKey: string | null = null
	/** One selection set for racks + devices; the `rack-`/`dev-` id prefixes keep kinds distinct. */
	selection = $state(new Set<string>())
	view = $state<ViewState>({
		x: 60, y: 0, zoom: 0.3, scale: SCALE,
		grid: 100 * SCALE, width: 3000, height: 3000,
		showGrid: true, panning: false, dragging: false,
		button: 0, bottom: 3100,
	})

	history = new HistoryStore()
	readonly autosave: AutoSave
	private pendingChanges: ChangeDetail[] = []

	readonly framesAutosave: AutoSave
	private pendingFramesChanges: ChangeDetail[] = []
	readonly patchAutosave: AutoSave
	private pendingPatchChanges: ChangeDetail[] = []

	constructor(private callbacks: EditorCallbacks = {}) {
		this.autosave = new AutoSave((payload) => {
			this.callbacks.onsave?.(payload, this.pendingChanges)
			this.pendingChanges = []
		})
		this.framesAutosave = new AutoSave((payload) => {
			this.callbacks.onsaveframes?.(payload, this.pendingFramesChanges)
			this.pendingFramesChanges = []
		})
		this.patchAutosave = new AutoSave((payload) => {
			this.callbacks.onsavepatching?.(payload, this.pendingPatchChanges)
			this.pendingPatchChanges = []
		})
	}

	// ── Derived ──

	maxRackHeight = $derived(this.racks.length ? Math.max(...this.racks.map(r => r.heightMm)) : 2000)

	/** Racks in the active row with computed canvas positions (front order). */
	activeRacks = $derived.by(() => {
		return this.racks
			.filter(r => !this.activeRowId || r.rowId === this.activeRowId)
			.sort((a, b) => a.order - b.order)
			.map((rack, idx, arr) => {
				let x = 0
				for (let i = 0; i < idx; i++) x += arr[i].widthMm + RACK_GAP_PX / SCALE
				return { ...rack, _x: x, _z: this.settings.floorLevel }
			})
	})

	/** Rear-face racks: reversed left-to-right (viewer stands behind the row). */
	rearRacks = $derived.by(() => {
		if (this.face !== 'rear' || this.activeRacks.length === 0) return []
		return [...this.activeRacks].reverse().map((rack, idx, arr) => {
			let x = 0
			for (let i = 0; i < idx; i++) x += arr[i].widthMm + RACK_GAP_PX / SCALE
			return { ...rack, _x: x, _z: this.settings.floorLevel, _face: 'rear' as ElevationFace }
		})
	})

	selectedRacks = $derived(this.racks.filter(r => this.selection.has(r.id)))
	selectedDevices = $derived(this.devices.filter(d => this.selection.has(d.id)))

	/** Canonical port labels: `deviceId:portIndex` → { label, locationType, pinned }. */
	portInfo = $derived.by(() => {
		const frameData = this.framesDataForPipeline
			?? (Object.keys(this.zoneLocations).length
				? { zoneLocations: this.zoneLocations, portReservations: this.portReservations, portAssignments: this.portAssignments }
				: null)
		return buildPortInfoMap(frameData, this.room, this.devices, this.racks, this.floor, this.serverRoomCountCfg, this.floorFormat)
	})

	reservationMap = $derived(buildReservationMap(this.portReservations))

	focusedRackIds = $derived(new Set(this.focus?.rackIds ?? []))

	// ── Patching deriveds ──
	/** Cords shown in the elevation = target state (soft-deleted excluded). */
	elevationConnections = $derived(this.connections.filter(c => c.status !== 'remove'))
	removedCount = $derived(this.connections.filter(c => c.status === 'remove').length)
	portConnMap = $derived(buildPortConnectionMap(this.elevationConnections))
	duplicatePorts = $derived(findDuplicatePorts(this.elevationConnections))
	orphanedIds = $derived.by(() => {
		const rackIds = new Set(this.racks.map(r => r.id))
		const deviceIds = new Set(this.devices.map(d => d.id))
		const orphaned = (ref: PortRef) => (!!ref.rackId && !rackIds.has(ref.rackId)) || (!!ref.deviceId && !deviceIds.has(ref.deviceId))
		return new Set(this.connections.filter(c => orphaned(c.fromPortRef) || orphaned(c.toPortRef)).map(c => c.id))
	})

	/** Per-rack RU positions occupied by >1 device on the same rail (front/rear). */
	rackOverlaps = $derived.by(() => {
		const map = new Map<string, Set<number>>()
		const frontCounts = new Map<string, Map<number, number>>()
		const rearCounts = new Map<string, Map<number, number>>()
		for (const d of this.devices) {
			const ox = d.offsetX ?? 0
			if (ox < -446 / 2 || ox > 446 / 2) continue
			const mounting = d.mounting ?? 'both'
			if (mounting === 'none') continue
			for (const [uses, counts] of [
				[mounting === 'front' || mounting === 'both', frontCounts],
				[mounting === 'rear' || mounting === 'both', rearCounts],
			] as const) {
				if (!uses) continue
				if (!counts.has(d.rackId)) counts.set(d.rackId, new Map())
				const c = counts.get(d.rackId)!
				for (let u = d.positionU; u < d.positionU + d.heightU; u++) c.set(u, (c.get(u) ?? 0) + 1)
			}
		}
		for (const rackId of new Set([...frontCounts.keys(), ...rearCounts.keys()])) {
			const overlapping = new Set<number>()
			for (const counts of [frontCounts.get(rackId), rearCounts.get(rackId)]) {
				if (counts) for (const [u, count] of counts) { if (count > 1) overlapping.add(u) }
			}
			if (overlapping.size > 0) map.set(rackId, overlapping)
		}
		return map
	})

	// ── Persistence ──

	private buildPayload(rows: any, racks: any, devices: any, settings: any, roomObjects: any) {
		// Literal key order matters: AutoSave's echo detection JSON-compares this
		// shape against remote snapshots built the same way.
		return { rows, racks, devices, settings, roomObjects }
	}

	private payload() {
		return this.buildPayload(
			$state.snapshot(this.rows),
			$state.snapshot(this.racks),
			$state.snapshot(this.devices),
			$state.snapshot(this.settings),
			$state.snapshot(this.roomObjects),
		)
	}

	logChange(action: string, field?: string, details?: string) {
		// writeLog uses raw setDoc — undefined values are rejected by Firestore,
		// so omit absent keys entirely.
		const detail: ChangeDetail = { action }
		if (field !== undefined) detail.field = field
		if (details !== undefined) detail.details = details
		this.pendingChanges.push(detail)
		this.autosave.schedule(() => this.payload())
	}

	/** Apply a remote Firestore snapshot (also the initial load). */
	sync(data: any) {
		if (!data) return
		const remoteComparable = this.buildPayload(
			data.rows ?? [], (data.racks ?? []).map(hydrateRack), data.devices ?? [],
			{ ...DEFAULT_SETTINGS, ...(data.settings ?? {}) }, data.roomObjects ?? [],
		)
		if (!this.autosave.shouldApplyRemote(remoteComparable)) return
		this.rows = data.rows?.length ? data.rows : [{ id: 'default', label: 'Row A' }]
		this.racks = (data.racks ?? []).map(hydrateRack)
		this.devices = data.devices ?? []
		this.settings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) }
		this.roomObjects = Array.isArray(data.roomObjects) ? data.roomObjects : []
		if (!this.rows.find(r => r.id === this.activeRowId)) this.activeRowId = this.rows[0]?.id ?? 'default'
		this.backfillOrphans()
	}

	/** Reset per-room UI state when the shell switches floor/room (no remount). */
	setLocation(projectId: string, floor: number, room: string) {
		const changed = this.projectId !== projectId || this.floor !== floor || this.room !== room
		this.projectId = projectId
		this.floor = floor
		this.room = room
		if (changed) {
			this.selection = new Set()
			this.selectedPort = null
			this.selectedConnectionId = null
			this.patchArm = null
			this.rerouteState = null
			this.statusHint = null
			this.focus = null
			this.locationSelection = new Set()
			this.history.clear()
		}
	}

	/** Every rack must belong to a row — legacy data may have orphaned rowIds. */
	private backfillOrphans() {
		const validIds = new Set(this.rows.map(r => r.id))
		const orphaned = this.racks.filter(r => !validIds.has(r.rowId))
		if (orphaned.length === 0) return
		const target = this.rows[0].id
		this.racks = this.racks.map(r => validIds.has(r.rowId) ? r : { ...r, rowId: target })
		this.logChange('update', 'rack', `Moved ${orphaned.length} unassigned rack(s) to ${this.rows[0].label}`)
	}

	// ── Undo/redo ──

	private snapshotEntities() {
		return {
			rows: $state.snapshot(this.rows),
			racks: $state.snapshot(this.racks),
			devices: $state.snapshot(this.devices),
			settings: $state.snapshot(this.settings),
		}
	}

	private restoreEntities(s: ReturnType<ElevationsEditor['snapshotEntities']>, label: string) {
		this.rows = s.rows as RackRow[]
		this.racks = s.racks as RackConfig[]
		this.devices = s.devices as DeviceConfig[]
		this.settings = s.settings as RackSettings
		if (!this.rows.find(r => r.id === this.activeRowId)) this.activeRowId = this.rows[0]?.id ?? ''
		this.logChange('undo/redo', undefined, label)
	}

	/** Run a mutation with before/after snapshots recorded for undo/redo + audit log. */
	mutate(action: string, field: string, details: string | undefined, fn: () => void) {
		const before = this.snapshotEntities()
		fn()
		const after = this.snapshotEntities()
		const label = `${action} ${field}${details ? `: ${details}` : ''}`
		this.history.record({
			label,
			undo: () => this.restoreEntities(before, label),
			redo: () => this.restoreEntities(after, label),
		})
		this.logChange(action, field, details)
	}

	undo() { this.history.undo() }
	redo() { this.history.redo() }

	// ── Selection ──

	select(id: string, multi = false) {
		this.selectedPort = null
		this.selectedConnectionId = null
		if (multi) {
			const next = new Set(this.selection)
			next.has(id) ? next.delete(id) : next.add(id)
			this.selection = next
		} else {
			this.selection = new Set([id])
		}
	}

	rangeSelect(ids: string[]) {
		const next = new Set(this.selection)
		for (const id of ids) next.add(id)
		this.selection = next
	}

	clearSelection() {
		this.selection = new Set()
		this.selectedPort = null
		this.selectedConnectionId = null
		this.patchArm = null
		this.rerouteState = null
		this.statusHint = null
	}

	private deselect(id: string) {
		if (!this.selection.has(id)) return
		const next = new Set(this.selection)
		next.delete(id)
		this.selection = next
	}

	// ── Rack CRUD ──

	addRack(form?: any) {
		const id = `rack-${Date.now()}`
		const order = this.racks.filter(r => r.rowId === this.activeRowId).length
		const label = form?.label || `R${String(order + 1).padStart(2, '0')}`
		const rackType = form?.type ?? '4-post'
		const isFurniture = !isRUType(rackType)
		const hu = isFurniture ? 0 : (form?.heightU ?? 42)
		const defaultHeightMm = rackType === 'desk' ? 1600 : rackType === 'shelf' ? 1600 : rackType === 'vcm' ? 2000 : rackHeightMm(hu)
		const defaultWidthMm = rackType === 'vcm' ? 300 : 700
		const newRack: RackConfig = {
			id, label, rowId: this.activeRowId, order,
			heightU: hu,
			heightMm: form?.heightMm ?? defaultHeightMm,
			widthMm: form?.widthMm ?? defaultWidthMm,
			depthMm: form?.depthMm ?? 800,
			type: rackType,
			serverRoom: this.room,
			maker: form?.maker,
			model: form?.model,
			sku: form?.sku,
			productRef: form?.productRef,
			color: form?.color,
			adjustable: form?.adjustable,
			minDepthMm: form?.minDepthMm,
			maxDepthMm: form?.maxDepthMm,
			frontProtrusionMm: form?.frontProtrusionMm,
			containmentCapability: form?.containmentCapability,
		}
		this.mutate('add', 'rack', label, () => {
			this.racks = [...this.racks, newRack]
			this.normalizeRowOrders(this.activeRowId)
		})
	}

	addRackFromCatalog(product: CatalogProduct) {
		const base = rackFromCatalog(product)
		this.addRack({
			...base,
			type: product.kind === 'vcm' ? 'vcm' : '4-post',
			label: product.sku,
			frontProtrusionMm: base.frontProtrusionMm,
		})
	}

	deleteRack(rackId: string) {
		const rack = this.racks.find(r => r.id === rackId)
		if (!rack) return
		this.mutate('remove', 'rack', rack.label, () => {
			this.devices = this.devices.filter(d => d.rackId !== rackId)
			this.racks = this.racks.filter(r => r.id !== rackId)
		})
		this.deselect(rackId)
	}

	updateRack(rackId: string, updates: Partial<RackConfig>) {
		if (updates.heightU != null) {
			const rack = this.racks.find(r => r.id === rackId)
			if (rack && isRUType(rack.type)) updates.heightMm = rackHeightMm(updates.heightU)
		}
		this.mutate('update', 'rack', rackId, () => {
			this.racks = this.racks.map(r => r.id === rackId ? { ...r, ...updates } : r)
		})
	}

	reorderRacks(orderedIds: string[]) {
		this.mutate('update', 'rack', 'reorder', () => {
			this.racks = this.racks.map(r => {
				const idx = orderedIds.indexOf(r.id)
				return idx >= 0 ? { ...r, order: idx } : r
			})
		})
	}

	// ── Device CRUD ──

	/** Place a device into a rack — at positionU, or the first free RU from the bottom. */
	placeDevice(template: DeviceTemplate, rackId: string, positionU?: number, opts?: { mounting?: DeviceConfig['mounting'] }) {
		const targetRack = this.racks.find(r => r.id === rackId)
		if (!targetRack) return
		if (positionU == null) {
			const occupied = new Set<number>()
			for (const d of this.devices.filter(d => d.rackId === rackId)) {
				for (let u = d.positionU; u < d.positionU + d.heightU; u++) occupied.add(u)
			}
			const maxU = isRUType(targetRack.type)
				? targetRack.heightU
				: Math.floor(targetRack.heightMm / RU_HEIGHT_MM)
			positionU = 1
			while (occupied.has(positionU) && positionU <= maxU) positionU++
		}
		const id = `dev-${Date.now()}`
		const newDevice: DeviceConfig = {
			id,
			rackId,
			label: template.label,
			type: template.type,
			heightU: template.heightU,
			positionU,
			portCount: template.portCount,
			portType: template.portType,
			maker: template.maker,
			...(template.widthMm ? { widthMm: template.widthMm } : {}),
			...(opts?.mounting ? { mounting: opts.mounting } : {}),
			...(template.type === 'panel' ? {
				patchLevel: 'floor' as const,
				serverRoom: targetRack.serverRoom ?? this.room,
			} : {}),
		}
		this.mutate('add', 'device', `${template.label} in ${targetRack.label}`, () => {
			this.devices = [...this.devices, newDevice]
		})
		this.selection = new Set([id])
	}

	deleteDevice(deviceId: string) {
		const dev = this.devices.find(d => d.id === deviceId)
		if (!dev) return
		this.mutate('remove', 'device', dev.label, () => {
			this.devices = this.devices.filter(d => d.id !== deviceId)
		})
		this.deselect(deviceId)
	}

	updateDevice(deviceId: string, updates: Partial<DeviceConfig>) {
		this.mutate('update', 'device', deviceId, () => {
			this.devices = this.devices.map(d => d.id === deviceId ? { ...d, ...updates } : d)
		})
	}

	copyDevice(device: DeviceConfig, rackId: string, positionU: number, offsetX: number) {
		const rack = this.racks.find(r => r.id === rackId)
		const id = `dev-${Date.now()}`
		const { id: _, ...rest } = device
		this.mutate('copy', 'device', `${device.label} to ${rack?.label ?? rackId} RU${positionU}`, () => {
			this.devices = [...this.devices, { ...rest, id, rackId, positionU, offsetX }]
		})
		this.selection = new Set([id])
	}

	/** Delete everything currently selected (racks cascade their devices). */
	deleteSelection() {
		const racks = this.selectedRacks
		const devs = this.selectedDevices
		if (racks.length === 0 && devs.length === 0) return
		const rackIds = new Set(racks.map(r => r.id))
		const devIds = new Set(devs.map(d => d.id))
		const details = [
			racks.length ? `${racks.length} rack(s)` : '',
			devs.length ? `${devs.length} device(s)` : '',
		].filter(Boolean).join(', ')
		this.mutate('remove', 'selection', details, () => {
			this.devices = this.devices.filter(d => !devIds.has(d.id) && !rackIds.has(d.rackId))
			this.racks = this.racks.filter(r => !rackIds.has(r.id))
		})
		this.selection = new Set()
	}

	// ── Settings (reference lines) ──

	/** Live update during a line drag — no history entry per pixel. */
	setSettingLive(field: keyof RackSettings, value: number) {
		;(this.settings[field] as number) = value
	}

	/** Commit a completed line drag as one undoable step. */
	commitSetting(field: keyof RackSettings, beforeValue: number) {
		const afterValue = this.settings[field] as number
		if (afterValue === beforeValue) return
		const label = `update settings: ${field}`
		this.history.record({
			label,
			undo: () => { (this.settings[field] as number) = beforeValue; this.logChange('undo/redo', undefined, label) },
			redo: () => { (this.settings[field] as number) = afterValue; this.logChange('undo/redo', undefined, label) },
		})
		this.logChange('update', 'settings', field)
	}

	// ── Frames doc (labels + locations) ──

	private framesPayload() {
		return {
			zoneLocations: $state.snapshot(this.zoneLocations),
			portReservations: $state.snapshot(this.portReservations),
			portAssignments: $state.snapshot(this.portAssignments),
		}
	}

	logFramesChange(action: string, field?: string, details?: string) {
		const detail: ChangeDetail = { action }
		if (field !== undefined) detail.field = field
		if (details !== undefined) detail.details = details
		this.pendingFramesChanges.push(detail)
		this.framesAutosave.schedule(() => this.framesPayload())
	}

	/** Apply a remote frames-doc snapshot (also the initial load). */
	syncFrames(data: any) {
		this.framesData = data
		if (!data) return
		if (data.floorFormat) this.floorFormat = data.floorFormat
		const comparable = {
			zoneLocations: data.zoneLocations ?? {},
			portReservations: data.portReservations ?? [],
			portAssignments: data.portAssignments ?? {},
		}
		if (!this.framesAutosave.shouldApplyRemote(comparable)) return
		this.zoneLocations = data.zoneLocations ?? {}
		this.portReservations = data.portReservations ?? []
		this.portAssignments = data.portAssignments ?? {}
		this.nextReservationId = this.portReservations.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1
		const zones = Object.keys(this.zoneLocations).filter(z => this.zoneLocations[z]?.length > 0).sort()
		if (zones.length && !zones.includes(this.activeZone)) this.activeZone = zones[0]
	}

	private mutateLocations(action: string, details: string | undefined, fn: () => void) {
		const before = $state.snapshot(this.zoneLocations)
		fn()
		const after = $state.snapshot(this.zoneLocations)
		const label = `${action} locations${details ? `: ${details}` : ''}`
		this.history.record({
			label,
			undo: () => { this.zoneLocations = before as any; this.logFramesChange('undo/redo', undefined, label) },
			redo: () => { this.zoneLocations = after as any; this.logFramesChange('undo/redo', undefined, label) },
		})
		this.logFramesChange(action, 'locations', details)
	}

	setActiveZone(zone: string) {
		this.activeZone = zone
		this.locationSelection = new Set()
		this.lastLocationKey = null
	}

	/** Generate/extend the active zone's location list, preserving existing rows. */
	generateLocations(count: number) {
		const existing = this.zoneLocations[this.activeZone] ?? []
		const locs: LocationConfig[] = Array.from({ length: count }, (_, i) => {
			if (i < existing.length) return existing[i]
			return {
				locationNumber: i + 1,
				portCount: 2,
				serverRoomAssignment: ['A', 'A'],
				locationType: 'desk' as LocType,
			}
		})
		this.mutateLocations('generate', `zone ${this.activeZone}: ${count}`, () => {
			this.zoneLocations = { ...this.zoneLocations, [this.activeZone]: locs }
		})
	}

	/** Update one location row; a multi-selection applies the changed fields to all selected. */
	updateLocation(index: number, loc: LocationConfig) {
		const zone = this.activeZone
		const list = this.zoneLocations[zone] ?? []
		const original = list[index]
		if (!original) return

		const changedFields: Partial<LocationConfig> = {}
		if (loc.portCount !== original.portCount) changedFields.portCount = loc.portCount
		if (loc.locationType !== original.locationType) changedFields.locationType = loc.locationType
		if (loc.isHighLevel !== original.isHighLevel) changedFields.isHighLevel = loc.isHighLevel
		if (loc.roomNumber !== original.roomNumber) changedFields.roomNumber = loc.roomNumber
		if (JSON.stringify(loc.serverRoomAssignment) !== JSON.stringify(original.serverRoomAssignment)) {
			changedFields.serverRoomAssignment = loc.serverRoomAssignment
		}

		const editedKey = `${zone}-${original.locationNumber}`
		const applyToAll = this.locationSelection.size > 1 && this.locationSelection.has(editedKey)
			&& Object.keys(changedFields).length > 0

		this.mutateLocations('update', `zone ${zone} #${original.locationNumber}`, () => {
			if (applyToAll) {
				const locs = list.map(l => {
					const key = `${zone}-${l.locationNumber}`
					if (!this.locationSelection.has(key)) return l
					const updated = { ...l, ...changedFields }
					if ('portCount' in changedFields) {
						updated.serverRoomAssignment = Array.from({ length: changedFields.portCount! }, (_, j) =>
							l.serverRoomAssignment[j] || 'A')
					}
					return updated
				})
				this.zoneLocations = { ...this.zoneLocations, [zone]: locs }
			} else {
				const locs = [...list]
				locs[index] = loc
				this.zoneLocations = { ...this.zoneLocations, [zone]: locs }
			}
		})
	}

	selectLocation(key: string, e: MouseEvent | KeyboardEvent) {
		const keys = (this.zoneLocations[this.activeZone] ?? []).map(l => `${this.activeZone}-${l.locationNumber}`)
		if (e.shiftKey && this.lastLocationKey) {
			const startIdx = keys.indexOf(this.lastLocationKey)
			const endIdx = keys.indexOf(key)
			if (startIdx >= 0 && endIdx >= 0) {
				const range = keys.slice(Math.min(startIdx, endIdx), Math.max(startIdx, endIdx) + 1)
				this.locationSelection = new Set([...this.locationSelection, ...range])
			}
		} else if (e.ctrlKey || e.metaKey) {
			const next = new Set(this.locationSelection)
			next.has(key) ? next.delete(key) : next.add(key)
			this.locationSelection = next
			this.lastLocationKey = key
		} else {
			if (this.locationSelection.size === 1 && this.locationSelection.has(key)) {
				this.locationSelection = new Set()
				this.lastLocationKey = null
			} else {
				this.locationSelection = new Set([key])
				this.lastLocationKey = key
			}
		}
	}

	// ── Patching doc persistence ──

	private patchPayload() {
		return {
			connections: $state.snapshot(this.connections),
			customCableTypes: $state.snapshot(this.customCableTypes),
			settings: $state.snapshot(this.patchSettings),
		}
	}

	logPatchChange(action: string, field?: string, details?: string) {
		const detail: ChangeDetail = { action }
		if (field !== undefined) detail.field = field
		if (details !== undefined) detail.details = details
		this.pendingPatchChanges.push(detail)
		this.patchAutosave.schedule(() => this.patchPayload())
	}

	syncPatching(data: any) {
		if (!data) return
		const comparable = {
			connections: data.connections ?? [],
			customCableTypes: data.customCableTypes ?? [],
			settings: { ...DEFAULT_PATCH_SETTINGS, ...(data.settings ?? {}) },
		}
		if (!this.patchAutosave.shouldApplyRemote(comparable)) return
		this.connections = data.connections ?? []
		this.customCableTypes = data.customCableTypes ?? []
		this.patchSettings = { ...DEFAULT_PATCH_SETTINGS, ...(data.settings ?? {}) }
	}

	private mutatePatch(action: string, details: string | undefined, fn: () => void) {
		const before = $state.snapshot(this.connections)
		fn()
		const after = $state.snapshot(this.connections)
		const label = `${action} cord${details ? `: ${details}` : ''}`
		this.history.record({
			label,
			undo: () => { this.connections = before as PatchConnection[]; this.logPatchChange('undo/redo', undefined, label) },
			redo: () => { this.connections = after as PatchConnection[]; this.logPatchChange('undo/redo', undefined, label) },
		})
		this.logPatchChange(action, 'connection', details)
	}

	// ── Patching flow ──

	private portLabelOf(ref: { deviceId: string; portIndex: number }): string | undefined {
		return this.portInfo.get(`${ref.deviceId}:${ref.portIndex}`)?.label
	}

	/** Port click in patch mode: gate → select-existing → arm → connect. */
	patchPortClick(rackId: string, deviceId: string, portIndex: number) {
		const key = `${deviceId}:${portIndex}`
		const existing = this.portConnMap.get(key)

		// Port-level gate: unlabeled ports reject new cords (ux-plan). Selecting
		// them still works so the inspector can explain what to do.
		if (!this.portLabelOf({ deviceId, portIndex }) && !existing) {
			this.selectedPort = { deviceId, portIndex }
			this.statusHint = 'Unlabeled port — assign a location label before patching (see Inspector)'
			return
		}

		if (!this.patchArm) {
			if (existing) {
				// Click a patched port → select its cord
				this.selectConnection(existing.id)
				return
			}
			this.patchArm = { rackId, deviceId, portIndex, face: this.face }
			this.statusHint = 'Click another port to connect — Esc to cancel'
			return
		}

		// Same port again → disarm
		if (this.patchArm.deviceId === deviceId && this.patchArm.portIndex === portIndex) {
			this.patchArm = null
			this.statusHint = null
			return
		}
		if (existing) {
			this.statusHint = 'Port already patched — pick a free port'
			return
		}

		const fromRef = this.patchArm
		const toRef: PortRef = { rackId, deviceId, portIndex, face: this.face }
		const ct = getCableType(this.stickyCable.type, this.customCableTypes)
		const len = calculateCableLength(fromRef, toRef, $state.snapshot(this.racks), $state.snapshot(this.devices))
		const conn: PatchConnection = {
			id: `patch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
			fromPortRef: fromRef,
			toPortRef: toRef,
			cableType: this.stickyCable.type,
			cableColor: ct.color,
			lengthMeters: len,
			lengthLocked: false,
			kind: 'patch',
			status: this.stickyCable.status,
		}
		this.mutatePatch('add', `${this.portLabelOf(fromRef)} ↔ ${this.portLabelOf(toRef)}`, () => {
			this.connections = [...this.connections, conn]
		})
		this.patchArm = null
		this.statusHint = null
		this.selectConnection(conn.id)
	}

	selectConnection(id: string | null) {
		this.selectedConnectionId = id
		if (id) { this.selection = new Set(); this.selectedPort = null }
	}

	/** Re-route: next port click replaces one endpoint of this cord. */
	rerouteState = $state<{ connectionId: string; side: 'from' | 'to' } | null>(null)

	startReroute(connectionId: string, side: 'from' | 'to') {
		this.rerouteState = { connectionId, side }
		this.patchArm = null
		this.statusHint = `Click a port to re-route the ${side.toUpperCase()} endpoint — Esc to cancel`
	}

	/** Single port-click entry: re-route → patch mode → select. */
	handlePortClick(rackId: string, deviceId: string, portIndex: number) {
		if (this.rerouteState) {
			const { connectionId, side } = this.rerouteState
			const ref: PortRef = { rackId, deviceId, portIndex, face: this.face }
			this.updateConnection(connectionId, side === 'from' ? { fromPortRef: ref } : { toPortRef: ref })
			this.rerouteState = null
			this.statusHint = null
			this.selectConnection(connectionId)
			return
		}
		if (this.mode === 'patch') this.patchPortClick(rackId, deviceId, portIndex)
		else this.selectPort(deviceId, portIndex)
	}

	/** Bulk patch: N sequential cords between two panels, skipping occupied ports. */
	bulkPatch(fromDeviceId: string, toDeviceId: string, fromStart: number, toStart: number, count: number) {
		const fromDev = this.devices.find(d => d.id === fromDeviceId)
		const toDev = this.devices.find(d => d.id === toDeviceId)
		if (!fromDev || !toDev) return 0
		const used = new Set<string>()
		for (const c of this.elevationConnections) {
			used.add(`${c.fromPortRef.deviceId}:${c.fromPortRef.portIndex}`)
			used.add(`${c.toPortRef.deviceId}:${c.toPortRef.portIndex}`)
		}
		const free = (dev: typeof fromDev, start: number) => {
			const ports: number[] = []
			for (let p = Math.max(1, start); p <= (dev.portCount ?? 0) && ports.length < count; p++) {
				if (!used.has(`${dev.id}:${p}`) && this.portLabelOf({ deviceId: dev.id, portIndex: p })) ports.push(p)
			}
			return ports
		}
		const fromPorts = free(fromDev, fromStart)
		const toPorts = free(toDev, toStart)
		const n = Math.min(fromPorts.length, toPorts.length)
		if (n === 0) return 0
		const ct = getCableType(this.stickyCable.type, this.customCableTypes)
		const now = Date.now()
		const newConns: PatchConnection[] = []
		for (let i = 0; i < n; i++) {
			const fromRef: PortRef = { rackId: fromDev.rackId, deviceId: fromDev.id, portIndex: fromPorts[i], face: this.face }
			const toRef: PortRef = { rackId: toDev.rackId, deviceId: toDev.id, portIndex: toPorts[i], face: this.face }
			newConns.push({
				id: `patch-${now}-${Math.random().toString(36).slice(2, 6)}-${i}`,
				fromPortRef: fromRef, toPortRef: toRef,
				cableType: this.stickyCable.type, cableColor: ct.color,
				lengthMeters: calculateCableLength(fromRef, toRef, $state.snapshot(this.racks), $state.snapshot(this.devices)),
				lengthLocked: false, kind: 'patch', status: this.stickyCable.status,
			})
		}
		this.mutatePatch('add', `${n} bulk connections (${fromDev.label} → ${toDev.label})`, () => {
			this.connections = [...this.connections, ...newConns]
		})
		return n
	}

	/** Apply imported vendor cord IDs (connection id → cordId). */
	applyCordIds(cordMap: Map<string, string>): number {
		let updated = 0
		this.mutatePatch('import', 'cord IDs', () => {
			this.connections = this.connections.map(c => {
				const cordId = cordMap.get(c.id)
				if (cordId && cordId !== c.cordId) { updated++; return { ...c, cordId } }
				return c
			})
		})
		return updated
	}

	saveCustomCableTypes(types: CustomCableType[]) {
		this.customCableTypes = types
		this.logPatchChange('update', 'cableTypes', `${types.length} custom type(s)`)
	}

	savePatchSettings(s: PatchSettings) {
		this.patchSettings = s
		this.logPatchChange('update', 'settings')
	}

	private sameRef(a: PortRef, b: PortRef): boolean {
		return a.rackId === b.rackId && a.deviceId === b.deviceId && a.portIndex === b.portIndex && a.face === b.face
	}

	/** Update a cord; moving an installed cord's endpoint flips it to 'change' with history. */
	updateConnection(id: string, updates: Partial<PatchConnection>) {
		this.mutatePatch('update', id, () => {
			this.connections = this.connections.map(c => {
				if (c.id !== id) return c
				const updated = { ...c, ...updates }
				const movedFrom = updates.fromPortRef && !this.sameRef(c.fromPortRef, updates.fromPortRef)
				const movedTo = updates.toPortRef && !this.sameRef(c.toPortRef, updates.toPortRef)
				if ((movedFrom || movedTo) && c.status === 'installed') {
					updated.status = 'change'
					updated.previousFromRef = c.previousFromRef ?? c.fromPortRef
					updated.previousToRef = c.previousToRef ?? c.toPortRef
				}
				if (updated.status === 'change' && updated.previousFromRef && updated.previousToRef
					&& this.sameRef(updated.fromPortRef, updated.previousFromRef)
					&& this.sameRef(updated.toPortRef, updated.previousToRef)) {
					updated.status = 'installed'
					delete updated.previousFromRef
					delete updated.previousToRef
				}
				if (!updated.lengthLocked && (updates.fromPortRef || updates.toPortRef)) {
					const len = calculateCableLength(updated.fromPortRef, updated.toPortRef, $state.snapshot(this.racks), $state.snapshot(this.devices))
					if (len > 0) updated.lengthMeters = len
				}
				// Cable-type edits teach the sticky default
				if (updates.cableType) this.stickyCable = { ...this.stickyCable, type: updates.cableType }
				return updated
			})
		})
	}

	/** Soft delete: never-installed 'add' cords are removed; others flip to 'remove'. */
	deleteConnections(ids: string[]) {
		const idSet = new Set(ids)
		const purge: string[] = []
		this.mutatePatch('remove', `${ids.length} connection(s)`, () => {
			this.connections = this.connections.map(c => {
				if (!idSet.has(c.id)) return c
				if (c.status === 'add') { purge.push(c.id); return c }
				return { ...c, status: 'remove' as const, previousStatus: c.previousStatus ?? c.status }
			}).filter(c => !purge.includes(c.id))
		})
		if (this.selectedConnectionId && idSet.has(this.selectedConnectionId)) this.selectedConnectionId = null
	}

	restoreConnections(ids: string[]) {
		const idSet = new Set(ids)
		this.mutatePatch('restore', `${ids.length} connection(s)`, () => {
			this.connections = this.connections.map(c => {
				if (!idSet.has(c.id) || c.status !== 'remove') return c
				const restored = { ...c, status: c.previousStatus ?? 'installed' }
				delete restored.previousStatus
				return restored
			})
		})
	}

	setConnectionStatus(ids: string[], status: PatchStatus) {
		const idSet = new Set(ids)
		this.mutatePatch('status', `${ids.length} → ${status}`, () => {
			this.connections = this.connections.map(c => {
				if (!idSet.has(c.id)) return c
				const next: PatchConnection = { ...c, status, previousStatus: status === 'remove' ? (c.previousStatus ?? c.status) : c.previousStatus }
				if (status === 'installed') {
					delete next.previousFromRef
					delete next.previousToRef
					delete next.previousStatus
				}
				return next
			})
		})
		this.stickyCable = { ...this.stickyCable, status: status === 'remove' ? this.stickyCable.status : status }
	}

	purgeRemoved() {
		const count = this.removedCount
		if (count === 0) return
		this.mutatePatch('purge', `${count} removed`, () => {
			this.connections = this.connections.filter(c => c.status !== 'remove')
		})
	}

	// ── Block reservations (frames doc) ──

	private mutateReservations(action: string, details: string | undefined, fn: () => void) {
		const before = $state.snapshot(this.portReservations)
		fn()
		const after = $state.snapshot(this.portReservations)
		const label = `${action} reservations${details ? `: ${details}` : ''}`
		this.history.record({
			label,
			undo: () => { this.portReservations = before as PortReservation[]; this.logFramesChange('undo/redo', undefined, label) },
			redo: () => { this.portReservations = after as PortReservation[]; this.logFramesChange('undo/redo', undefined, label) },
		})
		this.logFramesChange(action, 'reservations', details)
	}

	private lastBlockPort: { rackId: string; positionU: number; deviceId: string; portIndex: number } | null = null

	private blockKey(rackId: string, positionU: number, portIndex: number): string {
		const row = portIndex <= 24 ? 'top' : 'bottom'
		const col = (portIndex - 1) % 24
		return `${rackId}:${positionU}:${row}:${col}`
	}

	/** Toggle a port in the block selection. Keys use portPosKey (rackId:ru:row:col). */
	togglePortBlock(rackId: string, positionU: number, portIndex: number, deviceId?: string) {
		const key = this.blockKey(rackId, positionU, portIndex)
		const next = new Set(this.selectedPorts)
		next.has(key) ? next.delete(key) : next.add(key)
		this.selectedPorts = next
		if (deviceId) this.lastBlockPort = { rackId, positionU, deviceId, portIndex }
	}

	/** Ctrl+Shift+click: select the whole range from the last Ctrl+clicked port
	 *  (same panel, row-major). Falls back to a toggle across panels. */
	rangePortBlock(rackId: string, positionU: number, portIndex: number, deviceId: string) {
		if (!this.lastBlockPort || this.lastBlockPort.deviceId !== deviceId) {
			this.togglePortBlock(rackId, positionU, portIndex, deviceId)
			return
		}
		const [a, b] = [this.lastBlockPort.portIndex, portIndex].sort((x, y) => x - y)
		const next = new Set(this.selectedPorts)
		for (let p = a; p <= b; p++) next.add(this.blockKey(rackId, positionU, p))
		this.selectedPorts = next
		this.lastBlockPort = { rackId, positionU, deviceId, portIndex }
	}

	/** Select every port of a panel into the block selection. */
	selectAllPortsOf(rackId: string, positionU: number, portCount: number) {
		const next = new Set(this.selectedPorts)
		for (let p = 1; p <= portCount; p++) next.add(this.blockKey(rackId, positionU, p))
		this.selectedPorts = next
	}

	isPortBlockSelected(rackId: string, positionU: number, portIndex: number): boolean {
		const row = portIndex <= 24 ? 'top' : 'bottom'
		const col = (portIndex - 1) % 24
		return this.selectedPorts.has(`${rackId}:${positionU}:${row}:${col}`)
	}

	clearPortBlock() { this.selectedPorts = new Set() }

	/** Reserve the selected ports for a location type (steers label allocation). */
	assignReservation(type: LocType) {
		const positions = [...this.selectedPorts].map(k => {
			const [frameId, ru, row, col] = k.split(':')
			return { frameId, ru: Number(ru), row: row as 'top' | 'bottom', col: Number(col) }
		})
		this.mutateReservations('assign', `${positions.length} port(s) → ${type}`, () => {
			let updated = this.portReservations.map(r => ({
				...r,
				ports: r.ports.filter(p => !this.selectedPorts.has(portPosKey(p))),
			})).filter(r => r.ports.length > 0)
			updated.push({ id: String(this.nextReservationId++), type, ports: positions })
			this.portReservations = updated
		})
		this.selectedPorts = new Set()
	}

	removeReservation() {
		this.mutateReservations('remove', `${this.selectedPorts.size} port(s)`, () => {
			this.portReservations = this.portReservations.map(r => ({
				...r,
				ports: r.ports.filter(p => !this.selectedPorts.has(portPosKey(p))),
			})).filter(r => r.ports.length > 0)
		})
		this.selectedPorts = new Set()
	}

	// ── Sticky label assignments (§3.7) ──

	/** portInfo must see local assignment edits immediately. */
	private framesDataForPipeline = $derived(this.framesData
		? { ...this.framesData, zoneLocations: this.zoneLocations, portReservations: this.portReservations, portAssignments: this.portAssignments }
		: null)

	private mutateFramesDoc(action: string, details: string | undefined, fn: () => void) {
		const before = {
			zl: $state.snapshot(this.zoneLocations),
			pr: $state.snapshot(this.portReservations),
			pa: $state.snapshot(this.portAssignments),
		}
		fn()
		const after = {
			zl: $state.snapshot(this.zoneLocations),
			pr: $state.snapshot(this.portReservations),
			pa: $state.snapshot(this.portAssignments),
		}
		const label = `${action}${details ? `: ${details}` : ''}`
		const apply = (s: typeof before) => {
			this.zoneLocations = s.zl as any
			this.portReservations = s.pr as any
			this.portAssignments = s.pa as any
			this.logFramesChange('undo/redo', undefined, label)
		}
		this.history.record({ label, undo: () => apply(before), redo: () => apply(after) })
		this.logFramesChange(action, 'labels', details)
	}

	/** Block-selected ports in physical order: rack (row order) → RU top-down → row → col. */
	orderedSelectedPorts(): { posKey: string; rackId: string; ru: number; row: 'top' | 'bottom'; col: number }[] {
		const rackOrder = new Map(this.activeRacks.map((r, i) => [r.id, i]))
		return [...this.selectedPorts].map(k => {
			const [rackId, ru, row, col] = k.split(':')
			return { posKey: k, rackId, ru: Number(ru), row: row as 'top' | 'bottom', col: Number(col) }
		}).sort((a, b) =>
			(rackOrder.get(a.rackId) ?? 99) - (rackOrder.get(b.rackId) ?? 99)
			|| b.ru - a.ru
			|| (a.row === b.row ? 0 : a.row === 'top' ? -1 : 1)
			|| a.col - b.col)
	}

	/** Auto-generate: create new locations in a zone and pin them to the selected ports. */
	assignPortsToNewLocations(opts: { zone: string; startNumber?: number; portsPerLocation: number; locationType: LocType; isHighLevel?: boolean; roomNumber?: string }): number {
		const ports = this.orderedSelectedPorts()
		if (ports.length === 0) return 0
		const existing = this.zoneLocations[opts.zone] ?? []
		const start = opts.startNumber ?? (existing.reduce((m, l) => Math.max(m, l.locationNumber), 0) + 1)
		const perLoc = Math.max(1, opts.portsPerLocation)
		const locCount = Math.ceil(ports.length / perLoc)

		this.mutateFramesDoc('auto-generate', `${locCount} location(s) → ${ports.length} port(s) in zone ${opts.zone}`, () => {
			const newLocs: LocationConfig[] = []
			const assignments = { ...this.portAssignments }
			for (let li = 0; li < locCount; li++) {
				const slice = ports.slice(li * perLoc, (li + 1) * perLoc)
				const locationNumber = start + li
				newLocs.push({
					locationNumber,
					portCount: perLoc,
					serverRoomAssignment: slice.map(p => {
						const rack = this.racks.find(r => r.id === p.rackId)
						return rack?.serverRoom ?? this.room
					}).concat(Array(Math.max(0, perLoc - slice.length)).fill('A')).slice(0, perLoc),
					locationType: opts.locationType,
					...(opts.roomNumber ? { roomNumber: opts.roomNumber } : {}),
					...(opts.isHighLevel ? { isHighLevel: true } : {}),
				})
				slice.forEach((p, pi) => {
					assignments[p.posKey] = { zone: opts.zone, locationNumber, port: pi + 1 }
				})
			}
			this.zoneLocations = { ...this.zoneLocations, [opts.zone]: [...existing, ...newLocs] }
			this.portAssignments = assignments
		})
		this.selectedPorts = new Set()
		return ports.length
	}

	/** Pin the selected ports to an existing location's ports (1..portCount). */
	assignPortsToLocation(zone: string, locationNumber: number): number {
		const ports = this.orderedSelectedPorts()
		const loc = (this.zoneLocations[zone] ?? []).find(l => l.locationNumber === locationNumber)
		if (!loc || ports.length === 0) return 0
		const n = Math.min(ports.length, loc.portCount)
		this.mutateFramesDoc('assign', `${n} port(s) → ${zone}-${locationNumber}`, () => {
			const assignments = { ...this.portAssignments }
			// Re-pinning a location moves it: drop its previous pins first
			for (const [k, a] of Object.entries(assignments)) {
				if (a.zone === zone && a.locationNumber === locationNumber) delete assignments[k]
			}
			for (let i = 0; i < n; i++) {
				assignments[ports[i].posKey] = { zone, locationNumber, port: i + 1 }
			}
			this.portAssignments = assignments
		})
		this.selectedPorts = new Set()
		return n
	}

	/** Remove sticky pins from the selected ports (labels fall back to auto-allocation). */
	clearPortAssignments() {
		const keys = [...this.selectedPorts].filter(k => this.portAssignments[k])
		if (keys.length === 0) { this.selectedPorts = new Set(); return }
		this.mutateFramesDoc('unpin', `${keys.length} port(s)`, () => {
			const assignments = { ...this.portAssignments }
			for (const k of keys) delete assignments[k]
			this.portAssignments = assignments
		})
		this.selectedPorts = new Set()
	}

	// ── Port selection ──

	selectPort(deviceId: string, portIndex: number) {
		this.selectedPort = { deviceId, portIndex }
		this.selection = new Set()
		// In select mode, clicking a patched port also selects its cord
		const conn = this.portConnMap.get(`${deviceId}:${portIndex}`)
		this.selectedConnectionId = conn?.id ?? null
	}

	clearPortSelection() { this.selectedPort = null }

	// ── Focus navigation ──

	focusRack(rackId: string, add = false) {
		if (add && this.focus) {
			if (!this.focus.rackIds.includes(rackId)) {
				this.focus = { rackIds: [...this.focus.rackIds, rackId] }
			}
		} else {
			this.focus = { rackIds: [rackId] }
		}
	}

	unfocusRack(rackId: string) {
		if (!this.focus) return
		const rackIds = this.focus.rackIds.filter(id => id !== rackId)
		this.focus = rackIds.length ? { rackIds } : null
	}

	popFocus() { this.focus = null }

	// ── Viewport fit / animation ──

	private viewAnim: number | null = null

	animateViewTo(target: { x: number; y: number; zoom: number }, duration = 220) {
		if (this.viewAnim) cancelAnimationFrame(this.viewAnim)
		const from = { x: this.view.x, y: this.view.y, zoom: this.view.zoom }
		const t0 = performance.now()
		const step = (now: number) => {
			const t = Math.min(1, (now - t0) / duration)
			const e = 1 - Math.pow(1 - t, 3) // ease-out cubic
			this.view.x = from.x + (target.x - from.x) * e
			this.view.y = from.y + (target.y - from.y) * e
			this.view.zoom = from.zoom + (target.zoom - from.zoom) * e
			this.viewAnim = t < 1 ? requestAnimationFrame(step) : null
		}
		this.viewAnim = requestAnimationFrame(step)
	}

	/** Animate the viewport to frame a rect (in unscaled canvas px). */
	fitRect(r: { left: number; top: number; width: number; height: number }, vpW: number, vpH: number, padPx = 40) {
		if (r.width <= 0 || r.height <= 0 || vpW <= 0 || vpH <= 0) return
		const zoom = Math.min(5, Math.max(0.1, Math.min((vpW - 2 * padPx) / r.width, (vpH - 2 * padPx) / r.height)))
		this.animateViewTo({
			x: (vpW - r.width * zoom) / 2 - r.left * zoom,
			y: (vpH - r.height * zoom) / 2 - r.top * zoom,
			zoom,
		})
	}

	// ── Row management ──

	addRow() {
		const id = `row-${Date.now()}`
		const label = `Row ${String.fromCharCode(65 + this.rows.length)}`
		this.mutate('add', 'row', label, () => {
			this.rows = [...this.rows, { id, label }]
		})
		this.activeRowId = id
	}

	renameRow(rowId: string, label: string) {
		this.mutate('update', 'row', `rename ${rowId}`, () => {
			this.rows = this.rows.map(r => r.id === rowId ? { ...r, label } : r)
		})
	}

	updateRowDefaults(rowId: string, partial: Record<string, unknown>) {
		this.mutate('update', 'row', `defaults ${rowId}`, () => {
			this.rows = this.rows.map(r => {
				if (r.id !== rowId) return r
				const next = { ...(r.defaults ?? {}) }
				for (const [k, v] of Object.entries(partial)) {
					if (v === undefined) delete (next as any)[k]
					else (next as any)[k] = v
				}
				return { ...r, defaults: Object.keys(next).length ? next : undefined }
			})
		})
	}

	quickFillRow(rowId: string, kind: 'rack' | 'vcm', productId: string) {
		const product = this.catalog.find(p => p.id === productId)
		if (!product) return
		const base = rackFromCatalog(product)
		const targetType = kind === 'vcm' ? 'vcm' : '4-post'
		const isTargetKind = (r: RackConfig) => kind === 'vcm' ? r.type === 'vcm' : r.type !== 'vcm'
		let count = 0
		this.mutate('update', 'row', `quick-fill ${kind}s with ${product.sku}`, () => {
			this.racks = this.racks.map(r => {
				if (r.rowId !== rowId || !isTargetKind(r)) return r
				count++
				return {
					...r,
					...base,
					type: targetType as any,
					heightMm: kind === 'vcm' ? r.heightMm : rackHeightMm(base.heightU),
					frontProtrusionMm: base.frontProtrusionMm,
				}
			})
		})
	}

	/** V-R-V-R-…-V interleave (Panduit convention): racks odd orders, VCMs even. */
	private normalizeRowOrders(rowId: string) {
		const items = this.racks.filter(r => r.rowId === rowId).sort((a, b) => a.order - b.order)
		if (items.length === 0) return
		const rackItems = items.filter(r => r.type !== 'vcm')
		const vcmItems = items.filter(r => r.type === 'vcm')
		const R = rackItems.length
		const updates = new Map<string, number>()
		rackItems.forEach((r, i) => updates.set(r.id, 2 * i + 1))
		vcmItems.forEach((v, i) => {
			const pos = i <= R ? 2 * i : 2 * R + 2 * (i - R)
			updates.set(v.id, pos)
		})
		this.racks = this.racks.map(r =>
			updates.has(r.id) && updates.get(r.id) !== r.order
				? { ...r, order: updates.get(r.id)! }
				: r
		)
	}

	addRacksFromCatalog(rowId: string, productId: string, count: number) {
		const product = this.catalog.find(p => p.id === productId)
		if (!product || count < 1) return
		if (product.kind !== 'rack' && product.kind !== 'vcm') return
		const base = rackFromCatalog(product)
		const isVcm = product.kind === 'vcm'
		const heightMm = rackHeightMm(base.heightU)
		const prefix = isVcm ? 'V' : 'R'
		const now = Date.now()
		let order = this.racks.filter(r => r.rowId === rowId).length
		const newRacks: RackConfig[] = []
		for (let i = 0; i < count; i++) {
			order++
			newRacks.push({
				id: `rack-${now}-${i}`,
				label: `${prefix}${String(order).padStart(2, '0')}`,
				rowId,
				order: order - 1,
				heightU: base.heightU,
				heightMm,
				widthMm: base.widthMm,
				depthMm: base.depthMm,
				type: (isVcm ? 'vcm' : '4-post') as any,
				serverRoom: this.room,
				maker: base.maker,
				model: base.model,
				sku: base.sku,
				productRef: base.productRef,
				color: base.color,
				adjustable: base.adjustable,
				minDepthMm: base.minDepthMm,
				maxDepthMm: base.maxDepthMm,
				frontProtrusionMm: base.frontProtrusionMm,
				containmentCapability: base.containmentCapability,
			})
		}
		this.mutate('add', 'rack', `Added ${count} × ${product.sku}`, () => {
			this.racks = [...this.racks, ...newRacks]
			this.normalizeRowOrders(rowId)
		})
	}

	copyRowDefaultsToAllRacks(rowId: string) {
		const row = this.rows.find(r => r.id === rowId)
		const d = row?.defaults
		if (!d) return
		this.mutate('update', 'row', `apply defaults ${rowId}`, () => {
			this.racks = this.racks.map(r => {
				if (r.rowId !== rowId) return r
				const updates: Partial<RackConfig> = {}
				if (d.heightU != null && r.type !== 'vcm' && r.heightU !== d.heightU) {
					updates.heightU = d.heightU
					updates.heightMm = rackHeightMm(d.heightU)
				}
				if (d.color && r.color !== d.color) updates.color = d.color
				if (d.depthMm != null && r.depthMm !== d.depthMm) updates.depthMm = d.depthMm
				if (Object.keys(updates).length === 0) return r
				return { ...r, ...updates }
			})
		})
	}

	deleteRow(rowId: string) {
		const row = this.rows.find(r => r.id === rowId)
		if (!row) return
		this.mutate('remove', 'row', row.label, () => {
			const rackIds = new Set(this.racks.filter(r => r.rowId === rowId).map(r => r.id))
			this.devices = this.devices.filter(d => !rackIds.has(d.rackId))
			this.racks = this.racks.filter(r => r.rowId !== rowId)
			this.rows = this.rows.filter(r => r.id !== rowId)
		})
		if (this.activeRowId === rowId) this.activeRowId = this.rows[0]?.id ?? ''
	}
}
