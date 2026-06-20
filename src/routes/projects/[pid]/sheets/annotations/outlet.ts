// Outlet-annotation option lists + defaults (ported from the Outlets tool). The
// usage/cable lists are defaults; the controls also allow free text so they're
// effectively user-customizable per outlet. `abbr` is the code drawn below the
// symbol (empty for 'network', which stays unlabelled).
export const OUTLET_USAGE = [
	{ value: 'network', label: 'Network', abbr: '' },
	{ value: 'phone', label: 'Phone', abbr: 'TEL' },
	{ value: 'av', label: 'TV / AV', abbr: 'AV' },
	{ value: 'printer', label: 'Printer', abbr: 'PRT' },
	{ value: 'security', label: 'Security', abbr: 'SEC' },
	{ value: 'ap', label: 'WiFi AP', abbr: 'AP' },
	{ value: 'rb', label: 'Room Booking', abbr: 'RB' },
	{ value: 'mep', label: 'MEP / BMS', abbr: 'MEP' },
	{ value: 'new', label: 'New', abbr: 'NEW' },
]
export const OUTLET_CABLE = [
	{ value: 'cat6a', label: 'Cat6a' }, { value: 'cat6', label: 'Cat6' }, { value: 'cat5e', label: 'Cat5e' },
	{ value: 'fiber-sm', label: 'Fibre (SM)' }, { value: 'fiber-mm', label: 'Fibre (MM)' },
]
export const OUTLET_MOUNT = [
	{ value: 'box', label: 'Rosette' }, { value: 'wall', label: 'Wallmount' }, { value: 'floor', label: 'Floorbox' },
] as const

// Usage abbreviation drawn below the symbol; '' (network) draws nothing.
export const usageAbbr = (v?: string) => {
	const found = OUTLET_USAGE.find((u) => u.value === v)
	if (found) return found.abbr
	return v && v !== 'network' ? v.toUpperCase().slice(0, 4) : ''
}

export const OUTLET_DEFAULTS = { ports: 2, level: 'low' as const, usage: 'network', mount: 'box' as const, cable: 'cat6a' }

// Default layer (by level) an outlet annotation files under.
export const outletLayerName = (level?: string) => (level === 'high' ? 'Outlets High' : 'Outlets Low')
