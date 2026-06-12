/**
 * @file src/routes/projects/[pid]/risers/parts/types.ts
 * @description Type definitions for the Riser tool — building elevation
 * with vertical cable risers and inter-floor routing.
 *
 * Coordinate convention: all geometry in mm. Y=0 is the top of the lowest
 * visible floor's slab; positive Y grows DOWNWARD in raw mm. The Canvas
 * flips Y for display so upper floors render higher on screen.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Per-floor structural geometry
// ─────────────────────────────────────────────────────────────────────────────

export interface FloorHeights {
	/** Structural slab thickness (mm). Default 200. */
	slabMm: number
	/** Raised-floor height above slab (mm). Default 300. 0 = none. */
	raisedFloorMm: number
	/** Clear ceiling height above raised floor (mm). Default 2600. */
	clearHeightMm: number
	/** Plenum void above ceiling, below next slab (mm). Default 700. */
	plenumMm: number
}

export const DEFAULT_FLOOR_HEIGHTS: FloorHeights = {
	slabMm: 200,
	raisedFloorMm: 300,
	clearHeightMm: 2600,
	plenumMm: 700,
}

// ─────────────────────────────────────────────────────────────────────────────
// Rooms placed on the elevation
// ─────────────────────────────────────────────────────────────────────────────

export type RoomKind = 'server' | 'eps'

export interface RiserRoom {
	id: string
	kind: RoomKind
	floor: number
	/** Horizontal centre of the room on the elevation (mm). */
	xMm: number
	widthMm: number
	/** Optional link back to a racks-tool room key (A/B/C/D). */
	serverRoomKey?: string
	label: string
	color?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Vertical ladders / risers
// ─────────────────────────────────────────────────────────────────────────────

export type LadderLevel = 'high' | 'low' | 'both'

export interface Ladder {
	id: string
	label: string
	/** Horizontal position shared across all floors the ladder spans (mm). */
	xMm: number
	fromFloor: number
	toFloor: number
	level: LadderLevel
	widthMm?: number
	color?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Cables and routing
// ─────────────────────────────────────────────────────────────────────────────

export type CableMedia = 'copper' | 'fiber'
export type CableLevel = 'high' | 'low'
export type CableCountUnit = 'core' | 'port' | 'pair'

/** One hop in a cable route. */
export interface CableSegment {
	/** Room the cable enters/exits at this hop. */
	roomId: string
	/** Level the cable runs at *leaving* this room (ignored on final segment). */
	level?: CableLevel
	/** Level the cable was at *arriving* at this room (ignored on first segment).
	 *  Defaults to the previous segment's `level` if undefined. Allows a hop to
	 *  exit at one level and enter the next room at a different level. */
	entryLevel?: CableLevel
	/** Ladder used to travel to the next room (omit on final segment). */
	ladderId?: string
}

export interface Cable {
	id: string
	label?: string
	/** Free-form spec, e.g. "OM4 48-core" or "CAT6A 24-port". */
	type: string
	media?: CableMedia
	mediaSpec?: string
	count?: number
	countUnit?: CableCountUnit
	/** Ordered hops. First = source room, last = destination room. */
	segments: CableSegment[]
	color?: string
	notes?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Drawing labels (free-form multi-line text annotations placed on the canvas)
// ─────────────────────────────────────────────────────────────────────────────

export interface TextLabel {
	id: string
	/** Top-left position of the label in mm. */
	xMm: number
	yMm: number
	/** Text content. Newlines (`\n`) render as line breaks. */
	text: string
	/** Font size in mm. Defaults to 240. */
	fontSizeMm?: number
	/** Text color (CSS). */
	color?: string
	/** Background fill (CSS) — useful for placing labels over cables/rooms. */
	background?: string
	/** Width box for text wrapping (mm). 0/undefined = auto. */
	widthMm?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool settings + top-level doc
// ─────────────────────────────────────────────────────────────────────────────

export interface RiserSettings {
	/** Horizontal mm of building per pixel at zoom 1. Default 10. */
	mmPerPx: number
	/** Drawn building width (mm). Default 30_000. */
	widthMm: number
	showGrid: boolean
	defaultFloorHeights: FloorHeights
}

export const DEFAULT_RISER_SETTINGS: RiserSettings = {
	mmPerPx: 10,
	widthMm: 30_000,
	showGrid: true,
	defaultFloorHeights: DEFAULT_FLOOR_HEIGHTS,
}

export interface RiserDocData {
	projectId: string
	/** Per-floor height overrides — keyed by floor number. */
	floorHeights: Record<number, FloorHeights>
	/** Visible floor range (subset of project.floors). */
	fromFloor: number
	toFloor: number
	/** Floors hidden from the elevation — gaps are shown as compression breaks. */
	hiddenFloors?: number[]
	rooms: RiserRoom[]
	ladders: Ladder[]
	cables: Cable[]
	labels?: TextLabel[]
	settings: RiserSettings
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas view state (matches racks/frames pan/zoom conventions)
// ─────────────────────────────────────────────────────────────────────────────

export interface ViewState {
	x: number
	y: number
	zoom: number
	width: number
	height: number
	panning: boolean
	button: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Editor modes
// ─────────────────────────────────────────────────────────────────────────────

export type RiserMode = 'select' | 'addServer' | 'addEps' | 'addLadder' | 'addCable' | 'addLabel'

export const RISER_MODES: RiserMode[] = ['select', 'addServer', 'addEps', 'addLadder', 'addCable', 'addLabel']
