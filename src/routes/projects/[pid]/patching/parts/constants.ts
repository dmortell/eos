// ── Built-in cable types ──

export interface CableTypeDef {
	id: string
	label: string
	category: 'copper' | 'fiber' | 'direct-attach'
	color: string  // default hex color
}

export const CABLE_TYPES: CableTypeDef[] = [
	{ id: 'uutp', label: 'U/UTP', category: 'copper', color: '#3b82f6' },
	{ id: 'sftp', label: 'S/FTP', category: 'copper', color: '#94a3b8' },
	{ id: 'futp', label: 'F/UTP', category: 'copper', color: '#6366f1' },
	{ id: 'uftp', label: 'U/FTP', category: 'copper', color: '#8b5cf6' },
	{ id: 'os2', label: 'OS2 SM', category: 'fiber', color: '#facc15' },
	{ id: 'om3', label: 'OM3 MM', category: 'fiber', color: '#22d3ee' },
	{ id: 'om4', label: 'OM4 MM', category: 'fiber', color: '#e879f9' },
	{ id: 'dac', label: 'DAC', category: 'direct-attach', color: '#0f172a' },
]

export const CABLE_TYPE_MAP = new Map(CABLE_TYPES.map(t => [t.id, t]))

/** Look up a cable type by ID (built-in or custom) */
export function getCableType(id: string, custom: { id: string; label: string; color: string }[] = []): { label: string; color: string } {
	const builtin = CABLE_TYPE_MAP.get(id)
	if (builtin) return builtin
	const c = custom.find(t => t.id === id)
	if (c) return c
	return { label: id, color: '#6b7280' }
}

// ── Standard cable lengths (meters) ──

export const STANDARD_LENGTHS = [0.3, 0.5, 1, 1.5, 2, 3, 5, 7, 10, 15, 20, 30]

/** Snap a raw length UP to the nearest standard cable length */
export function snapToStandardLength(meters: number): number {
	const len = STANDARD_LENGTHS.find(l => l >= meters)
	return len ?? STANDARD_LENGTHS[STANDARD_LENGTHS.length - 1]
}
