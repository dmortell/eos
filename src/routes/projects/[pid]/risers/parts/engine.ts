/**
 * @file src/routes/projects/[pid]/risers/parts/engine.ts
 * @description Pure helpers for the Riser tool — floor geometry, range expansion,
 * level-to-Y resolution, route validation. No Svelte / DOM dependencies.
 */

import type {
	FloorHeights,
	RiserDocData,
	Cable,
	CableLevel,
	Ladder,
	RiserRoom,
} from './types'
import { DEFAULT_FLOOR_HEIGHTS } from './types'

/** Resolve the height profile for a single floor, falling back to settings defaults. */
export function heightsFor(
	floor: number,
	doc: Pick<RiserDocData, 'floorHeights' | 'settings'>,
): FloorHeights {
	return doc.floorHeights[floor] ?? doc.settings.defaultFloorHeights ?? DEFAULT_FLOOR_HEIGHTS
}

/** Total stack height of a floor (slab + raised floor + clear + plenum). */
export function totalFloorHeightMm(h: FloorHeights): number {
	return h.slabMm + h.raisedFloorMm + h.clearHeightMm + h.plenumMm
}

/**
 * Y coordinates (in mm, measured downward from the top of the highest visible
 * floor) for one floor's structural surfaces.
 *
 * Layout for a single floor band, top → bottom (so smaller Y = higher up):
 *   [ plenum    ]   plenumTop      → plenumBottom (= ceilingTop)
 *   [ ceiling   ]   thin line (ceilingTop ≈ ceilingBottom; use plenumBottom)
 *   [ clear     ]   ceilingBottom  → raisedFloorTop
 *   [ raised fl ]   raisedFloorTop → raisedFloorBottom (= slabTop)
 *   [ slab      ]   slabTop        → slabBottom
 */
export interface FloorYBand {
	floor: number
	topMm: number          // top of this floor's plenum (highest point on screen)
	plenumBottomMm: number // = ceiling top
	raisedFloorTopMm: number
	slabTopMm: number
	slabBottomMm: number   // = top of the floor below (or stack bottom)
	heights: FloorHeights
}

/**
 * Compute Y bands for every floor in the visible range. The TOP of the range
 * (highest floor number) sits at Y=0; floors stack downward in increasing Y.
 *
 * @param doc       riser doc (heights + settings)
 * @param from      lowest floor number visible
 * @param to        highest floor number visible
 * @returns         array ordered TOP-to-BOTTOM (highest floor first)
 */
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
	// Highest floor first → top of canvas
	for (let f = hi; f >= lo; f--) {
		if (hidden.has(f)) continue
		const h = heightsFor(f, doc)
		const topMm = cursor
		const plenumBottomMm = topMm + h.plenumMm
		const raisedFloorTopMm = plenumBottomMm + h.clearHeightMm
		const slabTopMm = raisedFloorTopMm + h.raisedFloorMm
		const slabBottomMm = slabTopMm + h.slabMm
		bands.push({
			floor: f,
			topMm,
			plenumBottomMm,
			raisedFloorTopMm,
			slabTopMm,
			slabBottomMm,
			heights: h,
		})
		cursor = slabBottomMm
	}
	return bands
}

/**
 * Find Y positions where consecutive *visible* bands skip one or more floors —
 * i.e. there's a hidden-floor gap between them. Returned as a list of
 * { yMm, hiddenFloors } where yMm is the boundary between the higher band's
 * slab-bottom and the lower band's top.
 */
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

/** Total stack height of the visible range (mm). */
export function totalStackHeightMm(bands: FloorYBand[]): number {
	if (!bands.length) return 0
	return bands[bands.length - 1].slabBottomMm
}

/**
 * Y position (mm) for a cable running at a given level on a given floor.
 *  - high → mid-plenum
 *  - low  → mid-raised-floor (or mid-clear-bottom if no raised floor)
 */
export function levelYMm(band: FloorYBand, level: CableLevel): number {
	if (level === 'high') {
		return (band.topMm + band.plenumBottomMm) / 2
	}
	// low
	if (band.heights.raisedFloorMm > 0) {
		return (band.raisedFloorTopMm + band.slabTopMm) / 2
	}
	// no raised floor — sit on slab
	return band.slabTopMm - 50
}

/** Find a band by floor number; returns undefined if outside the visible range. */
export function bandForFloor(bands: FloorYBand[], floor: number): FloorYBand | undefined {
	return bands.find((b) => b.floor === floor)
}

/** Mid-Y (mm) of the clear (occupiable) space on a floor — used for room centres. */
export function roomCentreYMm(band: FloorYBand): number {
	return (band.plenumBottomMm + band.raisedFloorTopMm) / 2
}

