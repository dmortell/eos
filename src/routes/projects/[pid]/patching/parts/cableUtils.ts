import type { PortRef } from './types'
import { snapToStandardLength } from './constants'
import { PORTS_PER_ROW } from './elevationUtils'

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

	let verticalMm: number
	let horizontalMm = 0

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
