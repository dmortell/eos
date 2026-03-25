import type { PortRef } from './types'
import { snapToStandardLength } from './constants'

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

/**
 * Calculate estimated cable length between two port references.
 *
 * Uses Manhattan distance based on physical rack positions:
 * - Vertical: difference in U positions × 44.45mm
 * - Horizontal: number of racks apart × (rack width + gap)
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

	// Vertical distance: U positions
	const fromU = fromDevice.positionU ?? 1
	const toU = toDevice.positionU ?? 1
	const verticalMm = Math.abs(fromU - toU) * RU_HEIGHT_MM

	// Horizontal distance: number of racks apart
	const fromIdx = racks.indexOf(fromRack)
	const toIdx = racks.indexOf(toRack)
	const sameRack = fromRack.id === toRack.id
	let horizontalMm = 0

	if (!sameRack) {
		// Sum widths of racks between + gaps
		const minIdx = Math.min(fromIdx, toIdx)
		const maxIdx = Math.max(fromIdx, toIdx)
		for (let i = minIdx; i < maxIdx; i++) {
			horizontalMm += (racks[i]?.widthMm ?? 700) + INTER_RACK_GAP_MM
		}
	}

	// Depth: front-to-rear routing
	let depthMm = 0
	const fromFront = from.face === 'front'
	const toFront = to.face === 'front'
	if (fromFront !== toFront) {
		depthMm = fromRack.depthMm ?? DEFAULT_RACK_DEPTH_MM
	}

	// Slack
	const slackMm = (sameRack ? SAME_RACK_SLACK_RU : CROSS_RACK_SLACK_RU) * RU_HEIGHT_MM

	// Total Manhattan distance
	const totalMm = verticalMm + horizontalMm + depthMm + slackMm
	const totalMeters = totalMm / 1000

	return snapToStandardLength(totalMeters)
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
