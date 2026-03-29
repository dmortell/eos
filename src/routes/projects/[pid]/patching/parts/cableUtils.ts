import type { PortRef } from './types'
import { snapToStandardLength } from './constants'
import {
	PORTS_PER_ROW, RACK_LABEL_H, RU_HEIGHT,
	cableChannelX, uToY,
} from './elevationUtils'

/** Rack unit height in mm (IEC 60297) */
const RU_HEIGHT_MM = 44.45

/** Extra slack added within same rack (in RU equivalent) */
const SAME_RACK_SLACK_RU = 2

/** Extra slack for cross-rack connections (in RU equivalent) */
const CROSS_RACK_SLACK_RU = 5

/** Gap between adjacent racks in mm (physical aisle spacing estimate) */
const INTER_RACK_GAP_MM = 200

/** Default rack depth in mm for front-to-rear routing */
const DEFAULT_RACK_DEPTH_MM = 800

/** Standard 19″ rack internal width in mm (EIA-310) */
const RACK_INTERNAL_WIDTH_MM = 482.6

/** Check if a port index falls on the left half of the device */
function portIsLeftHalf(portIndex: number, portCount: number): boolean {
	const cols = Math.min(portCount, PORTS_PER_ROW)
	return ((portIndex - 1) % cols) < cols / 2
}

/** Horizontal distance (mm) from a port to its nearest side channel */
function portToNearChannelMm(portIndex: number, portCount: number): number {
	const cols = Math.min(portCount, PORTS_PER_ROW)
	const col = (portIndex - 1) % cols
	const portWidthMm = RACK_INTERNAL_WIDTH_MM / cols
	const isLeft = col < cols / 2
	return isLeft
		? (col + 0.5) * portWidthMm        // distance to left edge
		: (cols - col - 0.5) * portWidthMm  // distance to right edge
}

/** Find the manager U position nearest to a target U */
function nearestManagerU(managers: number[], targetU: number): number {
	let best = managers[0]
	let bestDist = Math.abs(best - targetU)
	for (let i = 1; i < managers.length; i++) {
		const dist = Math.abs(managers[i] - targetU)
		if (dist < bestDist) { bestDist = dist; best = managers[i] }
	}
	return best
}

/**
 * Calculate estimated cable length between two port references.
 *
 * Uses Manhattan distance based on physical rack positions:
 * - Vertical: difference in U positions × 44.45mm
 * - Horizontal: number of racks apart × (rack width + gap)
 * - Manager crossings: when ports are on opposite halves, cables route
 *   through the nearest horizontal cable manager, adding vertical detour
 *   and one rack-width horizontal crossing per manager used.
 * - Depth: if front↔rear, add rack depth
 * - Slack: 2U for same-rack, 5U for cross-rack
 *
 * Result is snapped UP to the nearest standard cable length.
 */
