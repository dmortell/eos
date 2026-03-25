// ── Port reference (identifies a port on a device in a rack) ──

export interface PortRef {
	rackId: string
	deviceId: string
	portIndex: number        // 1-based
	face: 'front' | 'rear'
	label?: string           // cached display label (from frames engine)
}

// ── Status type ──
// add = new patch to install, remove = existing to remove, change = re-patch, installed = done
export type PatchStatus = 'add' | 'remove' | 'change' | 'installed'

// ── Patch connection ──

export interface PatchConnection {
	id: string
	fromPortRef: PortRef
	toPortRef: PortRef
	cableType: string        // built-in ID or custom cable type ID
	cableColor: string       // hex color
	lengthMeters: number     // estimated or manual override
	lengthLocked: boolean    // true = user-specified, skip auto-calc
	kind: 'patch' | 'cross-connect'
	cordId?: string          // vendor-assigned patch cord ID
	status: PatchStatus
	notes?: string
}

// ── Custom cable type (user-defined) ──

export interface CustomCableType {
	id: string
	label: string            // e.g. "MPO-12", "SF/UTP Cat7"
	category: 'copper' | 'fiber' | 'other'
	color: string            // default hex color
}

// ── Settings ──

export interface PatchSettings {
	defaultCableType: string
	defaultCableColor: string
	showLabels: boolean
	showLengths: boolean
	groupBy: 'rack' | 'device' | 'cableType'
}

// ── Firestore document shape ──

export interface PatchDoc {
	floor: number
	room: string
	connections: PatchConnection[]
	customCableTypes: CustomCableType[]
	settings: PatchSettings
}

// ── Defaults ──

export const DEFAULT_SETTINGS: PatchSettings = {
	defaultCableType: 'uutp',
	defaultCableColor: '#3b82f6',
	showLabels: true,
	showLengths: true,
	groupBy: 'rack',
}

export function defaultPatchDoc(floor: number, room: string): PatchDoc {
	return {
		floor,
		room,
		connections: [],
		customCableTypes: [],
		settings: { ...DEFAULT_SETTINGS },
	}
}
