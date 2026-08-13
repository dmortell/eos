/**
 * Shared location-type presentation maps for port/outlet usage types.
 *
 * Single source of truth for the Frames tool (Tailwind classes) and the
 * Patching tool (hex values for inline styles). Previously the hex map lived
 * as a hand-maintained copy in `patching/parts/elevationUtils.ts` with nothing
 * enforcing that it matched — the two are now defined side by side.
 */

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

/** Tailwind color classes per location type (bg/border/text for port cells) */
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

/** Hex base colors per location type, for inline styles (SVG fills, style attrs). */
export const PORT_TYPE_COLORS: Record<string, string> = {
	'N/A': '#d1d5db',
	desk: '#3b82f6',
	AP: '#22c55e',
	PR: '#f97316',
	RS: '#a855f7',
	FR: '#ef4444',
	WC: '#06b6d4',
	TV: '#ec4899',
	LK: '#f59e0b',
}
