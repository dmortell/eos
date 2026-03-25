import type { PatchConnection } from './types'

// ── Layout constants ──

export const RU_HEIGHT = 30 // px per rack unit in elevation view
export const PORT_CELL_H = 12 // fixed port cell height (same for all devices)
export const PORT_GAP = 1   // px gap between ports
export const RACK_GAP = 80  // px gap between racks
export const RACK_PADDING = 4  // px padding inside rack frame
export const U_LABEL_W = 24 // px width for U-number labels (each side)
export const RACK_LABEL_H = 22 // px height for rack label above frame
export const PORTS_PER_ROW = 24
export const DOT_R = 3      // dot radius px
export const DOT_INSET = 1  // dot inset from port edge

/** Inner width of the device area (between left and right U labels) */
export function deviceAreaWidth(): number {
	return PORTS_PER_ROW * 15 + RACK_PADDING * 2
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
 * Get the pixel coordinates of a port's connection dot (top-right circle),
 * relative to the canvas origin. Cables connect to this point.
 *
 * Port grid uses fixed PORT_CELL_H rows, centered vertically within the device block.
 */
export function absolutePortPosition(
	rackX: number,
	portIndex: number,
	portCount: number,
	devicePositionU: number,
	deviceHeightU: number,
	rackHeightU: number,
): { x: number; y: number } {
	const rows = portRowCount(portCount)
	const cols = Math.min(portCount, PORTS_PER_ROW)

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
	const devW = deviceAreaWidth()
	const devH = deviceHeightU * RU_HEIGHT
	const deviceTop = uToY(devicePositionU + deviceHeightU - 1, rackHeightU)

	// Grid area (after padding)
	const gridW = devW - RACK_PADDING * 2

	// Fixed row height, centered vertically
	const totalGridH = rows * PORT_CELL_H + (rows - 1) * PORT_GAP
	const gridTopOffset = (devH - totalGridH) / 2

	// Cell width (distributed evenly)
	const cellW = (gridW - (cols - 1) * PORT_GAP) / cols

	// Port cell top-left
	const cellLeft = U_LABEL_W + RACK_PADDING + col * (cellW + PORT_GAP)
	const cellTop = RACK_LABEL_H + deviceTop + gridTopOffset + row * (PORT_CELL_H + PORT_GAP)

	// Dot center is at top-right of port cell (inset by DOT_INSET + DOT_R)
	const dotX = cellLeft + cellW - DOT_INSET - DOT_R
	const dotY = cellTop + DOT_INSET + DOT_R

	return { x: rackX + dotX, y: dotY }
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
