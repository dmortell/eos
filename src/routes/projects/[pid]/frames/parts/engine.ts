import type { ZoneConfig, PortLabel, PanelData, PanelDevice, RackData, FrameConfig, LocType } from './types'
import { defaultFrameConfig } from './types'

/** Format a floor number according to the floorFormat setting */
export function formatFloor(fl: number, fmt: string = 'L01'): string {
	const n = String(fl).padStart(2, '0')
	if (fmt === '01F') return `${n}F`
	if (fmt === '01') return n
	return `L${n}`
}

/** Generate port labels for all locations in a zone */
export function generatePortLabels(zone: ZoneConfig, floorFormat: string = 'L01'): PortLabel[] {
	const labels: PortLabel[] = []
	const ff = formatFloor(zone.floor, floorFormat)
	const z = zone.zone

	for (const loc of zone.locations) {
		// N/A locations are excluded from the patch frame
		if (loc.locationType === 'N/A') continue

		const nnn = String(loc.locationNumber).padStart(3, '0')
		const isHL = loc.isHighLevel ?? false

		for (let p = 0; p < loc.portCount; p++) {
			const s = loc.serverRoomAssignment[p] || 'A'
			const pp = String(p + 1).padStart(2, '0')
			const suffix = isHL ? '-H' : ''

			labels.push({
				label: `${ff}.${z}.${nnn}-${s}${pp}${suffix}`,
				zone: z,
				serverRoom: s,
				locationNumber: loc.locationNumber,
				portNumber: p + 1,
				locationType: loc.locationType,
				isHighLevel: isHL,
			})
		}
	}

	return labels
}

/** Build a single PanelData for a panel device, filling it with labels from the offset */
function buildOnePanel(
	labels: PortLabel[], offset: number,
	device: PanelDevice, panelNumber: number
): PanelData {
	const pc = device.portCount
	const chunk = labels.slice(offset, offset + pc)

	if (pc <= 24) {
		// 24-port panel: single row of up to 24
		const topRow: (PortLabel | null)[] = Array.from({ length: pc }, (_, j) => chunk[j] ?? null)
		return { panelNumber, ru: device.ru, topRow, bottomRow: [], isHighLevel: device.isHighLevel, portCount: pc }
	} else {
		// 48-port panel: two rows of 24
		const topRow: (PortLabel | null)[] = Array.from({ length: 24 }, (_, j) => chunk[j] ?? null)
		const bottomRow: (PortLabel | null)[] = Array.from({ length: 24 }, (_, j) => chunk[j + 24] ?? null)
		return { panelNumber, ru: device.ru, topRow, bottomRow, isHighLevel: device.isHighLevel, portCount: pc }
	}
}

/** Build panels for a list of panel devices, distributing labels across them.
 *  Each panel is placed at its actual RU with its actual port count. */
function buildPanelsForDevices(
	labels: PortLabel[],
	devices: PanelDevice[],
	startingPanel: number
): PanelData[] {
	if (devices.length === 0) return []

	// Sort devices by RU descending (top-down in rack)
	const sorted = [...devices].sort((a, b) => b.ru - a.ru)
	const panels: PanelData[] = []
	let offset = 0

	for (let i = 0; i < sorted.length; i++) {
		panels.push(buildOnePanel(labels, offset, sorted[i], startingPanel + i))
		offset += sorted[i].portCount
	}

	return panels
}

/**
 * Reservation-aware panel builder.
 * 1. Place labels whose locationType matches a reserved slot into that slot.
 * 2. Fill remaining unreserved slots sequentially with leftover labels.
 */
