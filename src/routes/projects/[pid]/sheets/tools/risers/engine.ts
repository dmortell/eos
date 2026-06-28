/**
 * Pure helpers for the Riser render — floor geometry, level-to-Y resolution, cable lane
 * spacing and polyline geometry. Copied from the production risers tool. No Svelte / DOM.
 */
import type { FloorHeights, RiserDocData, Cable, CableLevel, Ladder, RiserRoom } from './types'
import { DEFAULT_FLOOR_HEIGHTS } from './types'

export function heightsFor(floor: number, doc: Pick<RiserDocData, 'floorHeights' | 'settings'>): FloorHeights {
	return doc.floorHeights[floor] ?? doc.settings.defaultFloorHeights ?? DEFAULT_FLOOR_HEIGHTS
}

export function totalFloorHeightMm(h: FloorHeights): number {
	return h.slabMm + h.raisedFloorMm + h.clearHeightMm + h.plenumMm
}

export interface FloorYBand {
	floor: number
	topMm: number
	plenumBottomMm: number
	raisedFloorTopMm: number
	slabTopMm: number
	slabBottomMm: number
	heights: FloorHeights
	/** Physical gap inserted ABOVE this band's top (mm) to represent hidden
	 *  floors between it and the visible floor above. 0 when contiguous. */
	gapAboveMm?: number
}

export function buildFloorBands(
	doc: Pick<RiserDocData, 'floorHeights' | 'settings' | 'hiddenFloors'>,
	from: number,
	to: number,
): FloorYBand[] {
	const lo = Math.min(from, to)
	const hi = Math.max(from, to)
	const hidden = new Set(doc.hiddenFloors ?? [])
	const bands: FloorYBand[] = []
	let cursor = 0
	let prevFloor: number | null = null
	for (let f = hi; f >= lo; f--) {
		if (hidden.has(f)) continue
		const h = heightsFor(f, doc)
		// Hidden floors between the previous visible floor and this one → insert a
		// physical gap (half a floor tall) so the break reads as a real spacer.
		let gapAboveMm = 0
		if (prevFloor !== null && prevFloor - f > 1) {
			gapAboveMm = Math.round(totalFloorHeightMm(h) / 2)
			cursor += gapAboveMm
		}
		const topMm = cursor
		const plenumBottomMm = topMm + h.plenumMm
		const raisedFloorTopMm = plenumBottomMm + h.clearHeightMm
		const slabTopMm = raisedFloorTopMm + h.raisedFloorMm
		const slabBottomMm = slabTopMm + h.slabMm
		bands.push({ floor: f, topMm, plenumBottomMm, raisedFloorTopMm, slabTopMm, slabBottomMm, heights: h, gapAboveMm })
		cursor = slabBottomMm
		prevFloor = f
	}
	return bands
}

export function compressionBreaks(bands: FloorYBand[]): Array<{ yMm: number; hiddenFloors: number[] }> {
	const out: Array<{ yMm: number; hiddenFloors: number[] }> = []
	for (let i = 0; i < bands.length - 1; i++) {
		const upper = bands[i]
		const lower = bands[i + 1]
		const gap = upper.floor - lower.floor - 1
		if (gap >= 1) {
			const hidden: number[] = []
			for (let f = upper.floor - 1; f > lower.floor; f--) hidden.push(f)
			out.push({ yMm: upper.slabBottomMm, hiddenFloors: hidden })
		}
	}
	return out
}

export function totalStackHeightMm(bands: FloorYBand[]): number {
	if (!bands.length) return 0
	return bands[bands.length - 1].slabBottomMm
}

export function levelYMm(band: FloorYBand, level: CableLevel): number {
	if (level === 'high') return (band.topMm + band.plenumBottomMm) / 2
	if (band.heights.raisedFloorMm > 0) return (band.raisedFloorTopMm + band.slabTopMm) / 2
	return band.slabTopMm - 50
}

