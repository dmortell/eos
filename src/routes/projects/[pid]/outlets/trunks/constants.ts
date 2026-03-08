import type { PipeCatalog, RectCatalog, TrunkLocation, TrunkShape } from './types'

export const PIPE_CATALOG: Record<PipeCatalog, { innerMm: number; outerMm: number; label: string }> = {
	PF22:   { innerMm: 22,  outerMm: 30,  label: 'PF22 (22mm flex)' },
	PF28:   { innerMm: 28,  outerMm: 36,  label: 'PF28 (28mm flex)' },
	E51:    { innerMm: 43,  outerMm: 51,  label: 'E51 (51mm steel)' },
	custom: { innerMm: 25,  outerMm: 33,  label: 'Custom pipe' },
}

export const RECT_CATALOG: Record<RectCatalog, { widthMm: number; heightMm: number; label: string }> = {
	MK0:    { widthMm: 40,  heightMm: 20,  label: 'MK No.0 (40x20)' },
	MK1:    { widthMm: 40,  heightMm: 20,  label: 'MK No.1 (40x20)' },
	MK2:    { widthMm: 40,  heightMm: 20,  label: 'MK No.2 (40x20)' },
	MK3:    { widthMm: 80,  heightMm: 60,  label: 'MK No.3 (80x60)' },
	MK4:    { widthMm: 100, heightMm: 80,  label: 'MK No.4 (100x80)' },
	MK5:    { widthMm: 150, heightMm: 100, label: 'MK No.5 (150x100)' },
	ladder: { widthMm: 300, heightMm: 50,  label: 'Ladder' },
	tray:   { widthMm: 200, heightMm: 50,  label: 'Tray' },
	mat:    { widthMm: 500, heightMm: 5,   label: 'Rubber mat' },
	custom: { widthMm: 100, heightMm: 50,  label: 'Custom' },
}

export const TRUNK_COLORS: Record<TrunkShape, string> = {
	pipe: '#8b5cf6',
	rect: '#f97316',
}

export const LOCATION_LABELS: Record<TrunkLocation, string> = {
	'floor':          'Under Floor',
	'ceiling-plenum': 'Ceiling Plenum',
	'ceiling-tray':   'Ceiling Tray',
	'wall':           'Wall',
}

export const DEFAULT_TRUNK_Z = 0
export const SNAP_THRESHOLD_MM = 125
export const MITER_LIMIT = 4.0
