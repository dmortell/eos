import type { Point } from '../parts/types'

export type TrunkShape = 'pipe' | 'rect'

export type TrunkLocation = 'floor' | 'ceiling-plenum' | 'ceiling-tray' | 'wall'

export type PipeCatalog = 'PF22' | 'PF28' | 'E51' | 'custom'
export type RectCatalog = 'MK0' | 'MK1' | 'MK2' | 'MK3' | 'MK4' | 'MK5' | 'ladder' | 'tray' | 'mat' | 'custom'

export interface PipeSpec {
	catalog: PipeCatalog
	innerDiameterMm: number
	outerDiameterMm: number
}

export interface RectSpec {
	catalog: RectCatalog
	widthMm: number
	heightMm: number
}

export interface TrunkNode {
	id: string
	position: Point
	z: number                    // elevation mm (0 = floor slab)
	radius?: number              // corner miter radius mm (0 = sharp)
	connectedOutletId?: string
	connectedRackId?: string
}

export interface TrunkSegment {
	id: string
	nodes: [string, string]      // [fromNodeId, toNodeId]
}

export interface TrunkLabel {
	id: string
	segmentId: string
	text: string
	offset: Point                // mm offset from segment midpoint
}

export interface TrunkConfig {
	id: string
	shape: TrunkShape
	location: TrunkLocation
	spec: PipeSpec | RectSpec
	nodes: TrunkNode[]
	segments: TrunkSegment[]
	labels?: TrunkLabel[]
	label?: string
	color?: string
	isPrimary: boolean
	visible?: boolean
}

/** Width used for rendering (outer diameter or width depending on shape) */
export function trunkWidthMm(trunk: TrunkConfig): number {
	if (trunk.shape === 'pipe') return (trunk.spec as PipeSpec).outerDiameterMm
	return (trunk.spec as RectSpec).widthMm
}
