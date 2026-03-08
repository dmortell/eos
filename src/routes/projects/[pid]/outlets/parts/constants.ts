import type { OutletUsage, OutletLevel, CableType, MountType } from './types'

/** Outlet symbol radius in mm (real-world). At 1:50, 150mm = 3px on screen. */
export const OUTLET_RADIUS_MM = 200

/** Colors per outlet usage type */
export const USAGE_COLORS: Record<OutletUsage, { fill: string; stroke: string; label: string; title: string }> = {
	network:  { fill: '#3b82f6', stroke: '#2563eb', label: 'Network', title: 'Network' },
	phone:    { fill: '#8b5cf6', stroke: '#7c3aed', label: 'Phone', title: 'Phone' },
	av:       { fill: '#ec4899', stroke: '#db2777', label: 'TV/AV', title: 'Television / Audio Video' },
	printer:  { fill: '#f97316', stroke: '#ea580c', label: 'Printer', title: 'Printer' },
	security: { fill: '#ef4444', stroke: '#dc2626', label: 'Security', title: 'Security' },
	ap:       { fill: '#10b981', stroke: '#059669', label: 'AP', title: 'Access Point' },
	rb:       { fill: '#06b6d4', stroke: '#0891b2', label: 'Room Booking', title: 'Room Booking' },
}

/** Colors per cable type with titles */
export const CABLE_COLORS: Record<CableType, { color: string; label: string; short: string; title: string }> = {
	'cat5e':    { color: '#6b7280', label: 'Cat5e', short: '5e', title: 'Category 5e' },
	'cat6':     { color: '#8b5cf6', label: 'Cat6', short: 'C6', title: 'Category 6' },
	'cat6a':    { color: '#3b82f6', label: 'Cat6a', short: '6a', title: 'Category 6a' },
	'fiber-sm': { color: '#f59e0b', label: 'SM Fiber', short: 'SM', title: 'Single Mode Fiber' },
	'fiber-mm': { color: '#10b981', label: 'MM Fiber', short: 'MM', title: 'Multi Mode Fiber' },
}

/** Mount type labels */
export const MOUNT_LABELS: Record<MountType, string> = {
	wall: 'Wallmount',
	floor: 'Floorbox',
	box: 'Rosette',
	// panel: 'Panel',
	// ceiling: 'Ceiling',
}

/** Short mount abbreviations with titles */
export const MOUNT_SHORT: Record<MountType, { short: string; title: string }> = {
	wall: { short: 'WM', title: 'Wallmount' },
	floor: { short: 'FB', title: 'Floorbox' },
	box: { short: 'OB', title: 'Outlet box / Rosette' },
	// panel: { short: 'P', title: 'Panel' },
	// ceiling: { short: 'C', title: 'Ceiling' },
}

/** Outlet level (voltage) info with short forms and titles */
export const LEVEL_INFO: Record<'low' | 'high', { short: string; title: string; bgClass: string; textClass: string }> = {
	low: { short: 'LL', title: 'Low Level', bgClass: 'bg-green-100', textClass: 'text-green-800' },
	high: { short: 'HL', title: 'High Level', bgClass: 'bg-red-100', textClass: 'text-amber-800 font-semibold' },
}

/** Default values for new outlets */
export const OUTLET_DEFAULTS = {
	level: 'low' as const,
	portCount: 2,
	cableType: 'cat6a' as const,
	mountType: 'box' as const,
	usage: 'network' as const,
}

export interface StickyDefaults {
	level: OutletLevel
	portCount: number
	cableType: CableType
	mountType: MountType
	usage: OutletUsage
}
