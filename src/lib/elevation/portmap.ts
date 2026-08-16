/**
 * The single racks → frames → port-labels pipeline.
 *
 * `deriveFramesFromRacks` turns the Racks tool's per-room doc data into the
 * `FrameConfig[]` the frames label engine consumes, and `buildPortInfoMap`
 * resolves rack devices/ports to their canonical Frames labels. This logic
 * previously existed in three drifting copies (Frames.svelte, frames engine,
 * patching elevationUtils) — this module is now the only implementation.
 *
 * Note: types and the label engine still live under
 * `routes/projects/[pid]/frames/parts/` — they migrate to `$lib` with the
 * Elevations tool (see elevations-plan.md); this module is the seam.
 */
import type {
	FrameConfig, PanelDevice, FrameSlot, PortLabel, LocType, PortReservation,
	LocationConfig,
} from '../../routes/projects/[pid]/frames/parts/types'
import { portPosKey } from '../../routes/projects/[pid]/frames/parts/types'
import { generatePortLabels, generateRacks } from '../../routes/projects/[pid]/frames/parts/engine'

/** Does a device's mounting setting include the given face? */
export function matchesFace(dev: { mounting?: string }, face: 'front' | 'rear'): boolean {
	const m = dev.mounting ?? 'both'
	return m === 'both' || m === 'none' || m === face
}

/**
 * Derive `FrameConfig[]` from the racks tool's per-room data
 * (`Record<room, racksDoc>`). Falls back to the `legacyFrames` argument when
 * the racks data contains no frames (empty project / old doc shape).
 */
export function deriveFramesFromRacks(
	rData: Record<string, any>,
	face: 'front' | 'rear',
	legacyFrames?: FrameConfig[],
): FrameConfig[] {
	const derived: FrameConfig[] = []
	for (const [, doc] of Object.entries(rData)) {
		if (!doc?.racks) continue
		for (const rack of doc.racks as any[]) {
			if (!rack.serverRoom) continue
			if (rack.type === 'desk' || rack.type === 'shelf' || rack.type === 'vcm') continue

			const rackDevices = ((doc.devices ?? []) as any[]).filter(
				(d: any) => d.rackId === rack.id && matchesFace(d, face),
			)

			// PDUs excluded — their 0U rendering is broken (see frames implementation.md TODO).
			const slots: FrameSlot[] = []
			for (const dev of rackDevices) {
				if (dev.type !== 'panel' && dev.type !== 'pdu') {
					slots.push({ ru: dev.positionU, type: dev.type, height: dev.heightU, label: dev.label })
				}
			}

			const copperPanels = rackDevices.filter((d: any) => d.type === 'panel')
			const floorPanels = copperPanels.filter((d: any) => d.patchLevel !== 'high')
			const highPanels = copperPanels.filter((d: any) => d.patchLevel === 'high')

			const panelDevices: PanelDevice[] = copperPanels.map((d: any) => ({
				ru: d.positionU as number,
				portCount: (d.portCount as number) || 48,
				isHighLevel: d.patchLevel === 'high',
			}))

			derived.push({
				id: rack.id,
				name: rack.label,
				serverRoom: rack.serverRoom,
				totalRU: rack.heightU ?? 42,
				panelStartRU: floorPanels.length ? Math.min(...floorPanels.map((d: any) => d.positionU)) : 1,
				panelEndRU: floorPanels.length ? Math.max(...floorPanels.map((d: any) => d.positionU + d.heightU - 1)) : rack.heightU ?? 42,
				hlPanelStartRU: highPanels.length ? Math.min(...highPanels.map((d: any) => d.positionU)) : undefined,
				hlPanelEndRU: highPanels.length ? Math.max(...highPanels.map((d: any) => d.positionU + d.heightU - 1)) : undefined,
				slots,
				panelDevices,
			})
		}
	}
	return derived.length > 0 ? derived : (legacyFrames ?? [])
}