export function bandForFloor(bands: FloorYBand[], floor: number): FloorYBand | undefined {
	return bands.find((b) => b.floor === floor)
}

export function roomCentreYMm(band: FloorYBand): number {
	return (band.plenumBottomMm + band.raisedFloorTopMm) / 2
}

export function clampRange(from: number, to: number, available: number[]): { from: number; to: number } {
	if (!available.length) return { from, to }
	const min = Math.min(...available)
	const max = Math.max(...available)
	const f = Math.max(min, Math.min(from, max))
	const t = Math.max(min, Math.min(to, max))
	return { from: Math.min(f, t), to: Math.max(f, t) }
}

export const LANE_SPACING_MM = 100

export interface CableRun {
	cableId: string
	hopIndex: number
	type: 'h' | 'v' | 'rv'
	channelKey: string
	lo: number
	hi: number
	floor?: number
	level?: CableLevel
	ladderId?: string
	roomId?: string
	lane: number
	/** Total lanes in this run's channel (second-pass) — lets the renderer centre the bundle. */
	laneCount?: number
}

export function buildCableRuns(cable: Cable, ctx: { rooms: RiserRoom[]; ladders: Ladder[] }): CableRun[] {
	const roomById = new Map(ctx.rooms.map((r) => [r.id, r]))
	const ladderById = new Map(ctx.ladders.map((l) => [l.id, l]))
	const runs: CableRun[] = []
	for (let i = 0; i < cable.segments.length - 1; i++) {
		const seg = cable.segments[i]
		const next = cable.segments[i + 1]
		const room = roomById.get(seg.roomId)
		const ladder = seg.ladderId ? ladderById.get(seg.ladderId) : undefined
		const nextRoom = roomById.get(next.roomId)
		const level: CableLevel = seg.level ?? 'high'
		const entryLevel: CableLevel = next.entryLevel ?? level
		if (!room || !nextRoom) continue

		if (!ladder && room.floor === nextRoom.floor) {
			const lo = Math.min(room.xMm, nextRoom.xMm)
			const hi = Math.max(room.xMm, nextRoom.xMm)
			runs.push({ cableId: cable.id, hopIndex: i, type: 'h', channelKey: `${room.floor}:${level}`, lo, hi, floor: room.floor, level, lane: 0 })
			runs.push({ cableId: cable.id, hopIndex: i, type: 'rv', channelKey: `rv:${room.id}:${level}`, lo: 0, hi: 0, roomId: room.id, level, lane: 0 })
			runs.push({ cableId: cable.id, hopIndex: i, type: 'rv', channelKey: `rv:${nextRoom.id}:${level}`, lo: 0, hi: 0, roomId: nextRoom.id, level, lane: 0 })
			continue
		}

		if (!ladder) continue
		const exitLo = Math.min(room.xMm, ladder.xMm)
		const exitHi = Math.max(room.xMm, ladder.xMm)
		runs.push({ cableId: cable.id, hopIndex: i, type: 'h', channelKey: `${room.floor}:${level}`, lo: exitLo, hi: exitHi, floor: room.floor, level, lane: 0 })
		const vLo = Math.min(room.floor, nextRoom.floor)
		const vHi = Math.max(room.floor, nextRoom.floor)
		runs.push({ cableId: cable.id, hopIndex: i, type: 'v', channelKey: `lad:${ladder.id}`, lo: vLo, hi: vHi, ladderId: ladder.id, lane: 0 })
		const entryLo = Math.min(nextRoom.xMm, ladder.xMm)
		const entryHi = Math.max(nextRoom.xMm, ladder.xMm)
		runs.push({ cableId: cable.id, hopIndex: i, type: 'h', channelKey: `${nextRoom.floor}:${entryLevel}`, lo: entryLo, hi: entryHi, floor: nextRoom.floor, level: entryLevel, lane: 0 })
		runs.push({ cableId: cable.id, hopIndex: i, type: 'rv', channelKey: `rv:${room.id}:${level}`, lo: 0, hi: 0, roomId: room.id, level, lane: 0 })
		runs.push({ cableId: cable.id, hopIndex: i, type: 'rv', channelKey: `rv:${nextRoom.id}:${entryLevel}`, lo: 0, hi: 0, roomId: nextRoom.id, level: entryLevel, lane: 0 })
	}
	return runs
}

