export type DeviceType = 'panel' | 'enclosure' | 'switch' | 'server' | 'manager' | 'shelf' | 'pdu' | 'other'
export type RackType = '2-post' | '4-post' | 'cabinet' | 'desk' | 'shelf' | 'vcm'
export type PortType = 'RJ45' | 'LC' | 'SC' | 'SFP' | null

export interface RackRow {
	id: string
	label: string // "Row A", "Row B"
}

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
}

/** Default shelf/tray heights for desk and shelf rack types */
export const DEFAULT_SHELF_HEIGHTS: Record<string, number[]> = {
	desk:  [600, 800, 0, 0],
	shelf: [300, 600, 900, 1200],
}

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

export interface RackSettings {
	slabLevel: number // mm, default 0
	floorLevel: number // mm, default 150
	ceilingLevel: number // mm, default 2600
	leftWallX: number // mm, default -300
	rightWallX: number // mm, default 6000
	showGrid: boolean
}

export interface RackDocData {
	floor: number
	room: string
	rows: RackRow[]
	racks: RackConfig[]
	devices: DeviceConfig[]
	library: DeviceTemplate[]
	settings: RackSettings
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