/**
 * Build the reservation lookup the label engine expects:
 * `Map<"frameId:ru:row:col", LocType>` from the stored `PortReservation[]`.
 * (Passing the raw array — or `Object.entries` of it — silently disables
 * reservation-aware allocation; always go through this.)
 */
export function buildReservationMap(portReservations?: PortReservation[] | null): Map<string, LocType> {
	return new Map(
		(portReservations ?? []).flatMap(r =>
			r.ports.map(p => [portPosKey(p), r.type] as [string, LocType]),
		),
	)
}

// ── Stable location ids (labels v2, elevations-plan §11 L0) ──

/** Deterministic id for a location that doesn't have one yet: `L{zone}{number}`,
 *  suffixed `_2`, `_3`… on collision with an already-used id. */
export function locationIdFor(zone: string, locationNumber: number, used: Set<string>): string {
	let id = `L${zone}${locationNumber}`
	for (let n = 2; used.has(id); n++) id = `L${zone}${locationNumber}_${n}`
	used.add(id)
	return id
}

/**
 * Fill in missing `LocationConfig.id`s deterministically (same input doc →
 * same ids on every client, so concurrent sessions converge before the repair
 * is persisted). Mirror of the reservation-id repair. Callers persist the
 * repaired doc on the next edit; `changed` is false when nothing was missing.
 */
export function repairLocationIds(
	zoneLocations: Record<string, LocationConfig[]> | undefined | null,
): { zoneLocations: Record<string, LocationConfig[]>; changed: boolean } {
	const src = zoneLocations ?? {}
	const used = new Set<string>()
	for (const locs of Object.values(src)) {
		for (const l of locs ?? []) if (l.id) used.add(l.id)
	}
	let changed = false
	const out: Record<string, LocationConfig[]> = {}
	for (const [zone, locs] of Object.entries(src)) {
		out[zone] = (locs ?? []).map(l => {
			if (l.id) return l
			changed = true
			return { ...l, id: locationIdFor(zone, l.locationNumber, used) }
		})
	}
	return { zoneLocations: out, changed }
}

const ROOM_LETTERS = ['A', 'B', 'C', 'D']

/**
 * Server-room count for label distribution when the authoritative value
 * (`projects.floors[].serverRoomCount`) isn't available. Derived from the
 * rooms actually referenced by locations' per-port assignments and by the
 * frames themselves, so rooms B–D are never silently dropped. The stored
 * `explicit` value (legacy frames-doc field) is honoured as a lower bound.
 */
export function deriveServerRoomCount(
	zoneLocations: Record<string, { serverRoomAssignment?: string[] }[]> | undefined | null,
	frames: { serverRoom: string }[] = [],
	explicit?: number,
): number {
	let max = 1
	for (const locs of Object.values(zoneLocations ?? {})) {
		for (const loc of locs ?? []) {
			for (const letter of loc.serverRoomAssignment ?? []) {
				max = Math.max(max, ROOM_LETTERS.indexOf(letter) + 1)
			}
		}
	}
	for (const f of frames) {
		max = Math.max(max, ROOM_LETTERS.indexOf(f.serverRoom) + 1)
	}
	return Math.min(Math.max(max, explicit ?? 1), 4)
}

/** Info resolved for a port from frames data */
export interface PortInfo {
	label: string
	locationType: string
	/** True when this label is pinned to the port via portAssignments. */
	pinned?: boolean
	/** True when the label is a free-form per-device override (DeviceConfig.portLabels). */
	override?: boolean
	/** True when the label is a baked (stored) string, not a live engine derivation. */
	baked?: boolean
	/** Structural source of the label, when known: the location + its port.
	 *  Present for engine-derived, pinned and baked labels (not overrides). */
	locationId?: string
	locationPort?: number
}

/**
 * A baked label (labels v2 L2): the stored string is the truth — generation
 * wrote it once and only an explicit Sync re-bake changes it. Keyed
 * `deviceId:portIndex` in the frames doc (`bakedLabels`) so labels move with
 * their panel. locationId/port keep the structural link for sync + divergence.
 */