export function computeCableLanes(cables: Cable[], ctx: { rooms: RiserRoom[]; ladders: Ladder[] }): Map<string, CableRun[]> {
	const out = new Map<string, CableRun[]>()
	const sorted = [...cables].sort((a, b) => a.id.localeCompare(b.id))
	const channels = new Map<string, Array<Array<[number, number]>>>()
	const pointChannels = new Map<string, Map<string, number>>()

	for (const cable of sorted) {
		const runs = buildCableRuns(cable, ctx)
		for (const r of runs) {
			if (r.type === 'rv') {
				let m = pointChannels.get(r.channelKey)
				if (!m) { m = new Map(); pointChannels.set(r.channelKey, m) }
				let lane = m.get(cable.id)
				if (lane == null) { lane = m.size; m.set(cable.id, lane) }
				r.lane = lane
			} else {
				const lanes = channels.get(r.channelKey) ?? []
				let assigned = -1
				for (let li = 0; li < lanes.length; li++) {
					const overlaps = lanes[li].some(([lo, hi]) => !(r.hi <= lo || r.lo >= hi))
					if (!overlaps) { assigned = li; break }
				}
				if (assigned === -1) { assigned = lanes.length; lanes.push([]) }
				lanes[assigned].push([r.lo, r.hi])
				channels.set(r.channelKey, lanes)
				r.lane = assigned
			}
		}
		out.set(cable.id, runs)
	}
	// Second pass: stamp each run with its channel's final lane count so the renderer
	// can centre the bundle (and scale spacing to fit a ladder).
	for (const runs of out.values()) {
		for (const r of runs) {
			r.laneCount = r.type === 'rv'
				? pointChannels.get(r.channelKey)?.size ?? 1
				: channels.get(r.channelKey)?.length ?? 1
		}
	}
	return out
}

export const ROOM_ENTRY_DEPTH_MM = 300

export function roomInsideY(band: FloorYBand, level: CableLevel): number {
	if (level === 'high') return band.plenumBottomMm + ROOM_ENTRY_DEPTH_MM
	const surface = band.heights.raisedFloorMm > 0 ? band.raisedFloorTopMm : band.slabTopMm
	return surface - ROOM_ENTRY_DEPTH_MM
}

