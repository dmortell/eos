// Render constants copied from the production racks tool.
import type { DeviceType, RackType, RackSettings } from './types'

export const RU_HEIGHT_MM = 45        // standard RU (44.45 rounded)
export const RACK_19IN_MM = 480       // 19" external mounting width
export const RACK_19IN_INNER = 445    // 19" internal width
export const RACK_GAP_MM = 10         // gap between racks in a row

export const DEVICE_TYPE_COLORS: Record<DeviceType, string> = {
	panel: '#3b82f6',
	switch: '#22c55e',
	server: '#64748b',
	enclosure: '#0ea5e9',
	manager: '#a855f7',
	shelf: '#f97316',
	pdu: '#ab7240',
	other: '#6b7280',
}

/** Plan-view rack footprint style by type. */
export const RACK_STYLE: Record<RackType, { fill: string; border: string; text: string }> = {
	vcm:      { fill: '#fef2f2', border: '#dc2626', text: '#7f1d1d' },
	cabinet:  { fill: '#f1f5f9', border: '#334155', text: '#0f172a' },
	desk:     { fill: '#fefce8', border: '#a16207', text: '#713f12' },
	shelf:    { fill: '#fefce8', border: '#a16207', text: '#713f12' },
	'2-post': { fill: '#ecfdf5', border: '#059669', text: '#064e3b' },
	'4-post': { fill: '#ecfdf5', border: '#059669', text: '#064e3b' },
}

export const DEFAULT_SETTINGS: RackSettings = {
	slabLevel: 0, floorLevel: 150, ceilingLevel: 2600, leftWallX: -300, rightWallX: 6000, showGrid: true,
}
