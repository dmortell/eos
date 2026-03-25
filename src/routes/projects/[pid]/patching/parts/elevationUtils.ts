import type { PatchConnection } from './types'
import type { PortLabel } from '../../frames/parts/types'
import { generatePortLabels, generateRacks } from '../../frames/parts/engine'

// ── Layout constants ──

export const RU_HEIGHT = 30 // px per rack unit in elevation view
export const PORT_CELL_W = 14 // fixed port cell width (same for all devices)
export const PORT_CELL_H = 12 // fixed port cell height (same for all devices)
export const PORT_GAP = 1   // px gap between ports
export const RACK_GAP = 80  // px gap between racks
export const RACK_PADDING = 4  // px padding inside rack frame
export const U_LABEL_W = 24 // px width for U-number labels (each side)
export const RACK_LABEL_H = 22 // px height for rack label above frame
export const PORTS_PER_ROW = 24
export const DOT_R = 3      // dot radius px
export const DOT_INSET = 1  // dot inset from port edge
export const CABLE_CH_OFFSET = 2 // px offset from device area edge for cable channel

/** Inner width of the device area (between left and right U labels) */
export function deviceAreaWidth(): number {
	return PORTS_PER_ROW * (PORT_CELL_W + PORT_GAP) + RACK_PADDING * 2
}

/** Width of a single rack column (left U labels + device area + right U labels) */
export function rackWidth(): number {
	return U_LABEL_W + deviceAreaWidth() + U_LABEL_W
}

/** Height of a rack frame in px */
export function rackHeight(heightU: number): number {
	return heightU * RU_HEIGHT
}

/** Y position (from top of rack frame) for a given U position (1-based from bottom) */
export function uToY(u: number, heightU: number): number {
	return (heightU - u) * RU_HEIGHT
}

/** Port rows for a device: 1 row for ≤24 ports, 2 rows for >24 */
export function portRowCount(portCount: number): number {
	return portCount > PORTS_PER_ROW ? 2 : 1
}

/**
 * Get the pixel coordinates of a port's connection dot (center-bottom),
 * relative to the canvas origin. Cables connect to this point.
 */
export function absolutePortPosition(
	rackX: number,
	rackY: number,
	portIndex: number,
	portCount: number,
	devicePositionU: number,
	deviceHeightU: number,
	rackHeightU: number,
): { x: number; y: number; col: number } {
	const rows = portRowCount(portCount)

	// Which row and column (0-based)
	let row: number, col: number
	if (rows === 2) {
		if (portIndex <= PORTS_PER_ROW) {
			row = 0
			col = portIndex - 1
		} else {
			row = 1
			col = portIndex - PORTS_PER_ROW - 1
		}
	} else {
		row = 0
		col = portIndex - 1
	}

	// Device block geometry
	const deviceTop = uToY(devicePositionU + deviceHeightU - 1, rackHeightU)

	// Port cell top-left (fixed width, top-aligned with RACK_PADDING)
	const cellLeft = U_LABEL_W + RACK_PADDING + col * (PORT_CELL_W + PORT_GAP)
	const cellTop = RACK_LABEL_H + deviceTop + RACK_PADDING + row * (PORT_CELL_H + PORT_GAP)

	// Dot center is at center-bottom of port cell
	const dotX = cellLeft + PORT_CELL_W / 2 + 1
	const dotY = cellTop + PORT_CELL_H - DOT_INSET - DOT_R + 1

	return { x: rackX + dotX, y: rackY + dotY, col }
}

/** Left and right cable channel X positions for a rack (inside device area) */
export function cableChannelX(rackX: number): { left: number; right: number } {
	return {
		left: rackX + U_LABEL_W - CABLE_CH_OFFSET,
		right: rackX + U_LABEL_W + deviceAreaWidth() + CABLE_CH_OFFSET,
	}
}

/** Build a lookup of portRef → connection for quick checks */
export function buildPortConnectionMap(connections: PatchConnection[]): Map<string, PatchConnection> {
	const map = new Map<string, PatchConnection>()
	for (const c of connections) {
		if (c.fromPortRef.deviceId && c.fromPortRef.portIndex > 0) {
			map.set(`${c.fromPortRef.deviceId}:${c.fromPortRef.portIndex}`, c)
		}
		if (c.toPortRef.deviceId && c.toPortRef.portIndex > 0) {
			map.set(`${c.toPortRef.deviceId}:${c.toPortRef.portIndex}`, c)
		}
	}
	return map
}

/** Hex background colors for port usage types (matching LOC_TYPE_COLORS from frames tool) */
export const PORT_TYPE_COLORS: Record<string, string> = {
	'N/A': '#d1d5db',
	desk: '#3b82f6',
	AP: '#22c55e',
	PR: '#f97316',
	RS: '#a855f7',
	FR: '#ef4444',
	WC: '#06b6d4',
	TV: '#ec4899',
	LK: '#f59e0b',
}