// ─────────────────────────────────────────────────────────────────────────────
// Visible-range helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Clamp a (from, to) range to the floors that actually exist in the project. */
export function clampRange(
	from: number,
	to: number,
	available: number[],
): { from: number; to: number } {
	if (!available.length) return { from, to }
	const min = Math.min(...available)
	const max = Math.max(...available)
	const f = Math.max(min, Math.min(from, max))
	const t = Math.max(min, Math.min(to, max))
	return { from: Math.min(f, t), to: Math.max(f, t) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Route validation (used in Phase 3 — exposed early so Cable rendering can
// fail-safe on malformed routes)
// ─────────────────────────────────────────────────────────────────────────────

export interface RouteIssue {
	segmentIndex: number
	severity: 'error' | 'warning'
	message: string
}

export function validateRoute(
	cable: Cable,
	ctx: { rooms: RiserRoom[]; ladders: Ladder[] },
): RouteIssue[] {
	const issues: RouteIssue[] = []
	const { segments } = cable
	if (segments.length < 2) {
		issues.push({ segmentIndex: 0, severity: 'error', message: 'Route needs at least 2 hops.' })
		return issues
	}
	const roomById = new Map(ctx.rooms.map((r) => [r.id, r]))
	const ladderById = new Map(ctx.ladders.map((l) => [l.id, l]))
	for (let i = 0; i < segments.length; i++) {
		const s = segments[i]
		const room = roomById.get(s.roomId)
		if (!room) {
			issues.push({ segmentIndex: i, severity: 'error', message: 'Room not found.' })
			continue
		}
		if (i < segments.length - 1) {
			const next = segments[i + 1]
			const nextRoom = roomById.get(next.roomId)
			if (!nextRoom) continue
			if (!s.ladderId) {
				// No ladder is fine if both rooms are on the same floor.
				if (room.floor !== nextRoom.floor) {
					issues.push({
						segmentIndex: i,
						severity: 'error',
						message: `Hop spans floors ${room.floor} → ${nextRoom.floor} but no ladder is selected.`,
					})
				}
				continue
			}
			const ladder = ladderById.get(s.ladderId)
			if (!ladder) {
				issues.push({ segmentIndex: i, severity: 'error', message: 'Ladder not found.' })
				continue
			}
			const lo = Math.min(ladder.fromFloor, ladder.toFloor)
			const hi = Math.max(ladder.fromFloor, ladder.toFloor)
			if (room.floor < lo || room.floor > hi || nextRoom.floor < lo || nextRoom.floor > hi) {
				issues.push({
					segmentIndex: i,
					severity: 'error',
					message: `Ladder ${ladder.label} does not span floors ${room.floor} → ${nextRoom.floor}.`,
				})
			}
			// Transit room should be EPS (warning only).
			if (i > 0 && room.kind !== 'eps') {
				issues.push({
					segmentIndex: i,
					severity: 'warning',
					message: 'Transit hops are typically EPS rooms.',
				})
			}
		}
	}
	return issues
}

// ─────────────────────────────────────────────────────────────────────────────
// Cable lane spacing — parallel cables sharing a route get perpendicular
// offsets so they don't render on top of each other.
//
// Model:
//   - HORIZONTAL channel = (floor, level). All horizontal cable runs at that
//     floor+level share lanes. Lane offset is applied in Y.
//   - VERTICAL channel   = (ladderId). All cable runs through that ladder
//     share lanes. Lane offset is applied in X.
//
// Lane assignment is interval-scheduling: cables sorted deterministically by
// id; for each run, pick the lowest lane index whose existing intervals don't
// overlap the new one. Per-channel lane indices grow as needed.
// ─────────────────────────────────────────────────────────────────────────────

/** Perpendicular spacing (mm) between adjacent parallel cables. */
export const LANE_SPACING_MM = 100

/** One straight stretch of a cable path — used for lane assignment + rendering. */
export interface CableRun {
	cableId: string
	hopIndex: number
	/** 'h' = floor-horizontal at a level; 'v' = vertical inside a ladder; 'rv' = short vertical at a room entry/exit. */
	type: 'h' | 'v' | 'rv'
	/** Shared resource the run uses (`${floor}:${level}` for h, `lad:${ladderId}` for v, `rv:${roomId}:${level}` for rv). */
	channelKey: string
	/** Interval the run occupies on its channel (mm for horizontal, floor # for vertical, unused for rv). */
	lo: number
	hi: number
	/** Floor (for horizontal runs only). */
	floor?: number
	/** Level the run sits at (horizontal + rv). */
	level?: CableLevel
	/** Ladder id (vertical only). */
	ladderId?: string
	/** Room id (rv only). */
	roomId?: string
	/** Assigned lane index — set after interval scheduling. */
	lane: number
}

/**
 * Build the geometric runs that make up a cable's path. A non-final hop produces
 * three runs: an exit horizontal (current floor), a vertical through the ladder,
 * and an entry horizontal (next floor at the same level — transition to the next
 * hop's level happens inside the destination room).
 */
export function buildCableRuns(
	cable: Cable,
	ctx: { rooms: RiserRoom[]; ladders: Ladder[] },
): CableRun[] {
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
		// Entry level into the next room — may differ from the exit level when a
		// ladder is involved (ladder shaft handles the level transition).
		const entryLevel: CableLevel = next.entryLevel ?? level
		if (!room || !nextRoom) continue

		// Same-floor hop (no ladder) — one horizontal run between the rooms,
		// plus the two room-vertical jogs. Entry level is forced to match exit
		// since there's no ladder to transition through.
		if (!ladder && room.floor === nextRoom.floor) {
			const lo = Math.min(room.xMm, nextRoom.xMm)
			const hi = Math.max(room.xMm, nextRoom.xMm)
			runs.push({
				cableId: cable.id, hopIndex: i, type: 'h',
				channelKey: `${room.floor}:${level}`,
				lo, hi, floor: room.floor, level, lane: 0,
			})
			runs.push({
				cableId: cable.id, hopIndex: i, type: 'rv',
				channelKey: `rv:${room.id}:${level}`,
				lo: 0, hi: 0, roomId: room.id, level, lane: 0,
			})
			runs.push({
				cableId: cable.id, hopIndex: i, type: 'rv',
				channelKey: `rv:${nextRoom.id}:${level}`,
				lo: 0, hi: 0, roomId: nextRoom.id, level, lane: 0,
			})
			continue
		}

		if (!ladder) continue
		const exitLo = Math.min(room.xMm, ladder.xMm)
		const exitHi = Math.max(room.xMm, ladder.xMm)
		runs.push({
			cableId: cable.id, hopIndex: i, type: 'h',
			channelKey: `${room.floor}:${level}`,
			lo: exitLo, hi: exitHi, floor: room.floor, level, lane: 0,
		})
		const vLo = Math.min(room.floor, nextRoom.floor)
		const vHi = Math.max(room.floor, nextRoom.floor)
		runs.push({
			cableId: cable.id, hopIndex: i, type: 'v',
			channelKey: `lad:${ladder.id}`,
			lo: vLo, hi: vHi, ladderId: ladder.id, lane: 0,
		})
		const entryLo = Math.min(nextRoom.xMm, ladder.xMm)
		const entryHi = Math.max(nextRoom.xMm, ladder.xMm)
		runs.push({
			cableId: cable.id, hopIndex: i, type: 'h',
			channelKey: `${nextRoom.floor}:${entryLevel}`,
			lo: entryLo, hi: entryHi, floor: nextRoom.floor, level: entryLevel, lane: 0,
		})
		runs.push({
			cableId: cable.id, hopIndex: i, type: 'rv',
			channelKey: `rv:${room.id}:${level}`,
			lo: 0, hi: 0, roomId: room.id, level, lane: 0,
		})
		runs.push({
			cableId: cable.id, hopIndex: i, type: 'rv',
			channelKey: `rv:${nextRoom.id}:${entryLevel}`,
			lo: 0, hi: 0, roomId: nextRoom.id, level: entryLevel, lane: 0,
		})
	}
	return runs
}

/**
 * Assign lane indices to every cable run via interval scheduling per channel.
 * Two runs sharing a channel get different lanes iff their intervals overlap.
 */
export function computeCableLanes(
	cables: Cable[],
	ctx: { rooms: RiserRoom[]; ladders: Ladder[] },
): Map<string, CableRun[]> {
	const out = new Map<string, CableRun[]>()
	const sorted = [...cables].sort((a, b) => a.id.localeCompare(b.id))
	/** Interval channels (h, v) — channelKey → array of lanes (each lane = list of placed intervals [lo,hi]). */
	const channels = new Map<string, Array<Array<[number, number]>>>()
	/** Degenerate point-channels (rv) — channelKey → Map<cableId, laneIndex>. */
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
				if (assigned === -1) {
					assigned = lanes.length
					lanes.push([])
				}
				lanes[assigned].push([r.lo, r.hi])
				channels.set(r.channelKey, lanes)
				r.lane = assigned
			}
		}
		out.set(cable.id, runs)
	}
	return out
}