export function calculateCableLength(
	from: PortRef,
	to: PortRef,
	racks: any[],
	devices: any[],
): number {
	if (!from.rackId || !from.deviceId || !to.rackId || !to.deviceId) return 0
	if (from.portIndex <= 0 || to.portIndex <= 0) return 0

	const fromDevice = devices.find((d: any) => d.id === from.deviceId)
	const toDevice = devices.find((d: any) => d.id === to.deviceId)
	if (!fromDevice || !toDevice) return 0

	const fromRack = racks.find((r: any) => r.id === from.rackId)
	const toRack = racks.find((r: any) => r.id === to.rackId)
	if (!fromRack || !toRack) return 0

	const fromU = fromDevice.positionU ?? 1
	const toU = toDevice.positionU ?? 1
	const sameRack = fromRack.id === toRack.id

	// Port half detection for manager routing
	const fromLeftHalf = portIsLeftHalf(from.portIndex, fromDevice.portCount ?? 24)
	const toLeftHalf = portIsLeftHalf(to.portIndex, toDevice.portCount ?? 24)

	// Cable managers in each rack
	const fromManagers = devices.filter((d: any) => d.rackId === fromRack.id && d.type === 'manager').map((d: any) => d.positionU as number)
	const toManagers = devices.filter((d: any) => d.rackId === toRack.id && d.type === 'manager').map((d: any) => d.positionU as number)

	// Horizontal run from each port to its nearest side channel
	const fromPortToChMm = portToNearChannelMm(from.portIndex, fromDevice.portCount ?? 24)
	const toPortToChMm = portToNearChannelMm(to.portIndex, toDevice.portCount ?? 24)

	let verticalMm: number
	let horizontalMm = fromPortToChMm + toPortToChMm

	if (sameRack) {
		if (fromLeftHalf !== toLeftHalf && fromManagers.length > 0) {
			// Route through nearest cable manager to cross between sides
			const mgrU = nearestManagerU(fromManagers, (fromU + toU) / 2)
			verticalMm = (Math.abs(fromU - mgrU) + Math.abs(mgrU - toU)) * RU_HEIGHT_MM
			horizontalMm += RACK_INTERNAL_WIDTH_MM
		} else {
			verticalMm = Math.abs(fromU - toU) * RU_HEIGHT_MM
		}
	} else {
		// Base vertical distance
		verticalMm = Math.abs(fromU - toU) * RU_HEIGHT_MM

		// Horizontal inter-rack distance
		const fromIdx = racks.indexOf(fromRack)
		const toIdx = racks.indexOf(toRack)
		const minIdx = Math.min(fromIdx, toIdx)
		const maxIdx = Math.max(fromIdx, toIdx)
		for (let i = minIdx; i < maxIdx; i++) {
			horizontalMm += (racks[i]?.widthMm ?? 700) + INTER_RACK_GAP_MM
		}

		// Manager crossings for ports on the wrong side of the exit direction
		const fromIsLeft = fromIdx < toIdx
		const fromExitLeft = !fromIsLeft
		const toExitLeft = fromIsLeft

		if (fromLeftHalf !== fromExitLeft && fromManagers.length > 0) {
			const mgrU = nearestManagerU(fromManagers, fromU)
			verticalMm += 2 * Math.abs(fromU - mgrU) * RU_HEIGHT_MM
			horizontalMm += RACK_INTERNAL_WIDTH_MM
		}

		if (toLeftHalf !== toExitLeft && toManagers.length > 0) {
			const mgrU = nearestManagerU(toManagers, toU)
			verticalMm += 2 * Math.abs(toU - mgrU) * RU_HEIGHT_MM
			horizontalMm += RACK_INTERNAL_WIDTH_MM
		}
	}

	// Depth: front-to-rear routing
	let depthMm = 0
	if (from.face !== to.face) {
		depthMm = fromRack.depthMm ?? DEFAULT_RACK_DEPTH_MM
	}

	// Slack
	const slackMm = (sameRack ? SAME_RACK_SLACK_RU : CROSS_RACK_SLACK_RU) * RU_HEIGHT_MM
	const totalMm = verticalMm + horizontalMm + depthMm + slackMm
	return snapToStandardLength(totalMm / 1000)
}

/**
 * Recalculate lengths for all connections that are not manually locked.
 * Returns a new array with updated lengths.
 */
export function recalcAllLengths(
	connections: { lengthLocked: boolean; fromPortRef: PortRef; toPortRef: PortRef; lengthMeters: number }[],
	racks: any[],
	devices: any[],
) {
	return connections.map(c => {
		if (c.lengthLocked) return c
		const len = calculateCableLength(c.fromPortRef, c.toPortRef, racks, devices)
		return len !== c.lengthMeters ? { ...c, lengthMeters: len } : c
	})
}

// ── Cable route computation (visual SVG paths) ──

export const AdvancedRouting = true

export interface CableRoute {
	id: string
	path: string       // SVG path data
	color: string
	dashed: boolean
	label: string
	midLabel: string
	midX: number       // midpoint for label placement
	midY: number
}

/** Find the manager Y position closest to a target Y */
function nearestManagerY(managers: number[], rackY: number, rackHeightU: number, targetY: number): number | null {
	if (managers.length === 0) return null
	let bestY = 0
	let bestDist = Infinity
	for (const u of managers) {
		const y = rackY + RACK_LABEL_H + uToY(u, rackHeightU) + RU_HEIGHT / 2
		const dist = Math.abs(y - targetY)
		if (dist < bestDist) { bestDist = dist; bestY = y }
	}
	return bestY + 10
}

/**
 * Compute an orthogonal cable route.
 * When AdvancedRouting is enabled and cable managers exist, cables cross
 * between left and right side channels via the nearest horizontal manager,
 * even if the route is longer than a direct path.
 */