/** Info resolved for a port from frames data */
export interface PortInfo {
	label: string
	locationType: string
}

/**
 * Derive FrameConfig objects from racks + devices data (same logic as Frames tool).
 * Frames are not stored in Firestore — they're derived at runtime from racks data.
 */
function deriveFrameConfigs(racks: any[], devices: any[]): any[] {
	const frames: any[] = []
	for (const rack of racks) {
		if (!rack.serverRoom) continue
		if (rack.type === 'desk' || rack.type === 'shelf' || rack.type === 'vcm') continue

		const rackDevices = devices.filter((d: any) => d.rackId === rack.id)
		const slots: any[] = []
		for (const dev of rackDevices) {
			if (dev.type !== 'panel') {
				slots.push({ ru: dev.positionU, type: dev.type, height: dev.heightU, label: dev.label })
			}
		}
		const copperPanels = rackDevices.filter((d: any) => d.type === 'panel')
		const floorPanels = copperPanels.filter((d: any) => d.patchLevel !== 'high')
		const highPanels = copperPanels.filter((d: any) => d.patchLevel === 'high')

		const panelDevices = copperPanels.map((d: any) => ({
			ru: d.positionU as number,
			portCount: (d.portCount as number) || 48,
			isHighLevel: d.patchLevel === 'high',
		}))

		frames.push({
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
	return frames
}

/**
 * Build a map of `deviceId:portIndex` → PortInfo by matching racks devices
 * to frames panel data via RU position within the same server room.
 *
 * frameData.zoneLocations is Record<string, LocationConfig[]> (keyed by zone letter).
 * Frame configs are derived from racks data at runtime (not stored in Firestore).
 */
export function buildPortInfoMap(
	frameData: any,
	room: string,
	devices: any[],
	racks: any[],
	floor: number = 1,
	serverRoomCount: number = 1,
	floorFormat: string = 'L01',
): Map<string, PortInfo> {
	const map = new Map<string, PortInfo>()
	if (!frameData) return map

	const zoneLocations: Record<string, any[]> = frameData.zoneLocations ?? {}
	const zoneLetters = Object.keys(zoneLocations).filter(k => zoneLocations[k]?.length > 0).sort()
	if (zoneLetters.length === 0) return map

	// Derive frame configs from racks data (same as Frames tool does at runtime)
	const frameConfigs = deriveFrameConfigs(racks, devices)

	const reservations = frameData.portReservations
		? new Map(Object.entries(frameData.portReservations))
		: undefined

	// Generate all port labels for all zones on this floor
	const allLabels: PortLabel[] = []
	for (const z of zoneLetters) {
		allLabels.push(...generatePortLabels(
			{ floor, zone: z, serverRoomCount, locations: zoneLocations[z] },
			floorFormat,
		))
	}
	if (allLabels.length === 0) return map

	// Generate rack/panel data from frames engine
	const rackDataList = generateRacks(
		allLabels, serverRoomCount,
		frameConfigs.length > 0 ? frameConfigs : undefined,
		reservations as any,
	)

	// Filter to frames in the current server room
	const roomRacks = rackDataList.filter(rd => rd.frame.serverRoom === room)

	// Build RU → PortLabel[] lookup from frames panels
	const ruToLabels = new Map<number, (PortLabel | null)[]>()
	for (const rd of roomRacks) {
		for (const panel of rd.panels) {
			const ports = [...panel.topRow, ...panel.bottomRow]
			ruToLabels.set(panel.ru, ports)
		}
	}

	// Match racks devices to frame panels by RU position
	for (const device of devices) {
		if (!device.portCount || device.type !== 'panel') continue

		const labels = ruToLabels.get(device.positionU)
		if (!labels) continue

		for (let i = 0; i < device.portCount && i < labels.length; i++) {
			const portLabel = labels[i]
			if (portLabel) {
				map.set(`${device.id}:${i + 1}`, {
					label: portLabel.label,
					locationType: portLabel.locationType,
				})
			}
		}
	}

	return map
}

/**
 * Find ports that appear in more than one connection (duplicate assignments).
 * Returns a Set of `deviceId:portIndex` keys.
 */
export function findDuplicatePorts(connections: PatchConnection[]): Set<string> {
	const count = new Map<string, number>()
	for (const c of connections) {
		for (const ref of [c.fromPortRef, c.toPortRef]) {
			if (!ref.deviceId || ref.portIndex <= 0) continue
			const key = `${ref.deviceId}:${ref.portIndex}`
			count.set(key, (count.get(key) ?? 0) + 1)
		}
	}
	const dupes = new Set<string>()
	for (const [key, n] of count) {
		if (n > 1) dupes.add(key)
	}
	return dupes
}
