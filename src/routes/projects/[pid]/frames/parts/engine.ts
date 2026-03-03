import type { ZoneConfig, PortLabel, PanelData, RackData, FrameConfig } from './types'
import { defaultFrameConfig } from './types'

/** Generate port labels for all locations in a zone */
export function generatePortLabels(zone: ZoneConfig): PortLabel[] {
	const labels: PortLabel[] = []
	const ff = String(zone.floor).padStart(2, '0')
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

/** Lay out labels into 48-port panels (2 rows of 24) */
function buildPanels(labels: PortLabel[], isHighLevel: boolean, startingPanel: number): PanelData[] {
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
		})
	}

	return panels
}

/** How many patch panel RUs fit in a frame (accounting for slots) */
function availablePanelRUs(frame: FrameConfig): number {
	const slotRUs = new Set<number>()
	for (const slot of frame.slots) {
		for (let h = 0; h < slot.height; h++) slotRUs.add(slot.ru + h)
	}
	let count = 0
	for (let ru = frame.panelStartRU; ru <= frame.panelEndRU; ru++) {
		if (!slotRUs.has(ru)) count++
	}
	return count
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

		// Distribute floor labels across frames by panel capacity
		let floorOffset = 0
		for (const frame of roomFrames) {
			const capacity = availablePanelRUs(frame) * 48
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

		// Distribute high-level labels similarly
		let highOffset = 0
		for (const frame of roomFrames) {
			const floorPanelsUsed = Math.ceil((labelsByFrame.get(frame.id)?.floor.length ?? 0) / 48)
			const remainingRUs = availablePanelRUs(frame) - floorPanelsUsed
			const capacity = Math.max(0, remainingRUs) * 48
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
		const floorPanels = buildPanels(frameLbls.floor, false, 1)
		const highPanels = buildPanels(frameLbls.high, true, floorPanels.length + 1)
		const allPanels = [...floorPanels, ...highPanels]

		// Assign RU positions top-down: first panel at panelEndRU, going down
		// Skip RUs occupied by slots
		const slotRUs = new Set<number>()
		for (const slot of frame.slots) {
			for (let h = 0; h < slot.height; h++) slotRUs.add(slot.ru + h)
		}

		const availableRUs: number[] = []
		for (let ru = frame.panelEndRU; ru >= frame.panelStartRU; ru--) {
			if (!slotRUs.has(ru)) availableRUs.push(ru)
		}

		allPanels.forEach((panel, i) => {
			panel.ru = availableRUs[i] ?? frame.panelEndRU - i
		})

		return { frame, panels: allPanels }
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