export function computeRoute(
	from: { x: number; y: number; col: number },
	to: { x: number; y: number; col: number },
	fromRackX: number, fromRackY: number, fromRackHeightU: number,
	toRackX: number, toRackY: number, toRackHeightU: number,
	sameRack: boolean,
	fromManagers: number[],
	toManagers: number[],
): { path: string; midX: number; midY: number } {
	const fromCh = cableChannelX(fromRackX)
	const toCh = cableChannelX(toRackX)
	const DROP = 4 // px drop below dot before going horizontal
	const halfCols = PORTS_PER_ROW / 2
	const fromLeft = from.col < halfCols
	const toLeft = to.col < halfCols

	if (sameRack) {
		const y1 = from.y + DROP
		const y2 = to.y + DROP

		// Advanced: ports on different halves → route through a cable manager
		if (AdvancedRouting && fromLeft !== toLeft && fromManagers.length > 0) {
			const midTarget = (from.y + to.y) / 2
			const mgrY = nearestManagerY(fromManagers, fromRackY, fromRackHeightU, midTarget)!
			const leftCh = fromCh.left
			const rightCh = fromCh.right
			const fromChX = fromLeft ? leftCh : rightCh
			const toChX = toLeft ? leftCh : rightCh

			return {
				path: `M${from.x},${from.y} V${y1} H${fromChX} V${mgrY} H${toChX} V${y2} H${to.x} V${to.y}`,
				midX: (leftCh + rightCh) / 2,
				midY: mgrY,
			}
		}

		// Simple: same half or no managers — use nearest side
		const useLeft = fromLeft && toLeft ? true : !fromLeft && !toLeft ? false : fromLeft
		const chX = useLeft ? fromCh.left : fromCh.right
		const midY = (y1 + y2) / 2

		return {
			path: `M${from.x},${from.y} V${y1} H${chX} V${y2} H${to.x} V${to.y}`,
			midX: chX,
			midY,
		}
	}

	// Cross-rack
	const fromIsLeft = fromRackX < toRackX
	const y1drop = from.y + DROP
	const y2drop = to.y + DROP

	// Advanced: if port is on the wrong side for exit, route through a manager first
	if (AdvancedRouting) {
		const fromExitLeft = !fromIsLeft
		const toExitLeft = fromIsLeft
		const fromNeedsCross = fromLeft !== fromExitLeft
		const toNeedsCross = toLeft !== toExitLeft

		const fromPortCh = fromLeft ? fromCh.left : fromCh.right
		const fromExitCh = fromIsLeft ? fromCh.right : fromCh.left
		const toEnterCh = fromIsLeft ? toCh.left : toCh.right
		const toPortCh = toLeft ? toCh.left : toCh.right

		const transitY = (from.y + to.y) / 2
		const segments: string[] = [`M${from.x},${from.y}`, `V${y1drop}`]

		if (fromNeedsCross && fromManagers.length > 0) {
			const mgrY = nearestManagerY(fromManagers, fromRackY, fromRackHeightU, from.y)!
			segments.push(`H${fromPortCh}`, `V${mgrY}`, `H${fromExitCh}`)
		} else {
			segments.push(`H${fromExitCh}`)
		}

		segments.push(`V${transitY}`, `H${toEnterCh}`)

		if (toNeedsCross && toManagers.length > 0) {
			const mgrY = nearestManagerY(toManagers, toRackY, toRackHeightU, to.y)!
			segments.push(`V${mgrY}`, `H${toPortCh}`)
		}

		segments.push(`V${y2drop}`, `H${to.x}`, `V${to.y}`)

		return {
			path: segments.join(' '),
			midX: (fromExitCh + toEnterCh) / 2,
			midY: transitY,
		}
	}

	// Simple cross-rack
	const fromChX = fromIsLeft ? fromCh.right : fromCh.left
	const toChX = fromIsLeft ? toCh.left : toCh.right
	const transitY = (from.y + to.y) / 2

	return {
		path: `M${from.x},${from.y} V${y1drop} H${fromChX} V${transitY} H${toChX} V${y2drop} H${to.x} V${to.y}`,
		midX: (fromChX + toChX) / 2,
		midY: transitY,
	}
}