function buildPanelsWithReservations(
	labels: PortLabel[],
	devices: PanelDevice[],
	startingPanel: number,
	frameId: string,
	reservations: Map<string, LocType>,
): PanelData[] {
	if (devices.length === 0) return []

	const sorted = [...devices].sort((a, b) => b.ru - a.ru)

	// Build empty panel grid: array of { ru, slots: (PortLabel | null)[] }
	const panelSlots: { device: PanelDevice; slots: (PortLabel | null)[] }[] =
		sorted.map(d => ({ device: d, slots: Array(d.portCount).fill(null) }))

	// Index: for each slot, what reservation type (if any)?
	// Slot index within a panel: top row 0..23, bottom row 24..47
	const slotReservations: (LocType | null)[][] = panelSlots.map(({ device }) => {
		const pc = device.portCount
		const res: (LocType | null)[] = []
		const topCols = Math.min(pc, 24)
		for (let col = 0; col < topCols; col++) {
			const key = `${frameId}:${device.ru}:top:${col}`
			res.push(reservations.get(key) ?? null)
		}
		if (pc > 24) {
			for (let col = 0; col < 24; col++) {
				const key = `${frameId}:${device.ru}:bottom:${col}`
				res.push(reservations.get(key) ?? null)
			}
		}
		return res
	})

	// Split labels into buckets by locationType
	const byType = new Map<string, PortLabel[]>()
	for (const l of labels) {
		const list = byType.get(l.locationType) ?? []
		list.push(l)
		byType.set(l.locationType, list)
	}
	// Track consumed labels per type
	const typeOffsets = new Map<string, number>()

	// Pass 1: fill reserved slots with matching-type labels
	for (let p = 0; p < panelSlots.length; p++) {
		for (let s = 0; s < panelSlots[p].slots.length; s++) {
			const resType = slotReservations[p][s]
			if (!resType) continue
			const bucket = byType.get(resType)
			if (!bucket) continue
			const off = typeOffsets.get(resType) ?? 0
			if (off < bucket.length) {
				panelSlots[p].slots[s] = bucket[off]
				typeOffsets.set(resType, off + 1)
			}
		}
	}

	// Pass 2: collect all remaining (unplaced) labels in original order
	const placed = new Set<PortLabel>()
	for (const ps of panelSlots) {
		for (const slot of ps.slots) {
			if (slot) placed.add(slot)
		}
	}
	const remaining = labels.filter(l => !placed.has(l))

	// Pass 3: fill unreserved (null-reservation) empty slots with remaining labels
	let remIdx = 0
	for (let p = 0; p < panelSlots.length; p++) {
		for (let s = 0; s < panelSlots[p].slots.length; s++) {
			if (panelSlots[p].slots[s] !== null) continue  // already filled
			if (slotReservations[p][s] !== null) continue   // reserved but no matching label — leave empty
			if (remIdx >= remaining.length) break
			panelSlots[p].slots[s] = remaining[remIdx++]
		}
	}

	// Convert to PanelData
	return panelSlots.map(({ device, slots }, i) => {
		const pc = device.portCount
		if (pc <= 24) {
			return {
				panelNumber: startingPanel + i,
				ru: device.ru,
				topRow: slots.slice(0, pc),
				bottomRow: [],
				isHighLevel: device.isHighLevel,
				portCount: pc,
			}
		}
		return {
			panelNumber: startingPanel + i,
			ru: device.ru,
			topRow: slots.slice(0, 24),
			bottomRow: slots.slice(24, 48),
			isHighLevel: device.isHighLevel,
			portCount: pc,
		}
	})
}

/** Lay out labels into 48-port panels (legacy fallback when no panelDevices) */
function buildPanelsLegacy(labels: PortLabel[], isHighLevel: boolean, startingPanel: number): PanelData[] {
	if (labels.length === 0) return []

	const panelCount = Math.ceil(labels.length / 48)
	const panels: PanelData[] = []

	for (let i = 0; i < panelCount; i++) {
		const chunk = labels.slice(i * 48, (i + 1) * 48)
		const topRow: (PortLabel | null)[] = Array.from({ length: 24 }, (_, j) => chunk[j] ?? null)
		const bottomRow: (PortLabel | null)[] = Array.from({ length: 24 }, (_, j) => chunk[j + 24] ?? null)

		panels.push({
			panelNumber: startingPanel + i,
			ru: 0, // assigned later by frame placement
			topRow,
			bottomRow,
			isHighLevel,
			portCount: 48,
		})
	}

	return panels
}

