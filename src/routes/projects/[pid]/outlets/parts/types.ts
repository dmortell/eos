/** All coordinates in real-world mm from origin. X-right, Y-down (plan view). */
export interface Point { x: number; y: number }

/** Derive per-port labels for a multi-port outlet by appending a suffix to the
 *  outlet's own label. Floorplan outlets are multi-port; the outlet label
 *  itself does not include the port indicator — a 2-port outlet labelled
 *  "33-001" exposes ports "33-001.A" and "33-001.B" on the patch frame.
 *
 *  Preserves any user-set entries in `existing` (so manually overriding a
 *  specific port label doesn't get clobbered when portCount changes).
 *
 *  `style` picks the suffix:
 *    - 'alpha' → .A, .B, .C, … (default; matches the canonical example)
 *    - 'numeric' → .1, .2, .3, … (some clients prefer this) */
export function derivePortLabels(
	label: string | undefined,
	portCount: number,
	existing?: string[],
	style: 'alpha' | 'numeric' = 'alpha',
): string[] | undefined {
	if (!label || portCount < 1) return existing
	const out = [...(existing ?? [])]
	for (let i = 0; i < portCount; i++) {
		if (out[i] && out[i].trim()) continue
		const suffix = style === 'numeric' ? String(i + 1) : String.fromCharCode(65 + i)
		out[i] = `${label}.${suffix}`
	}
	return out.slice(0, portCount)
}

export type OutletLevel = 'low' | 'high'
export type CableType = 'cat5e' | 'cat6' | 'cat6a' | 'fiber-sm' | 'fiber-mm'
export type MountType = 'wall' | 'floor' | 'box'	// 'panel' | 'ceiling'
export type OutletUsage = 'network' | 'phone' | 'av' | 'printer' | 'security' | 'ap' | 'rb' | 'new' | 'mep'

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

// Phase 2 — trunk types are in ../trunks/types.ts

export interface RouteConfig {
	id: string
	outletId: string
	rackId: string
	waypoints: Point[]           // mm from origin
	length: number               // mm
}

/** A rack placed on the floorplan */
export interface RackPlacement {
	rackId: string               // references RackConfig.id from racks collection
	room: string                 // server room letter ('A', 'B', etc.)
	position: Point              // mm from origin
	rotation: number             // degrees (0, 90, 180, 270)
}

/** Calibration data from files/{id}.pages[pageNum] */
export interface PageCalibration {
	origin: { x: number; y: number }  // PDF-pixel coords
	scaleFactor: number               // mm per PDF pixel
	crop?: { x: number; y: number; width: number; height: number }
}

export type ToolMode = 'select' | 'outlet' | 'trunk'
export type SidebarTab = 'file' | 'outlets' | 'racks' | 'trunks'

import type { PrintSettings as _PrintSettings } from '$lib/ui/print/types'
export type { PrintSettings, PaperSize, PaperOrientation } from '$lib/ui/print/types'
export { DEFAULT_PRINT_SETTINGS, PAPER_DIMENSIONS } from '$lib/ui/print/types'

export interface OutletsData {
	floor: number
	outlets: OutletConfig[]
	trunks?: import('../trunks/types').TrunkConfig[]
	routes?: RouteConfig[]
	rackPlacements?: RackPlacement[]
	selectedFileId?: string
	selectedPage?: number
	activeZone?: string
	legendPos?: Point
	printSettings?: _PrintSettings
}
