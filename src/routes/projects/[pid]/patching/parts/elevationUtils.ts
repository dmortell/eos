import type { PatchConnection } from './types'

// ── Layout constants ──

export const RU_HEIGHT = 20 // px per rack unit in elevation view
export const PORT_W = 16    // px per port cell
export const PORT_H = 14    // px per port cell
export const PORT_GAP = 1   // px gap between ports
export const RACK_GAP = 60  // px gap between racks
export const RACK_PADDING = 8  // px padding inside rack frame
export const U_LABEL_W = 24 // px width for U-number labels
export const DEVICE_LABEL_H = 14 // px height for device label row
export const PORTS_PER_ROW = 24

/** Width of a single rack column in the elevation view */
export function rackWidth(): number {
	return U_LABEL_W + RACK_PADDING * 2 + PORTS_PER_ROW * (PORT_W + PORT_GAP)
}

/** Height of a rack in px based on its U height */
export function rackHeight(heightU: number): number {
	return heightU * RU_HEIGHT
}

/** Y position (from top of rack) for a given U position (1-based from bottom) */
export function uToY(u: number, heightU: number): number {
	return (heightU - u) * RU_HEIGHT
}

/** Device block height in px */
export function deviceHeight(heightU: number): number {
	return heightU * RU_HEIGHT
}

/** Port rows for a device: 1 row for ≤24 ports, 2 rows for >24 */
export function portRowCount(portCount: number): number {
	return portCount > PORTS_PER_ROW ? 2 : 1
}

/**
 * Get the pixel coordinates of a port relative to its rack's top-left corner.
 * Returns { x, y } — center of the port cell.
 */
export function portPosition(
	portIndex: number,
	portCount: number,
	devicePositionU: number,
	deviceHeightU: number,
	rackHeightU: number,
): { x: number; y: number } {
	const rows = portRowCount(portCount)
	const portsInRow = rows === 2 ? PORTS_PER_ROW : Math.min(portCount, PORTS_PER_ROW)

	// Which row (0=top, 1=bottom) and column within that row
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

	// X: after U labels + padding + column offset
	const x = U_LABEL_W + RACK_PADDING + col * (PORT_W + PORT_GAP) + PORT_W / 2

	// Y: device top + label row + row offset + half cell height
	const deviceTop = uToY(devicePositionU + deviceHeightU - 1, rackHeightU)
	const portAreaTop = deviceTop + DEVICE_LABEL_H
	const y = portAreaTop + row * (PORT_H + PORT_GAP) + PORT_H / 2

	return { x, y }
}

/**
 * Get absolute port position on the canvas given rack X offset.
 */
export function absolutePortPosition(
	rackX: number,
	portIndex: number,
	portCount: number,
	devicePositionU: number,
	deviceHeightU: number,
	rackHeightU: number,
): { x: number; y: number } {
	const rel = portPosition(portIndex, portCount, devicePositionU, deviceHeightU, rackHeightU)
	return { x: rackX + rel.x, y: rel.y }
}

/** Build a lookup map: deviceId → device config */
export function deviceMap(devices: any[]): Map<string, any> {
	return new Map(devices.map(d => [d.id, d]))
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