/** How many patch panel RUs fit in a frame (accounting for slots) within a given RU range */
function availablePanelRUs(frame: FrameConfig, startRU?: number, endRU?: number): number {
	const slotRUs = new Set<number>()
	for (const slot of frame.slots) {
		for (let h = 0; h < slot.height; h++) slotRUs.add(slot.ru + h)
	}
	const s = startRU ?? frame.panelStartRU
	const e = endRU ?? frame.panelEndRU
	let count = 0
	for (let ru = s; ru <= e; ru++) {
		if (!slotRUs.has(ru)) count++
	}
	return count
}

/** Compute total port capacity for a frame's panel devices of a given level */
function panelCapacity(frame: FrameConfig, isHighLevel: boolean): number {
	if (frame.panelDevices?.length) {
		return frame.panelDevices
			.filter(d => d.isHighLevel === isHighLevel)
			.reduce((sum, d) => sum + d.portCount, 0)
	}
	// Legacy: estimate from available RUs * 48
	if (isHighLevel) {
		const hlStart = frame.hlPanelStartRU ?? frame.panelStartRU
		const hlEnd = frame.hlPanelEndRU ?? frame.panelEndRU
		return availablePanelRUs(frame, hlStart, hlEnd) * 48
	}
	return availablePanelRUs(frame, frame.panelStartRU, frame.panelEndRU) * 48
}

/** Generate rack data, distributing labels across frames of the same server room.
 *  If no frames are provided, auto-generates one per server room.
 *  If reservations are provided, labels are placed into reserved slots by matching locationType. */
export function generateRacks(labels: PortLabel[], serverRoomCount: number, frames?: FrameConfig[], reservations?: Map<string, LocType>): RackData[] {
	const ROOM_LETTERS = ['A', 'B', 'C', 'D'] as const
	const rooms = ROOM_LETTERS.slice(0, Math.min(serverRoomCount, 4)) as ('A' | 'B')[]

	const activeFrames = frames && frames.length > 0
		? frames
		: rooms.map((room, i) => defaultFrameConfig(room, i + 1))

	// Group frames by server room
	const framesByRoom = new Map<string, FrameConfig[]>()
	for (const frame of activeFrames) {
		const list = framesByRoom.get(frame.serverRoom) ?? []
		list.push(frame)
		framesByRoom.set(frame.serverRoom, list)
	}

	// For each room, split labels across frames by capacity
	const labelsByFrame = new Map<string, { floor: PortLabel[]; high: PortLabel[] }>()

	for (const room of rooms) {
		const roomFrames = framesByRoom.get(room) ?? []
		const roomLabels = labels.filter(l => l.serverRoom === room)
		const floorLabels = roomLabels.filter(l => !l.isHighLevel)
		const highLabels = roomLabels.filter(l => l.isHighLevel)

		// Distribute floor labels across frames by actual panel capacity
		let floorOffset = 0
		for (const frame of roomFrames) {
			const capacity = panelCapacity(frame, false)
			const chunk = floorLabels.slice(floorOffset, floorOffset + capacity)
			floorOffset += chunk.length

			const existing = labelsByFrame.get(frame.id) ?? { floor: [], high: [] }
			existing.floor = chunk
			labelsByFrame.set(frame.id, existing)
		}
		// Any overflow goes to last frame
		if (floorOffset < floorLabels.length && roomFrames.length > 0) {
			const last = labelsByFrame.get(roomFrames[roomFrames.length - 1].id)!
			last.floor = [...last.floor, ...floorLabels.slice(floorOffset)]
		}

		// Distribute high-level labels
		let highOffset = 0
		for (const frame of roomFrames) {
			const capacity = panelCapacity(frame, true)
			const chunk = highLabels.slice(highOffset, highOffset + capacity)
			highOffset += chunk.length

			const existing = labelsByFrame.get(frame.id)!
			existing.high = chunk
		}
		if (highOffset < highLabels.length && roomFrames.length > 0) {
			const last = labelsByFrame.get(roomFrames[roomFrames.length - 1].id)!
			last.high = [...last.high, ...highLabels.slice(highOffset)]
		}
	}

	// Build rack data for each frame
	return activeFrames.map(frame => {
		const frameLbls = labelsByFrame.get(frame.id) ?? { floor: [], high: [] }
		const hasPanelDevices = frame.panelDevices && frame.panelDevices.length > 0

		let floorPanels: PanelData[]
		let highPanels: PanelData[]

		if (hasPanelDevices) {
			// Use actual panel device positions and port counts
			const floorDevices = frame.panelDevices!.filter(d => !d.isHighLevel)
			const highDevices = frame.panelDevices!.filter(d => d.isHighLevel)
			if (reservations && reservations.size > 0) {
				floorPanels = buildPanelsWithReservations(frameLbls.floor, floorDevices, 1, frame.id, reservations)
				highPanels = buildPanelsWithReservations(frameLbls.high, highDevices, floorPanels.length + 1, frame.id, reservations)
			} else {
				floorPanels = buildPanelsForDevices(frameLbls.floor, floorDevices, 1)
				highPanels = buildPanelsForDevices(frameLbls.high, highDevices, floorPanels.length + 1)
			}
		} else {
			// Legacy path: auto-generate 48-port panels and place in available RUs
			floorPanels = buildPanelsLegacy(frameLbls.floor, false, 1)
			highPanels = buildPanelsLegacy(frameLbls.high, true, floorPanels.length + 1)

			// Determine slot-occupied RUs
			const slotRUs = new Set<number>()
			for (const slot of frame.slots) {
				for (let h = 0; h < slot.height; h++) slotRUs.add(slot.ru + h)
			}

			// Assign floor-level panels within floor range (top-down)
			const floorAvail: number[] = []
			for (let ru = frame.panelEndRU; ru >= frame.panelStartRU; ru--) {
				if (!slotRUs.has(ru)) floorAvail.push(ru)
			}
			floorPanels.forEach((panel, i) => {
				panel.ru = floorAvail[i] ?? frame.panelEndRU - i
			})

			// Assign high-level panels within HL range (top-down)
			const hlStart = frame.hlPanelStartRU ?? frame.panelStartRU
			const hlEnd = frame.hlPanelEndRU ?? frame.panelEndRU
			const hlAvail: number[] = []
			for (let ru = hlEnd; ru >= hlStart; ru--) {
				if (!slotRUs.has(ru)) hlAvail.push(ru)
			}
			highPanels.forEach((panel, i) => {
				panel.ru = hlAvail[i] ?? hlEnd - i
			})
		}

		return { frame, panels: [...floorPanels, ...highPanels] }
	})
}