export function cablePolylinePoints(
	cable: Cable,
	runs: CableRun[],
	ctx: { rooms: RiserRoom[]; ladders: Ladder[]; bands: FloorYBand[] },
): string | null {
	const roomById = new Map(ctx.rooms.map((r) => [r.id, r]))
	const ladderById = new Map(ctx.ladders.map((l) => [l.id, l]))
	const bandByFloor = new Map(ctx.bands.map((b) => [b.floor, b]))
	const pts: Array<[number, number]> = []

	if (cable.segments.length < 2) return null

	function rvOffset(roomId: string, level: CableLevel): number {
		const r = runs.find((rr) => rr.type === 'rv' && rr.roomId === roomId && rr.level === level)
		return (r?.lane ?? 0) * LANE_SPACING_MM
	}

	const first = cable.segments[0]
	const firstRoom = roomById.get(first.roomId)
	if (!firstRoom) return null
	const firstBand = bandByFloor.get(firstRoom.floor)
	if (!firstBand) return null
	const firstLevel: CableLevel = first.level ?? 'high'
	pts.push([firstRoom.xMm + rvOffset(firstRoom.id, firstLevel), roomInsideY(firstBand, firstLevel)])

	for (let i = 0; i < cable.segments.length - 1; i++) {
		const seg = cable.segments[i]
		const next = cable.segments[i + 1]
		const level: CableLevel = seg.level ?? 'high'
		const entryLevel: CableLevel = next.entryLevel ?? level
		const room = roomById.get(seg.roomId)
		const ladder = seg.ladderId ? ladderById.get(seg.ladderId) : undefined
		const nextRoom = roomById.get(next.roomId)
		if (!room || !nextRoom) return null
		const bandA = bandByFloor.get(room.floor)
		const bandB = bandByFloor.get(nextRoom.floor)
		if (!bandA || !bandB) return null

		const insideYB = roomInsideY(bandB, entryLevel)
		const baseYA = levelYMm(bandA, level)
		const baseYB = levelYMm(bandB, entryLevel)

		const hopRuns = runs.filter((r) => r.hopIndex === i)
		const exitRun = hopRuns.find((r) => r.type === 'h' && r.floor === room.floor)
		const vRun = hopRuns.find((r) => r.type === 'v')
		const entryRun = hopRuns.find((r) => r.type === 'h' && r.floor === nextRoom.floor && r.level === entryLevel)

		const xExit = room.xMm + rvOffset(room.id, level)
		const xEntry = nextRoom.xMm + rvOffset(nextRoom.id, entryLevel)

		if (!ladder && room.floor === nextRoom.floor) {
			const yLane = baseYA + (exitRun?.lane ?? 0) * LANE_SPACING_MM
			const insideYBSame = roomInsideY(bandB, level)
			const xEntrySame = nextRoom.xMm + rvOffset(nextRoom.id, level)
			pts.push([xExit, yLane])
			pts.push([xEntrySame, yLane])
			pts.push([xEntrySame, insideYBSame])
			if (i < cable.segments.length - 2) {
				const nextDepart: CableLevel = next.level ?? level
				if (nextDepart !== level) {
					const xNext = nextRoom.xMm + rvOffset(nextRoom.id, nextDepart)
					pts.push([xNext, insideYBSame])
					pts.push([xNext, roomInsideY(bandB, nextDepart)])
				}
			}
			continue
		}

		if (!ladder) return null

		const exitLaneOffset = (exitRun?.lane ?? 0) * LANE_SPACING_MM
		const entryLaneOffset = (entryRun?.lane ?? 0) * LANE_SPACING_MM
		const ladderWidth = ladder.widthMm ?? 450
		// Centre the vertical riser bundle about the ladder axis and shrink per-lane
		// spacing to fit, so 3+ cables sharing a riser don't collapse onto each other.
		const vCount = vRun?.laneCount ?? 1
		const ladderInnerXMax = Math.max(0, ladderWidth / 2 - 50)
		const vSpacing = vCount > 1
			? Math.min(LANE_SPACING_MM, (2 * ladderInnerXMax) / (vCount - 1))
			: LANE_SPACING_MM
		const vCenteredLane = (vRun?.lane ?? 0) - (vCount - 1) / 2
		const ladderX = ladder.xMm + vCenteredLane * vSpacing

		const yExit = baseYA + exitLaneOffset
		const yEntry = baseYB + entryLaneOffset

		pts.push([xExit, yExit])
		pts.push([ladderX, yExit])
		pts.push([ladderX, yEntry])
		pts.push([xEntry, yEntry])
		pts.push([xEntry, insideYB])

		if (i < cable.segments.length - 2) {
			const departLevel: CableLevel = next.level ?? entryLevel
			if (departLevel !== entryLevel) {
				const xDepart = nextRoom.xMm + rvOffset(nextRoom.id, departLevel)
				const insideYDepart = roomInsideY(bandB, departLevel)
				pts.push([xDepart, insideYB])
				pts.push([xDepart, insideYDepart])
			}
		}
	}

	return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
}
