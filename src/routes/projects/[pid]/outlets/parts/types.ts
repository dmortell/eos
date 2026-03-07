/** All coordinates in real-world mm from origin. X-right, Y-down (plan view). */
export interface Point { x: number; y: number }

export type OutletLevel = 'low' | 'high'
export type CableType = 'cat5e' | 'cat6' | 'cat6a' | 'fiber-sm' | 'fiber-mm'
// export type MountType = 'wall' | 'floor' | 'box' | 'panel' | 'ceiling'
export type MountType = 'wall' | 'floor' | 'box'
export type OutletUsage = 'network' | 'phone' | 'av' | 'printer' | 'security' | 'ap' | 'rb'

export interface OutletConfig {
	id: string
	position: Point              // mm from origin
	level: OutletLevel
	portCount: number            // 1-12
	cableType: CableType
	mountType: MountType
	usage: OutletUsage
	label?: string               // user-assigned, e.g. "A.042"
	portLabels?: string[]        // linked frame port labels (FF.Z.NNN-SPP)
	rotation?: number            // degrees
	roomNumber?: string
	locked?: boolean
}

// Phase 2
export interface TrunkConfig {
	id: string
	points: Point[]              // mm from origin
	level: OutletLevel
	cableType: CableType
	label?: string
}

export interface RouteConfig {
	id: string
	outletId: string
	rackId: string
	waypoints: Point[]           // mm from origin
	length: number               // mm
}

/** Calibration data from files/{id}.pages[pageNum] */
export interface PageCalibration {
	origin: { x: number; y: number }  // PDF-pixel coords
	scaleFactor: number               // mm per PDF pixel
	crop?: { x: number; y: number; width: number; height: number }
}

export type ToolMode = 'select' | 'outlet'

export interface OutletsData {
	floor: number
	outlets: OutletConfig[]
	trunks?: TrunkConfig[]
	routes?: RouteConfig[]
	selectedFileId?: string
	selectedPage?: number
	activeZone?: string
}