/** Validate a zone configuration, returning error messages */
export function validateConfig(zone: ZoneConfig): string[] {
	const errors: string[] = []

	if (zone.floor < 1 || zone.floor > 20) errors.push('Floor must be between 1 and 20')
	if (!/^[A-Z]$/.test(zone.zone)) errors.push('Zone must be a single letter A–Z')

	const seen = new Set<number>()
	for (const loc of zone.locations) {
		if (loc.portCount < 1 || loc.portCount > 99) {
			errors.push(`Location ${loc.locationNumber}: port count must be 1–99`)
		}
		if (seen.has(loc.locationNumber)) {
			errors.push(`Duplicate location number: ${loc.locationNumber}`)
		}
		seen.add(loc.locationNumber)

		if (loc.serverRoomAssignment.length !== loc.portCount) {
			errors.push(`Location ${loc.locationNumber}: room assignments don't match port count`)
		}
	}

	return errors
}

/** Does a device's mounting setting include the given face? */
export function matchesFace(dev: { mounting?: string }, face: 'front' | 'rear'): boolean {
	const m = dev.mounting ?? 'both'
	return m === 'both' || m === 'none' || m === face
}

/**
 * Derive `FrameConfig[]` from the racks tool's per-room data. Mirrors the
 * logic originally embedded inside `Frames.svelte` — now exported so page-
 * editor viewports can rebuild the same frame list without going through
 * the full Frames.svelte component.
 *
 * Falls back to the `legacyFrames` argument when the racks data contains no
 * frames (empty project / old doc shape).
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

			// PDUs excluded — their 0U rendering is broken (see implementation.md TODO).
			const slots: import('./types').FrameSlot[] = []
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
