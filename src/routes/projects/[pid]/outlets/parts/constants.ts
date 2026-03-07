import type { OutletUsage, CableType, MountType } from './types'

/** Outlet symbol radius in mm (real-world). At 1:50, 150mm = 3px on screen. */
export const OUTLET_RADIUS_MM = 150

/** Colors per outlet usage type */
export const USAGE_COLORS: Record<OutletUsage, { fill: string; stroke: string; label: string }> = {
	network:  { fill: '#3b82f6', stroke: '#2563eb', label: 'Network' },
	phone:    { fill: '#8b5cf6', stroke: '#7c3aed', label: 'Phone' },
	av:       { fill: '#ec4899', stroke: '#db2777', label: 'TV/AV' },
	printer:  { fill: '#f97316', stroke: '#ea580c', label: 'Printer' },
	security: { fill: '#ef4444', stroke: '#dc2626', label: 'Security' },
}

/** Colors per cable type */
export const CABLE_COLORS: Record<CableType, { color: string; label: string; short: string }> = {
	'cat6a':    { color: '#3b82f6', label: 'Cat6a', short: '6a' },
	'fiber-sm': { color: '#f59e0b', label: 'SM Fiber', short: 'SM' },
	'fiber-mm': { color: '#10b981', label: 'MM Fiber', short: 'MM' },
}

/** Mount type labels */
export const MOUNT_LABELS: Record<MountType, string> = {
	wall: 'Wall',
	floor: 'Floorbox',
	box: 'Rosette',
	panel: 'Panel',
	ceiling: 'Ceiling',
}

/** Short mount abbreviations */
export const MOUNT_SHORT: Record<MountType, string> = {
	wall: 'W',
	floor: 'F',
	box: 'B',
	panel: 'P',
	ceiling: 'C',
}

/** Default values for new outlets */
export const OUTLET_DEFAULTS = {
	level: 'low' as const,
	portCount: 2,
	cableType: 'cat6a' as const,
	mountType: 'floor' as const,
	usage: 'network' as const,
}

export type StickyDefaults = typeof OUTLET_DEFAULTS
