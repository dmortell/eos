import type { ZoneConfig, PortLabel, PanelData, RackData, FrameConfig } from './types'
import { defaultFrameConfig } from './types'

/** Generate port labels for all locations in a zone */
export function generatePortLabels(zone: ZoneConfig): PortLabel[] {
	const labels: PortLabel[] = []
	const ff = String(zone.floor).padStart(2, '0')
	const z = zone.zone

	for (const loc of zone.locations) {
		const nnn = String(loc.locationNumber).padStart(3, '0')
		const isHL = loc.isHighLevel ?? false

		for (let p = 0; p < loc.portCount; p++) {
			const s = loc.serverRoomAssignment[p] || 'A'
			const pp = String(p + 1).padStart(2, '0')
			const suffix = isHL ? '-H' : ''

			labels.push({
				label: `${ff}.${z}.${nnn}-${s}${pp}${suffix}`,
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
			ru: startingPanel + i, // will be adjusted by frame placement
			topRow,
			bottomRow,
			isHighLevel,
		})
	}

	return panels
}

/** Generate rack data for each frame, distributing labels across panels.
 *  If no frames are provided, auto-generates one per server room. */
export function generateRacks(labels: PortLabel[], zone: ZoneConfig, frames?: FrameConfig[]): RackData[] {
	const rooms: ('A' | 'B')[] = zone.serverRoomCount === 2 ? ['A', 'B'] : ['A']

	// Auto-generate frames if none provided
	const activeFrames = frames && frames.length > 0
		? frames
		: rooms.map((room, i) => defaultFrameConfig(room, i + 1))

	return activeFrames.map(frame => {
		const roomLabels = labels.filter(l => l.serverRoom === frame.serverRoom)
		const floorLabels = roomLabels.filter(l => !l.isHighLevel)
		const highLabels = roomLabels.filter(l => l.isHighLevel)

		// Floor panels first, then high-level panels (never mixed)
		const floorPanels = buildPanels(floorLabels, false, 1)
		const highPanels = buildPanels(highLabels, true, floorPanels.length + 1)

		// Assign RU positions bottom-up within the frame's panel range
		const allPanels = [...floorPanels, ...highPanels]
		allPanels.forEach((panel, i) => {
			panel.ru = frame.panelStartRU + i
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
