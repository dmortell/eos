// Minimal risers data-model subset for the read-only render, copied from the production risers tool.
// Coordinate convention: all geometry in mm. Y grows downward; the engine stacks the highest
// visible floor at Y=0 so it renders at the top (SVG y-down) with no flip.

export interface FloorHeights {
	slabMm: number
	raisedFloorMm: number
	clearHeightMm: number
	plenumMm: number
}

export const DEFAULT_FLOOR_HEIGHTS: FloorHeights = {
	slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2600, plenumMm: 700,
}

export type RoomKind = 'server' | 'eps'
export interface RiserRoom {
	id: string
	kind: RoomKind
	floor: number
	xMm: number
	widthMm: number
	serverRoomKey?: string
	label: string
	color?: string
	/** Sheet layer (any layer). Absent → 'rooms'. */
	layerId?: string
}

export type LadderLevel = 'high' | 'low' | 'both'
export interface Ladder {
	id: string
	label: string
	xMm: number
	fromFloor: number
	toFloor: number
	level: LadderLevel
	widthMm?: number
	color?: string
	/** Sheet layer (any layer). Absent → 'ladders'. */
	layerId?: string
}

export type CableMedia = 'copper' | 'fiber'
export type CableLevel = 'high' | 'low'
export type CableCountUnit = 'core' | 'port' | 'pair'

export interface CableSegment {
	roomId: string
	level?: CableLevel
	entryLevel?: CableLevel
	ladderId?: string
}

export interface Cable {
	id: string
	label?: string
	type: string
	media?: CableMedia
	mediaSpec?: string
	count?: number
	countUnit?: CableCountUnit
	segments: CableSegment[]
	color?: string
	notes?: string
	/** Sheet layer (any layer). Absent → 'cables'. */
	layerId?: string
}

export interface TextLabel {
	id: string
	xMm: number
	yMm: number
	text: string
	fontSizeMm?: number
	color?: string
	background?: string
	widthMm?: number
}

export interface RiserSettings {
	mmPerPx: number
	widthMm: number
	showGrid: boolean
	defaultFloorHeights: FloorHeights
}

export const DEFAULT_RISER_SETTINGS: RiserSettings = {
	mmPerPx: 10, widthMm: 30_000, showGrid: true, defaultFloorHeights: DEFAULT_FLOOR_HEIGHTS,
}

export interface RiserDocData {
	projectId?: string
	floorHeights: Record<number, FloorHeights>
	fromFloor: number
	toFloor: number
	hiddenFloors?: number[]
	rooms: RiserRoom[]
	ladders: Ladder[]
	cables: Cable[]
	labels?: TextLabel[]
	settings: RiserSettings
}
