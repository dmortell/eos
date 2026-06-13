// Minimal data-model subset for the read-only outlets render, copied from the production
// outlets tool so the sheets tool stays self-contained. Coordinates are real-world mm
// (X-right, Y-down — legacy floorplan convention; see SheetViewport.version).

export interface Point { x: number; y: number }

export type OutletLevel = 'low' | 'high'
export type CableType = 'cat5e' | 'cat6' | 'cat6a' | 'fiber-sm' | 'fiber-mm'
export type MountType = 'wall' | 'floor' | 'box'
export type OutletUsage = 'network' | 'phone' | 'av' | 'printer' | 'security' | 'ap' | 'rb' | 'new' | 'mep'

export interface OutletConfig {
	id: string
	position: Point              // mm from origin
	level: OutletLevel
	portCount: number
	cableType: CableType
	mountType: MountType
	usage: OutletUsage
	label?: string
	portLabels?: string[]
	rotation?: number
	roomNumber?: string
	locked?: boolean
}

// ── Trunks ──
export type TrunkShape = 'pipe' | 'rect'
export type TrunkLocation = 'floor' | 'ceiling-plenum' | 'ceiling-tray' | 'wall'
export type PipeCatalog = 'PF22' | 'PF28' | 'E51' | 'custom'
export type RectCatalog = 'MK0' | 'MK1' | 'MK2' | 'MK3' | 'MK4' | 'MK5' | 'ladder' | 'tray' | 'mat' | 'custom'

export interface PipeSpec { catalog: PipeCatalog; innerDiameterMm: number; outerDiameterMm: number }
export interface RectSpec { catalog: RectCatalog; widthMm: number; heightMm: number }

export interface TrunkNode {
	id: string
	position: Point
	z: number
	radius?: number
	connectedOutletId?: string
	connectedRackId?: string
}
export interface TrunkSegment { id: string; nodes: [string, string] }
export interface TrunkLabel { id: string; segmentId: string; text: string; offset: Point }

export interface TrunkConfig {
	id: string
	shape: TrunkShape
	location: TrunkLocation
	spec: PipeSpec | RectSpec
	nodes: TrunkNode[]
	segments: TrunkSegment[]
	labels?: TrunkLabel[]
	label?: string
	type?: string           // free-text containment/service type (e.g. 'Data', 'Power', 'Fiber')
	color?: string
	rooms?: string[]
	isPrimary: boolean
	visible?: boolean
	bendRadiusMm?: number   // corner rounding (mm); falls back to INNER_CORNER_RADIUS_MM
}

/** Width used for rendering (outer diameter or width depending on shape). Falls back across spec
 *  shapes so a shape/spec mismatch never yields NaN (which would make the trunk vanish). */
export function trunkWidthMm(trunk: TrunkConfig): number {
	const s = trunk.spec as Partial<PipeSpec & RectSpec>
	if (trunk.shape === 'pipe') return s.outerDiameterMm ?? s.widthMm ?? 50
	return s.widthMm ?? s.outerDiameterMm ?? 50
}

export type RackType = '2-post' | '4-post' | 'cabinet' | 'desk' | 'shelf' | 'vcm'

/** A rack placed on the floorplan. Dimensions come from the racks collection when `rackId` matches
 *  a rack there; floorplan-defined racks (added on the sheet) carry their own dims/metadata. */
export interface RackPlacement {
	rackId: string
	room: string
	position: Point              // mm from origin (top-left)
	rotation: number             // degrees
	// Self-contained rack (set when drawn on the floorplan rather than linked to the racks doc):
	label?: string
	widthMm?: number
	depthMm?: number
	heightU?: number
	heightMm?: number
	type?: RackType
	maker?: string
	model?: string
}

/** Calibration from files/{id}.pages[pageNum]. */
export interface PageCalibration {
	origin: { x: number; y: number }  // PDF-pixel coords
	scaleFactor: number               // mm per PDF pixel
	crop?: { x: number; y: number; width: number; height: number }
}

/** The slice of the outlets doc the read-only render needs. */
export interface OutletsData {
	outlets?: OutletConfig[]
	trunks?: TrunkConfig[]
	rackPlacements?: RackPlacement[]
	selectedFileId?: string
	selectedPage?: number
}
