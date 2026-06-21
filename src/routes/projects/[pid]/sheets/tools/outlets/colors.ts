// Render constants copied from the production outlets tool. Single source of truth for the sheets
// outlets tool AND the outlet-annotation property dropdowns (see annotations/outlet.ts).
import type { OutletUsage, CableType } from './types'

/** Outlet symbol radius in mm (real-world). */
export const OUTLET_RADIUS_MM = 200

/** Inner corner rounding for trunk outlines, mm. */
export const INNER_CORNER_RADIUS_MM = 10

/** Fill/stroke + label per outlet usage. */
export const USAGE_COLORS: Record<OutletUsage, { fill: string; stroke: string; label: string }> = {
	new:      { fill: '#a855f7', stroke: '#9333ea', label: 'New' },
	network:  { fill: '#3b82f6', stroke: '#2563eb', label: 'Network' },
	phone:    { fill: '#8b5cf6', stroke: '#7c3aed', label: 'Phone' },
	av:       { fill: '#ec4899', stroke: '#db2777', label: 'TV/AV' },
	printer:  { fill: '#f97316', stroke: '#ea580c', label: 'Printer' },
	security: { fill: '#ef4444', stroke: '#dc2626', label: 'Security' },
	mep:      { fill: '#78716c', stroke: '#57534e', label: 'MEP/BMS' },
	ap:       { fill: '#10b981', stroke: '#059669', label: 'AP' },
	rb:       { fill: '#06b6d4', stroke: '#0891b2', label: 'Room Booking' },
}

/** Colour + label per cable type. */
export const CABLE_COLORS: Record<CableType, { color: string; label: string }> = {
	'cat5e':    { color: '#6b7280', label: 'Cat5e' },
	'cat6':     { color: '#8b5cf6', label: 'Cat6' },
	'cat6a':    { color: '#3b82f6', label: 'Cat6a' },
	'fiber-sm': { color: '#f59e0b', label: 'SM Fiber' },
	'fiber-mm': { color: '#10b981', label: 'MM Fiber' },
}

/** Server-room colors for placed racks. */
export const ROOM_COLORS: Record<string, string> = {
	A: '#3b82f6', B: '#10b981', C: '#f59e0b', D: '#ef4444',
}
