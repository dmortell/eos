// Render constants copied from the production outlets tool.
import type { OutletUsage } from './types'

/** Outlet symbol radius in mm (real-world). */
export const OUTLET_RADIUS_MM = 200

/** Inner corner rounding for trunk outlines, mm. */
export const INNER_CORNER_RADIUS_MM = 10

/** Fill/stroke per outlet usage. */
export const USAGE_COLORS: Record<OutletUsage, { fill: string; stroke: string }> = {
	new:      { fill: '#a855f7', stroke: '#9333ea' },
	network:  { fill: '#3b82f6', stroke: '#2563eb' },
	phone:    { fill: '#8b5cf6', stroke: '#7c3aed' },
	av:       { fill: '#ec4899', stroke: '#db2777' },
	printer:  { fill: '#f97316', stroke: '#ea580c' },
	security: { fill: '#ef4444', stroke: '#dc2626' },
	mep:      { fill: '#78716c', stroke: '#57534e' },
	ap:       { fill: '#10b981', stroke: '#059669' },
	rb:       { fill: '#06b6d4', stroke: '#0891b2' },
}

/** Server-room colors for placed racks. */
export const ROOM_COLORS: Record<string, string> = {
	A: '#3b82f6', B: '#10b981', C: '#f59e0b', D: '#ef4444',
}