export interface BakedLabel {
	label: string
	locationId?: string
	/** 1-based port index within the location. */
	port?: number
}

/** Display fallback for a port with no assigned label (rack-RU#-port#). */
export function fallbackPortLabel(rackLabel: string, positionU: number, portIndex: number): string {
	return `${rackLabel}-U${positionU}-P${portIndex}`
}

/**
 * Sticky allocation (elevations-plan.md §3.7): pins a specific location port
 * to a physical panel position. Stored in the frames doc as
 * `portAssignments: Record<portPosKey, PortAssignment>`. Auto-generation only
 * fills unpinned cells, so re-generating a zone never moves pinned labels.
 */
export interface PortAssignment {
	/** Stable location id (L0+) — survives renumbering. New pins always carry it. */
	locationId?: string
	/** Legacy identity, kept alongside locationId for mixed-version clients. */
	zone?: string
	locationNumber?: number
	/** 1-based port index within the location. */
	port: number
}

/** All lookup keys an assignment can resolve a label by (id form preferred). */
function assignmentKeys(a: PortAssignment): string[] {
	const ks: string[] = []
	if (a.locationId) ks.push(`id:${a.locationId}:${a.port}`)
	if (a.zone != null && a.locationNumber != null) ks.push(`zl:${a.zone}:${a.locationNumber}:${a.port}`)
	return ks
}

/** All keys a generated label can be found under. */
function labelKeys(l: PortLabel): string[] {
	const ks: string[] = []
	if (l.locationId) ks.push(`id:${l.locationId}:${l.portNumber}`)
	ks.push(`zl:${l.zone}:${l.locationNumber}:${l.portNumber}`)
	return ks
}

/** Sentinel reservation type: blocks the engine from auto-filling a pinned cell. */
const PINNED = '__pinned'

/**
 * Build a map of `deviceId:portIndex` → PortInfo by matching racks devices
 * to frames panel data via RU position within the same server room.
 *
 * `frameData.zoneLocations` is `Record<zoneLetter, LocationConfig[]>`.
 * Frame configs are derived from racks data at runtime (not stored in
 * Firestore). Allocation uses the front face — panels are front-mounted by
 * convention and this matches the Frames tool's default view and the
 * drawings viewports.
 */
