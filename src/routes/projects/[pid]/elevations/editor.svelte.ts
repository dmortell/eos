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
import { buildPortInfoMap, buildReservationMap } from '$lib/elevation/portmap'
import type {
	RackConfig, DeviceConfig, DeviceTemplate, RackRow, RackSettings, RoomObject, ViewState, ElevationFace,
} from '../racks/parts/types'
import type { LocationConfig, LocType } from '../frames/parts/types'
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
	activeZone = $state('A')
	floorFormat = $state('L01')
	/** Authoritative per-floor server-room count (projects.floors). */
	serverRoomCountCfg = $state(1)

	// ── UI state ──
	face = $state<ElevationFace>('front')
	activeRowId = $state('default')
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

	constructor(private callbacks: EditorCallbacks = {}) {
		this.autosave = new AutoSave((payload) => {
			this.callbacks.onsave?.(payload, this.pendingChanges)
			this.pendingChanges = []
		})
		this.framesAutosave = new AutoSave((payload) => {
			this.callbacks.onsaveframes?.(payload, this.pendingFramesChanges)
			this.pendingFramesChanges = []
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

	/** Canonical port labels: `deviceId:portIndex` → { label, locationType }. */
	portInfo = $derived.by(() => {
		const frameData = this.framesData
			? { ...this.framesData, zoneLocations: this.zoneLocations }
			: (Object.keys(this.zoneLocations).length ? { zoneLocations: this.zoneLocations } : null)
		return buildPortInfoMap(frameData, this.room, this.devices, this.racks, this.floor, this.serverRoomCountCfg, this.floorFormat)
	})

	reservationMap = $derived(buildReservationMap(this.framesData?.portReservations))

	focusedRackIds = $derived(new Set(this.focus?.rackIds ?? []))

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

	clearSelection() { this.selection = new Set(); this.selectedPort = null }

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

	logFramesChange(action: string, field?: string, details?: string) {
		const detail: ChangeDetail = { action }
		if (field !== undefined) detail.field = field
		if (details !== undefined) detail.details = details
		this.pendingFramesChanges.push(detail)
		this.framesAutosave.schedule(() => ({ zoneLocations: $state.snapshot(this.zoneLocations) }))
	}

	/** Apply a remote frames-doc snapshot (also the initial load). */
	syncFrames(data: any) {
		this.framesData = data
		if (!data) return
		if (data.floorFormat) this.floorFormat = data.floorFormat
		if (!this.framesAutosave.shouldApplyRemote({ zoneLocations: data.zoneLocations ?? {} })) return
		this.zoneLocations = data.zoneLocations ?? {}
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

	// ── Port selection ──

	selectPort(deviceId: string, portIndex: number) {
		this.selectedPort = { deviceId, portIndex }
		this.selection = new Set()
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
