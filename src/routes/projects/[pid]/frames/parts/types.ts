// ── Location types (extensible via settings) ──

export const DEFAULT_LOC_TYPES = ['N/A', 'desk', 'AP', 'PR', 'RS', 'FR', 'WC', 'TV', 'LK'] as const
export type LocType = (typeof DEFAULT_LOC_TYPES)[number] | (string & {})

export const LOC_TYPE_LABELS: Record<string, string> = {
	'N/A': 'Not allocated',
	desk: 'Desk',
	AP: 'AP',
	PR: 'Printer',
	RS: 'Room Sched',
	FR: 'Facial Rec',
	WC: 'World Clock',
	TV: 'TV',
	LK: 'Lockers',
}

/** Color classes per location type (bg/text for port cells) */
export const LOC_TYPE_COLORS: Record<string, string> = {
	'N/A': 'bg-gray-300/20 border-gray-300/40 text-gray-400',
	desk: 'bg-blue-500/15 border-blue-500/40 text-blue-600',
	AP: 'bg-green-500/15 border-green-500/40 text-green-600',
	PR: 'bg-orange-500/15 border-orange-500/40 text-orange-600',
	RS: 'bg-purple-500/15 border-purple-500/40 text-purple-600',
	FR: 'bg-red-500/15 border-red-500/40 text-red-600',
	WC: 'bg-cyan-500/15 border-cyan-500/40 text-cyan-600',
	TV: 'bg-pink-500/15 border-pink-500/40 text-pink-600',
	LK: 'bg-amber-500/15 border-amber-500/40 text-amber-600',
}

// ── Location config ──

export interface LocationConfig {
	locationNumber: number
	portCount: number // 1–99
	serverRoomAssignment: string[] // per-port: 'A', 'B', 'C', 'D'
	locationType: LocType
	roomNumber?: string // optional 4-digit room ref
	isHighLevel?: boolean // ceiling port → appends "-H"
}

// ── Zone config ──

export interface ZoneConfig {
	floor: number // 1–20
	zone: string // A–Z
	serverRoomCount: number // 1–4
	locations: LocationConfig[]
}

// ── Frame config ──

export type SlotType = 'patch-panel' | 'blanking' | 'cable-mgmt' | 'device' | 'enclosure' | 'panel' | 'switch' | 'server' | 'manager' | 'shelf' | 'pdu' | 'other'

export interface FrameSlot {
	ru: number
	type: SlotType
	label?: string
	height: number // RU height (1-10)
}

/** Describes a physical patch panel device in the rack */
export interface PanelDevice {
	ru: number        // RU position in rack (1-based from bottom)
	portCount: number // 24 or 48
	isHighLevel: boolean
}

export interface FrameConfig {
	id: string
	name: string // e.g. "Frame A1"
	serverRoom: string // A, B, C, D
	totalRU: number // default 45
	panelStartRU: number
	panelEndRU: number
	hlPanelStartRU?: number // high-level panel range (optional, defaults to panelStartRU)
	hlPanelEndRU?: number   // high-level panel range (optional, defaults to panelEndRU)
	slots: FrameSlot[]
	panelDevices?: PanelDevice[] // actual panel devices with positions + port counts
}

// ── Generated output ──

export interface PortLabel {
	label: string // FF.Z.NNN-SPP or FF.Z.NNN-SPP-H
	zone: string // zone letter
	serverRoom: string
	locationNumber: number
	portNumber: number
	locationType: LocType
	isHighLevel: boolean
}

export interface PanelData {
	panelNumber: number
	ru: number
	topRow: (PortLabel | null)[] // up to 24 slots
	bottomRow: (PortLabel | null)[] // up to 24 slots (empty for 24-port panels)
	isHighLevel: boolean
	portCount: number // 24 or 48 — total ports on this physical panel
}

export interface RackData {
	frame: FrameConfig
	panels: PanelData[]
}

// ── Defaults ──

export function defaultZoneConfig(): ZoneConfig {
	return {
		floor: 1,
		zone: 'A',
		serverRoomCount: 1,
		locations: [],
	}
}

export function defaultFrameConfig(serverRoom: string = 'A', index = 1): FrameConfig {
	return {
		id: `frame-${serverRoom}${index}`,
		name: `Frame ${serverRoom}${index}`,
		serverRoom,
		totalRU: 45,
		panelStartRU: 1,
		panelEndRU: 45,
		slots: [],
	}
}

export function defaultLocations(count: number, serverRoomCount: number): LocationConfig[] {
	return Array.from({ length: count }, (_, i) => ({
		locationNumber: i + 1,
		portCount: 2,
		serverRoomAssignment: Array.from({ length: 2 }, () => 'A' as const),
		locationType: 'desk' as LocType,
	}))
}
