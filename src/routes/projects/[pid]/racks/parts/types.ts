export type DeviceType = 'panel' | 'switch' | 'server' | 'manager' | 'shelf' | 'pdu' | 'other'
export type RackType = '2-post' | '4-post' | 'cabinet'
export type PortType = 'RJ45' | 'LC' | 'SC' | 'SFP' | null

export interface RackRow {
	id: string
	label: string // "Row A", "Row B"
}

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