/** How far inside a room (mm past the ceiling or floor) the cable terminates. */
export const ROOM_ENTRY_DEPTH_MM = 300

/** Y inside the room body at which the cable runs after a level entry. */
export function roomInsideY(band: FloorYBand, level: CableLevel): number {
	if (level === 'high') {
		// Just below the ceiling — cable drops down from the plenum into the room.
		return band.plenumBottomMm + ROOM_ENTRY_DEPTH_MM
	}
	// Just above the raised-floor surface (or slab top, if no raised floor) — cable
	// rises up from the floor void into the room.
	const surface = band.heights.raisedFloorMm > 0 ? band.raisedFloorTopMm : band.slabTopMm
	return surface - ROOM_ENTRY_DEPTH_MM
}

/**
 * Build the SVG polyline points (mm) for a cable, given its lane-assigned runs.
 * Returns null if any referenced room/ladder/band is missing — caller can skip
 * rendering rather than emit a broken path.
 *
 * Path shape per hop:
 *   inside-room → room edge (still inside) → short vertical out into plenum/void
 *   → horizontal in void at lane Y → ladder → through ladder
 *   → horizontal in void at lane Y → next room edge → short vertical entry into room
 *   → inside next room
 * Between hops, if the level changes, a vertical transition is drawn inside the
 * transit room from the arrival inside-Y to the departure inside-Y.
 */
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

	/** Lane X-offset for room-vertical runs (degenerate channel, simple stacking). */
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
		// Cable arrives at the next room at this level — may differ from `level`
		// only when there's a ladder to handle the transition.
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

		// Same-floor hop (no ladder): one horizontal run at lane Y between
		// the two rooms. Entry level forced to match exit (no ladder to transition).
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
		const vLaneOffset = ((vRun?.lane ?? 0) - 0) * LANE_SPACING_MM
		const ladderInnerXMax = ladderWidth / 2 - LANE_SPACING_MM
		const clampedVOffset = Math.max(-ladderInnerXMax, Math.min(ladderInnerXMax, vLaneOffset))
		const ladderX = ladder.xMm + clampedVOffset

		const yExit = baseYA + exitLaneOffset
		const yEntry = baseYB + entryLaneOffset

		// Short vertical out of room A at the exit level's lane X.
		pts.push([xExit, yExit])
		// Horizontal at exit-lane Y over to the ladder.
		pts.push([ladderX, yExit])
		// Vertical through the ladder — spans from exit level on floor A to
		// entry level on floor B (level transition happens inside the ladder).
		pts.push([ladderX, yEntry])
		// Horizontal at entry-lane Y to the next room's entry-lane X.
		pts.push([xEntry, yEntry])
		// Short vertical entry into the next room at the entry level.
		pts.push([xEntry, insideYB])

		// If room B is a transit and the cable departs at a different level than
		// it arrived, jog inside the room from arrival lane X / inside-Y to the
		// departure lane X / inside-Y.
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

