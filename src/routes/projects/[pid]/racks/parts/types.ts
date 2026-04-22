export type DeviceType = 'panel' | 'enclosure' | 'switch' | 'server' | 'manager' | 'shelf' | 'pdu' | 'other'
export type RackType = '2-post' | '4-post' | 'cabinet' | 'desk' | 'shelf' | 'vcm'
export type PortType = 'RJ45' | 'LC' | 'SC' | 'SFP' | null

export interface RackRow {
	id: string
	label: string // "Row A", "Row B"
	/** Starter values for new racks in this row and baseline for BOM/compatibility.
	 *  Per-rack edits are allowed; rows may become heterogeneous. */
	defaults?: {
		heightU?: number
		color?: string
		depthMm?: number
		containment?: RowContainment
	}
	/** Plan-view placement within the server room (mm, room-relative) */
	plan?: {
		originMm: { x: number; y: number }
		rotationDeg: number
	}
}

export type RowContainment = 'none' | 'hac' | 'cac' | 'combined'

export const rackTypes = [
	{ id: '2-post', label: '2-Post' },
	{ id: '4-post', label: '4-Post' },
	{ id: 'cabinet', label: 'Cabinet' },
	{ id: 'desk', label: 'Desk' },
	{ id: 'shelf', label: 'Shelf' },
	{ id: 'vcm', label: 'Vertical Cable Manager' },
]

export interface RackConfig {
	id: string
	label: string // "A101"
	rowId: string // which row
	order: number // display order within row
	heightU: number // 42, 48, etc
	heightMm: number // physical height in mm
	widthMm: number // 600, 800
	depthMm: number // 1000, 1200
	type: RackType
	serverRoom?: string // 'A', 'B', 'C', 'D' — which server room this rack is in
	maker?: string
	model?: string
	shelfHeights?: number[] // mm from floor, for desk/shelf types (4 adjustable lines)
	// ── Catalog linkage (populated when added via catalog browser) ──
	sku?: string
	productRef?: string // catalog product id (maker-sku slug)
	color?: string
	adjustable?: boolean
	minDepthMm?: number
	maxDepthMm?: number
	/** Forward protrusion past rack front (mm) — nonzero for VCMs like Panduit PR2V/PE2V. */
	frontProtrusionMm?: number
	containmentCapability?: {
		hacTopCap?: string
		cacTopCap?: string
		containmentKitBlack?: string
		containmentKitWhite?: string
	}
	// ── Frame linkage (0..1 per rack) ──
	frameId?: string
	// ── Free-form notes (shown in properties panel + row BOM) ──
	notes?: string
}

/** Default shelf/tray heights for desk and shelf rack types */
export const DEFAULT_SHELF_HEIGHTS: Record<string, number[]> = {
	desk:  [600, 800, 0, 0],
	shelf: [300, 600, 900, 1200],
}

export type MountingPosition = 'front' | 'rear' | 'both' | 'none'

export interface DeviceConfig {
	id: string
	rackId: string
	label: string // hostname or user label
	type: DeviceType
	heightU: number
	positionU: number // 1-based from bottom of rack
	portCount: number
	portType?: PortType
	maker?: string
	model?: string
	color?: string
	widthMm?: number // device width override (for non-19" items like tower PCs, monitors)
	depthMm?: number // device depth in mm (defaults to rack depth)
	mounting?: MountingPosition // rail mounting position (default 'both')
	offsetX?: number // horizontal offset from center in mm (positive = right, snapped to 25mm)
	// Patch panel fields (only relevant when type === 'panel')
	patchLevel?: 'floor' | 'high' // floor-level or high-level (ceiling) ports
	serverRoom?: string // 'A', 'B', 'C', 'D' — which server room this panel serves
}

export interface DeviceTemplate {
	id: string
	label: string
	description: string
	type: DeviceType
	heightU: number
	portCount: number
	portType?: PortType
	widthMm?: number
	depthMm?: number
	maker?: string
	icon: string
}

// ── Canvas view (exclusive — one view at a time) ──
export type ElevationFace = 'front' | 'rear'
export type RackView = 'front' | 'rear' | 'plan'
export const RACK_VIEWS: RackView[] = ['front', 'rear', 'plan']
export const RACK_VIEW_DEFAULT: RackView = 'front'

/**
 * Legacy bitmask constants — retained temporarily so existing saved snapshots
 * and old URL params can be migrated. New code should use `RackView` instead.
 * @deprecated use RackView
 */
export const VIEW_FRONT = 0b0001
/** @deprecated use RackView */
export const VIEW_REAR  = 0b0010
/** @deprecated use RackView */
export const VIEW_PLAN  = 0b0100
/** @deprecated use RackView */
export const VIEW_DEFAULT = VIEW_FRONT

/** Collapse the legacy view bitmask to a single view (priority: plan > front > rear). */
export function viewFromMask(mask: number): RackView {
	if (mask & VIEW_PLAN) return 'plan'
	if (mask & VIEW_FRONT) return 'front'
	if (mask & VIEW_REAR) return 'rear'
	return RACK_VIEW_DEFAULT
}

export interface RackSettings {
	slabLevel: number // mm, default 0
	floorLevel: number // mm, default 150
	ceilingLevel: number // mm, default 2600
	leftWallX: number // mm, default -300
	rightWallX: number // mm, default 6000
	showGrid: boolean
}

/** ── Plan-view room objects (walls, doors, generic rects) ── */
export type RoomObjectKind = 'wall' | 'door' | 'rect'

/**
 * An object drawn in the server-room plan view. All coordinates are
 * room-relative millimetres (x right, y down — same convention as rack rows).
 */
export interface RoomObject {
	id: string
	kind: RoomObjectKind
	/** Primary position — start point for walls, top-left for rects/doors. */
	position: { x: number; y: number }
	/** End point — for line-like objects (walls). */
	endPosition?: { x: number; y: number }
	/** Rectangular bounds — for rects and doors. */
	widthMm?: number
	depthMm?: number
	rotationDeg?: number
	/** Wall thickness (stroke weight for line-like objects). */
	thicknessMm?: number
	label?: string
	/** Door swing direction relative to its hinge. */
	swing?: 'left' | 'right'
	/** Color override (hex). */
	color?: string
}

export interface RackDocData {
	floor: number
	room: string
	rows: RackRow[]
	racks: RackConfig[]
	devices: DeviceConfig[]
	library: DeviceTemplate[]
	settings: RackSettings
	roomObjects?: RoomObject[]
}

export interface ViewState {
	x: number
	y: number
	zoom: number
	scale: number
	grid: number
	width: number
	height: number
	showGrid: boolean
	panning: boolean
	dragging: boolean
	button: number
	bottom: number
}

export interface Project {
	id: string
	name: string
	description: string
	ownerId?: string
	createdAt?: number
	updatedAt?: number
	// pdfFiles?: string[] // array of PDF file URLs associated with the project
	// settings:{}
}
