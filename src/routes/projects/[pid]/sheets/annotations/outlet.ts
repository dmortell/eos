// Outlet-annotation option lists + defaults, derived from the Outlets tool's
// canonical constants (single source of truth) so usage/cable/mount stay in sync.
// The controls render these as datalists, so they're also free-text (customizable).
import { USAGE_COLORS, CABLE_COLORS } from '../tools/outlets/colors'
import { MOUNT_LABELS, OUTLET_DEFAULTS as OD } from '../../outlets/parts/constants'

export const OUTLET_USAGE = Object.entries(USAGE_COLORS).map(([value, v]) => ({ value, label: v.label }))
export const OUTLET_CABLE = Object.entries(CABLE_COLORS).map(([value, v]) => ({ value, label: v.label }))
export const OUTLET_MOUNT = Object.entries(MOUNT_LABELS).map(([value, label]) => ({ value, label }))

// Usage abbreviation drawn below the symbol; '' (network) draws nothing.
const USAGE_ABBR: Record<string, string> = {
	network: '', new: 'NEW', phone: 'TEL', av: 'AV', printer: 'PRT', security: 'SEC', mep: 'MEP', ap: 'AP', rb: 'RB',
}
export const usageAbbr = (v?: string) => {
	if (!v || v === 'network') return ''
	return USAGE_ABBR[v] ?? v.toUpperCase().slice(0, 4)
}

export const OUTLET_DEFAULTS = { ports: OD.portCount, level: OD.level, usage: OD.usage, mount: OD.mountType, cable: OD.cableType }

// Default layer (by level) an outlet annotation files under.
export const outletLayerName = (level?: string) => (level === 'high' ? 'Outlets High' : 'Outlets Low')