// ─────────────────────────────────────────────────────────────────────────────
// Picking — translate client coordinates to mm and find the floor under a point
// ─────────────────────────────────────────────────────────────────────────────

/** Map a client (screen) point to the SVG's user-space (mm) coordinates. */
export function svgPointFromClient(
	svg: SVGSVGElement,
	clientX: number,
	clientY: number,
): { x: number; y: number } {
	const pt = svg.createSVGPoint()
	pt.x = clientX
	pt.y = clientY
	const ctm = svg.getScreenCTM()
	if (!ctm) return { x: 0, y: 0 }
	const p = pt.matrixTransform(ctm.inverse())
	return { x: p.x, y: p.y }
}

/** Find the floor band containing a given Y (mm). Falls back to the nearest band. */
export function bandAtY(bands: FloorYBand[], yMm: number): FloorYBand | undefined {
	if (!bands.length) return undefined
	for (const b of bands) {
		if (yMm >= b.topMm && yMm <= b.slabBottomMm) return b
	}
	// Outside the stack — return nearest by distance.
	let best = bands[0]
	let bestDist = Math.min(Math.abs(yMm - best.topMm), Math.abs(yMm - best.slabBottomMm))
	for (const b of bands) {
		const d = Math.min(Math.abs(yMm - b.topMm), Math.abs(yMm - b.slabBottomMm))
		if (d < bestDist) {
			best = b
			bestDist = d
		}
	}
	return best
}

// ─────────────────────────────────────────────────────────────────────────────
// ID helpers
// ─────────────────────────────────────────────────────────────────────────────

let _seq = 0
export function nextId(prefix: string): string {
	_seq++
	return `${prefix}_${Date.now().toString(36)}_${_seq.toString(36)}`
}
