import type { DeviceTemplate, DeviceType, RackSettings } from './types'

export const SCALE = 0.5
export const RU_HEIGHT_MM = 45 // 44.45mm actual, rounded for pixel snap
export const RACK_GAP_PX = 80
export const RACK_19IN_MM = 480 // 19" internal width
export const RACK_FRAME_MARGIN_MM = 80 // top + bottom frame rails beyond RU space

/** Compute rack height in mm from RU count */
export function rackHeightMm(heightU: number) {
	return heightU * RU_HEIGHT_MM + RACK_FRAME_MARGIN_MM
}

export const DEFAULT_SETTINGS: RackSettings = {
	slabLevel: 0,
	floorLevel: 150,
	ceilingLevel: 2600,
	showGrid: true,
}

export const DEVICE_CONFIGS: Record<string, { heightU: number; portCount: number; portType: 'RJ45' | 'LC' | 'SFP' | 'SC' | null }> = {
	panel: { heightU: 1, portCount: 24, portType: 'RJ45' },
	switch: { heightU: 1, portCount: 24, portType: 'RJ45' },
	server: { heightU: 1, portCount: 2, portType: 'RJ45' },
	manager: { heightU: 1, portCount: 0, portType: null },
	shelf: { heightU: 1, portCount: 0, portType: null },
	pdu: { heightU: 0, portCount: 0, portType: null },
	other: { heightU: 1, portCount: 0, portType: null },
}

export const DEFAULT_PALETTE: DeviceTemplate[] = [
	{ id: 'pp24', label: '24-Port Patch Panel', description: '1U - Cat6/6a', type: 'panel', heightU: 1, portCount: 24, portType: 'RJ45', icon: 'hgrip' },
	{ id: 'pp48', label: '48-Port Patch Panel', description: '2U - High Density', type: 'panel', heightU: 2, portCount: 48, portType: 'RJ45', icon: 'hgrip' },
	{ id: 'fiber', label: 'Fiber Enclosure', description: '1U - LC/SC', type: 'panel', heightU: 1, portCount: 24, portType: 'LC', icon: 'rect' },
	{ id: 'sw48', label: 'Network Switch 48p', description: '1U - Managed', type: 'switch', heightU: 1, portCount: 48, portType: 'RJ45', icon: 'server' },
	{ id: 'sw24', label: 'Network Switch 24p', description: '1U - Managed', type: 'switch', heightU: 1, portCount: 24, portType: 'RJ45', icon: 'server' },
	{ id: 'cm', label: 'Horizontal Manager', description: '1U - Finger Duct', type: 'manager', heightU: 1, portCount: 0, portType: null, icon: 'box' },
	{ id: 'srv2u', label: 'Server (2U)', description: '4 Port Generic', type: 'server', heightU: 2, portCount: 4, portType: 'RJ45', icon: 'server' },
	{ id: 'srv1u', label: 'Server (1U)', description: '2 Port Generic', type: 'server', heightU: 1, portCount: 2, portType: 'RJ45', icon: 'server' },
]

export const DEVICE_TYPE_COLORS: Record<DeviceType, string> = {
	panel: '#3b82f6',   // blue
	switch: '#22c55e',  // green
	server: '#64748b',  // slate
	manager: '#a855f7', // purple
	shelf: '#f97316',   // orange
	pdu: '#ef4444',     // red
	other: '#6b7280',   // gray
}
