// F1: what the NEXT Trunk / Pipe run is drawn as, chosen in the spec bar over the viewport while the tool is armed:
// a catalogue item (or Custom), round / rectangular, W × H (a round one: its diameter), where it runs, and its height.
// One spec per tool, remembered in localStorage (a per-user drawing preference, like the snap step).
import type { Levels } from '../3dview/types'

export type TrunkShape = 'rect' | 'round'
export type TrunkLoc = 'underfloor' | 'plenum' | 'ceiling' | 'wall' | 'custom'
export type TrunkSpec = { cat: string; shape: TrunkShape; w: number; h: number; loc: TrunkLoc; /** the run's UNDERSIDE (mm), used when loc = custom */ z: number }
export type CatItem = { id: string; name: string; shape: TrunkShape; w: number; h: number; loc?: TrunkLoc }

/** Common containment. Sizes are outer W × H (mm); a round item's w = h = its diameter. */
export const CATALOGUE: CatItem[] = [
	{ id: 'PF16', name: 'PF16 conduit', shape: 'round', w: 21, h: 21 },
	{ id: 'PF22', name: 'PF22 conduit', shape: 'round', w: 27, h: 27 },
	{ id: 'PF28', name: 'PF28 conduit', shape: 'round', w: 34, h: 34 },
	{ id: 'PF36', name: 'PF36 conduit', shape: 'round', w: 42, h: 42 },
	{ id: 'E51', name: 'E51 steel conduit', shape: 'round', w: 51, h: 51 },
	{ id: 'E63', name: 'E63 steel conduit', shape: 'round', w: 63, h: 63 },
	{ id: 'TK100', name: 'Trunking 100×50', shape: 'rect', w: 100, h: 50 },
	{ id: 'TK150', name: 'Trunking 150×75', shape: 'rect', w: 150, h: 75 },
	{ id: 'TK300', name: 'Trunking 300×150', shape: 'rect', w: 300, h: 150 },
	{ id: 'TR200', name: 'Cable tray 200×50', shape: 'rect', w: 200, h: 50, loc: 'plenum' },
	{ id: 'TR300', name: 'Cable tray 300×50', shape: 'rect', w: 300, h: 50, loc: 'plenum' },
	{ id: 'LD300', name: 'Cable ladder 300×100', shape: 'rect', w: 300, h: 100, loc: 'plenum' },
	{ id: 'LD450', name: 'Cable ladder 450×100', shape: 'rect', w: 450, h: 100, loc: 'plenum' },
	{ id: 'LD600', name: 'Cable ladder 600×100', shape: 'rect', w: 600, h: 100, loc: 'plenum' },
]
export const LOCATIONS: [TrunkLoc, string][] = [['underfloor', 'Under floor'], ['plenum', 'Ceiling plenum'], ['ceiling', 'Below ceiling'], ['wall', 'On wall'], ['custom', 'Custom Z']]

/** The run's underside for a location, from the model's levels (defaults: ceiling tiles at 2600 mm). */
export function specZ(s: TrunkSpec, lv: Levels | undefined): number {
	const tile = lv?.ceilingTile ?? 2600
	switch (s.loc) {
		case 'underfloor': return 0                     // on the slab, in the raised-floor void
		case 'plenum': return tile + 50                 // just above the ceiling tiles
		case 'ceiling': return Math.max(0, tile - s.h - 50)   // hung just below them
		case 'wall': return 300                         // along the wall, above the skirting
		default: return s.z
	}
}
/** The conduit profile + node height (the profile is centred on its nodes) for a spec. */
export function specProfile(s: TrunkSpec, lv: Levels | undefined): { w: number; h: number; edges: number; z: number } {
	const w = Math.max(1, s.w), h = s.shape === 'round' ? w : Math.max(1, s.h)
	return { w, h, edges: s.shape === 'round' ? 16 : 4, z: Math.round(specZ({ ...s, h }, lv) + h / 2) }
}

const LS = 'eos-pages-trunk-spec'
const DEFAULTS: Record<'Trunk' | 'Pipe', TrunkSpec> = {
	Trunk: { cat: 'TK300', shape: 'rect', w: 300, h: 150, loc: 'ceiling', z: 2300 },
	Pipe: { cat: 'PF22', shape: 'round', w: 27, h: 27, loc: 'underfloor', z: 0 },
}
class TrunkSpecs {
	specs = $state<Record<'Trunk' | 'Pipe', TrunkSpec>>(load())
	of(tool: string): TrunkSpec | null { return tool === 'Trunk' || tool === 'Pipe' ? this.specs[tool] : null }
	set(tool: 'Trunk' | 'Pipe', patch: Partial<TrunkSpec>) {
		this.specs[tool] = { ...this.specs[tool], ...patch }
		try { localStorage.setItem(LS, JSON.stringify(this.specs)) } catch { /* private mode */ }
	}
	/** Pick a catalogue item (its shape, size and usual location); 'custom' keeps the current values. */
	pick(tool: 'Trunk' | 'Pipe', id: string) {
		const c = CATALOGUE.find((x) => x.id === id)
		this.set(tool, c ? { cat: id, shape: c.shape, w: c.w, h: c.h, ...(c.loc ? { loc: c.loc } : {}) } : { cat: 'custom' })
	}
}
function load(): Record<'Trunk' | 'Pipe', TrunkSpec> {
	try { const o = JSON.parse(localStorage.getItem(LS) ?? '{}'); return { Trunk: { ...DEFAULTS.Trunk, ...o.Trunk }, Pipe: { ...DEFAULTS.Pipe, ...o.Pipe } } } catch { return { ...DEFAULTS } }
}
export const trunkSpecs = new TrunkSpecs()
