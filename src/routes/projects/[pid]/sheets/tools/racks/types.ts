// Minimal racks data-model subset for the read-only render, copied from the production racks tool.
export type DeviceType = 'panel' | 'enclosure' | 'switch' | 'server' | 'manager' | 'shelf' | 'pdu' | 'other'
export type RackType = '2-post' | '4-post' | 'cabinet' | 'desk' | 'shelf' | 'vcm'
export type MountingPosition = 'front' | 'rear' | 'both' | 'none'
export type ElevationFace = 'front' | 'rear'
export type RackFace = 'front' | 'rear' | 'plan'

export interface RackRow {
	id: string
	label: string
	plan?: { originMm: { x: number; y: number }; rotationDeg: number }
}

export interface RackConfig {
	id: string
	label: string
	rowId: string
	order: number
	heightU: number
	heightMm: number
	widthMm: number
	depthMm: number
	type: RackType
	color?: string
	frontProtrusionMm?: number
	/** Sheet layer (any layer). Absent → 'racks'. */
	layerId?: string
}

export interface DeviceConfig {
	id: string
	rackId: string
	label: string
	type: DeviceType
	heightU: number
	positionU: number       // 1-based from bottom
	portCount: number
	color?: string
	widthMm?: number
	depthMm?: number
	mounting?: MountingPosition
	offsetX?: number
	/** Sheet layer (any layer). Absent → 'devices'. */
	layerId?: string
}

export interface RackSettings {
	slabLevel: number
	floorLevel: number
	ceilingLevel: number
	leftWallX: number
	rightWallX: number
	showGrid: boolean
}

export type RoomObjectKind = 'wall' | 'door' | 'rect'
export interface RoomObject {
	id: string
	kind: RoomObjectKind
	position: { x: number; y: number }
	endPosition?: { x: number; y: number }
	widthMm?: number
	depthMm?: number
	rotationDeg?: number
	thicknessMm?: number
	label?: string
	swing?: 'left' | 'right'
	color?: string
}

export interface RackDocData {
	rows?: RackRow[]
	racks?: RackConfig[]
	devices?: DeviceConfig[]
	settings?: RackSettings
	roomObjects?: RoomObject[]
}
