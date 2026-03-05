import type { ZoneConfig, PortLabel, PanelData, PanelDevice, RackData, FrameConfig } from './types'
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
 *  If no frames are provided, auto-generates one per server room. */
export function generateRacks(labels: PortLabel[], serverRoomCount: number, frames?: FrameConfig[]): RackData[] {
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
			floorPanels = buildPanelsForDevices(frameLbls.floor, floorDevices, 1)
			highPanels = buildPanelsForDevices(frameLbls.high, highDevices, floorPanels.length + 1)
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
