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
	doc: Pick<RiserDocData, 'floorHeights' | 'settings'>,
	from: number,
	to: number,
): FloorYBand[] {
	const lo = Math.min(from, to)
	const hi = Math.max(from, to)
	const bands: FloorYBand[] = []
	let cursor = 0
	// Highest floor first → top of canvas
	for (let f = hi; f >= lo; f--) {
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
			if (!s.ladderId) {
				issues.push({ segmentIndex: i, severity: 'error', message: 'Hop is missing a ladder.' })
				continue
			}
			const ladder = ladderById.get(s.ladderId)
			if (!ladder) {
				issues.push({ segmentIndex: i, severity: 'error', message: 'Ladder not found.' })
				continue
			}
			const next = segments[i + 1]
			const nextRoom = roomById.get(next.roomId)
			if (!nextRoom) continue
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
export const LANE_SPACING_MM = 40

/** Per-segment lane index for a cable's horizontal & vertical runs. */
export interface CableLaneAssignment {
	/** Horizontal lane for the run *leaving* segment[i] toward segment[i+1]. */
	hLane: number
	/** Vertical lane for the ladder traversal between segment[i] and segment[i+1]. */
	vLane: number
}

/** Map from cable id → ordered lane assignments (one entry per non-final hop). */
export type CableLaneMap = Map<string, CableLaneAssignment[]>

/**
 * Compute lane indices for every cable hop so parallel runs don't overlap.
 *
 * Implementation note: this is a Phase-3 helper — exposed early so cable
 * rendering can call it and the algorithm lives next to the routing logic.
 * For now it produces a deterministic but trivial assignment (lane 0 for all)
 * pending the interval-scheduling pass.
 *
 * TODO(Phase 3): implement true interval scheduling per channel.
 */
export function computeCableLanes(
	cables: Cable[],
	_ctx: { rooms: RiserRoom[]; ladders: Ladder[] },
): CableLaneMap {
	const out: CableLaneMap = new Map()
	for (const c of cables) {
		const hops = Math.max(0, c.segments.length - 1)
		out.set(
			c.id,
			Array.from({ length: hops }, () => ({ hLane: 0, vLane: 0 })),
		)
	}
	return out
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