export function buildPortInfoMap(
	frameData: any,
	room: string,
	devices: any[],
	racks: any[],
	floor: number = 1,
	serverRoomCount?: number,
	floorFormat: string = 'L01',
): Map<string, PortInfo> {
	const map = new Map<string, PortInfo>()
	if (!frameData) return map

	// Ensure ids even when the doc predates the L0 repair — deterministic, so
	// the ids match what syncFrames will persist.
	const zoneLocations: Record<string, any[]> = repairLocationIds(frameData.zoneLocations).zoneLocations
	const zoneLetters = Object.keys(zoneLocations).filter(k => zoneLocations[k]?.length > 0).sort()
	if (zoneLetters.length === 0) return map

	const frameConfigs = deriveFramesFromRacks({ [room]: { racks, devices } }, 'front', frameData.frames)
	const reservations = buildReservationMap(frameData.portReservations)
	const roomCount = deriveServerRoomCount(zoneLocations, frameConfigs, serverRoomCount)

	// Pinned assignments: block their cells from auto-fill (sentinel reservation
	// type that never matches a locationType) and withhold their labels from the
	// engine — they are overlaid onto their pinned positions at the end.
	const assignments: Record<string, PortAssignment> = frameData.portAssignments ?? {}
	const pinnedLabelKeys = new Set(Object.values(assignments).flatMap(assignmentKeys))
	for (const posKey of Object.keys(assignments)) {
		if (!reservations.has(posKey)) reservations.set(posKey, PINNED as any)
	}

	// Project-level label format (separator preset, zone/room inclusion). Falls back
	// to legacy hybrid format if not set on the frames doc.
	const labelFormat = frameData.labelFormat
		? {
			separator: frameData.labelFormat.separator ?? 'legacy',
			includeZone: frameData.labelFormat.includeZone ?? true,
			includeRoom: frameData.labelFormat.includeRoom ?? false,
			...(frameData.labelFormat.template ? { template: frameData.labelFormat.template } : {}),
		}
		: undefined

	// Generate all port labels for all zones on this floor
	const allLabels: PortLabel[] = []
	for (const z of zoneLetters) {
		allLabels.push(...generatePortLabels(
			{ floor, zone: z, serverRoomCount: roomCount, locations: zoneLocations[z] },
			floorFormat,
			labelFormat as any,
		))
	}
	if (allLabels.length === 0) return map

	/** Lookup for pinned overlays: label findable by id form and legacy form. */
	const labelByKey = new Map(allLabels.flatMap(l => labelKeys(l).map(k => [k, l] as [string, PortLabel])))
	const freeLabels = pinnedLabelKeys.size
		? allLabels.filter(l => !labelKeys(l).some(k => pinnedLabelKeys.has(k)))
		: allLabels

	const rackDataList = generateRacks(
		freeLabels, roomCount,
		frameConfigs.length > 0 ? frameConfigs : undefined,
		reservations.size > 0 ? reservations : undefined,
	)

	// Filter to frames in the current server room
	const roomRacks = rackDataList.filter(rd => rd.frame.serverRoom === room)

	// Build RU → PortLabel[] lookup from frames panels
	const ruToLabels = new Map<number, (PortLabel | null)[]>()
	for (const rd of roomRacks) {
		for (const panel of rd.panels) {
			ruToLabels.set(panel.ru, [...panel.topRow, ...panel.bottomRow])
		}
	}

	// Match racks devices to frame panels by RU position
	for (const device of devices) {
		if (!device.portCount || device.type !== 'panel') continue

		const labels = ruToLabels.get(device.positionU)

		for (let i = 0; i < device.portCount; i++) {
			// Pinned assignment overrides whatever the engine placed here
			const row = i < 24 ? 'top' : 'bottom'
			const col = i % 24
			const assignment = assignments[`${device.rackId}:${device.positionU}:${row}:${col}`]
			if (assignment) {
				const pinnedLabel = assignmentKeys(assignment).map(k => labelByKey.get(k)).find(Boolean)
				if (pinnedLabel) {
					map.set(`${device.id}:${i + 1}`, {
						label: pinnedLabel.label,
						locationType: pinnedLabel.locationType,
						pinned: true,
						...(pinnedLabel.locationId ? { locationId: pinnedLabel.locationId, locationPort: pinnedLabel.portNumber } : {}),
					})
					continue
				}
			}
			const portLabel = labels?.[i]
			if (portLabel) {
				map.set(`${device.id}:${i + 1}`, {
					label: portLabel.label,
					locationType: portLabel.locationType,
					...(portLabel.locationId ? { locationId: portLabel.locationId, locationPort: portLabel.portNumber } : {}),
				})
			}
		}
	}

	// Baked labels overlay everything the engine derived: once a label string is
	// stored it is the truth until an explicit Sync re-bakes it (§11 L2).
	const bakedLabels: Record<string, BakedLabel> = frameData.bakedLabels ?? {}
	const bakedKeys = Object.keys(bakedLabels)
	if (bakedKeys.length) {
		const deviceIds = new Set(devices.map(d => d.id))
		const typeById = new Map<string, string>()
		for (const locs of Object.values(zoneLocations)) {
			for (const l of locs ?? []) if (l.id) typeById.set(l.id, l.locationType)
		}
		for (const key of bakedKeys) {
			const b = bakedLabels[key]
			if (!b?.label || !deviceIds.has(key.split(':')[0])) continue
			map.set(key, {
				label: b.label,
				locationType: (b.locationId ? typeById.get(b.locationId) : undefined)
					?? map.get(key)?.locationType ?? 'N/A',
				baked: true,
				...(b.locationId ? { locationId: b.locationId, locationPort: b.port } : {}),
			})
		}
	}

	return map
}
