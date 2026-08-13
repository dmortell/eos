import type { PatchConnection } from './types'

// Shared pipeline + colors — single source of truth in $lib (see elevations-plan.md).
export { buildPortInfoMap, type PortInfo } from '$lib/elevation/portmap'
export { PORT_TYPE_COLORS } from '$lib/elevation/loc-colors'

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
		right: rackX + U_LABEL_W + deviceAreaWidth() + CABLE_CH_OFFSET +2,
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
