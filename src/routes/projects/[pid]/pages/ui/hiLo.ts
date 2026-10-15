// HIGH / LOW LEVEL (User 2026-10-01): an outlet — or any shape / 3D box — is high level (in the ceiling plenum: WiFi
// APs, ceiling TVs) or low level (on the raised floor; a wall-mounted socket sits at FL+300, one behind an AV monitor at
// FL+1200). Picking a level sets its default HEIGHT (z), which the Z field then overrides. z uses the SAME datum as a 3D
// object's z: mm above FL±0 (the raised floor's top, ui/levels.ts), so a shape and a box at the same z line up in
// elevations and 3D. An outlet's level also draws it: low = filled in its usage colour, high = outline only (older
// outlets carry no `level` — their fill says which). Tested in hiLo.test.ts.
import type { Ent } from './geometry'
import type { Levels } from '../3dview/types'
import { levelsFromFL } from './levels'
import { isOutletEnt } from '../store/allocate'
import { USAGE_COLORS } from '../../outlets/parts/constants'

export type HiLo = 'high' | 'low'
/** Where a high-level item sits when the model has no ceiling heights (mm above FL). */
export const HIGH_Z_FALLBACK = 2800
/** Low-level wall sockets: FL+300 (printers …); FL+1200 behind an AV monitor. */
export const WALL_Z = 300
export const AV_Z = 1200

const filled = (fill?: string) => !!fill && fill !== 'none'

/** A shape's level: its own `level`; an outlet without one reads it from its fill (filled = low). */
export function hiLoOf(e: Pick<Ent, 'level' | 'fill' | 'type' | 'attrs'>): HiLo | undefined {
	if (e.level) return e.level
	if (e.type === 'insert' && e.attrs?.PORTS != null) return filled(e.fill) ? 'low' : 'high'   // an outlet (isOutletEnt)
	return undefined
}

/** The plenum band (mm above FL) — the ceiling (tile) to the slab above — where a model's levels give it. */
export function plenumOf(lv?: Levels | null): { ceiling?: number; slab?: number } {
	const r = levelsFromFL(lv)
	return { ceiling: r.ceilingTile, slab: r.ceilingSlab }
}

/** The default height (mm above FL) for a level: LOW = on the raised floor (0), a wall-mounted outlet FL+300; HIGH = in
 *  the ceiling plenum — its middle, else 100 above the ceiling, else HIGH_Z_FALLBACK. */
export function defaultZ(level: HiLo, lv?: Levels | null, opts: { wall?: boolean } = {}): number {
	if (level === 'low') return opts.wall ? WALL_Z : 0
	const { ceiling, slab } = plenumOf(lv)
	if (ceiling != null && slab != null && slab > ceiling) return Math.round((ceiling + slab) / 2)
	if (ceiling != null) return ceiling + 100
	return HIGH_Z_FALLBACK
}
const isWall = (e: Pick<Ent, 'block'>) => e.block === 'outlet-wall'

/** The shape at `level`: `level` set, z = the default height (0 → no z stored), an outlet filled (low, in its usage
 *  colour — an already-filled one keeps its colour) or outline (high). */
export function withHiLo(e: Ent, level: HiLo, lv?: Levels | null): Ent {
	const o: Ent = { ...e, level }, z = defaultZ(level, lv, { wall: isWall(e) })
	if (z) o.z = z; else delete o.z
	if (isOutletEnt(e)) {
		if (level === 'high') o.fill = 'none'
		else if (!filled(e.fill)) o.fill = USAGE_COLORS[e.attrs?.TYPE as keyof typeof USAGE_COLORS]?.fill ?? e.color ?? USAGE_COLORS.network.fill
	}
	return o
}

/** A 3D BOX's underside (its z) for a level: low = on the raised floor (0); high = centred in the plenum, but never below
 *  the ceiling (a box taller than the plenum sits on it); no ceiling known → HIGH_Z_FALLBACK. */
export function boxZ(level: HiLo, lv: Levels | null | undefined, h: number): number {
	if (level === 'low') return 0
	const { ceiling } = plenumOf(lv), mid = defaultZ('high', lv)
	if (ceiling == null) return mid
	return Math.max(ceiling, Math.round(mid - h / 2))
}

/** Quick heights for the Z field, per level (mm above FL). */
export function zPresets(level: HiLo | undefined, lv?: Levels | null): { label: string; z: number; title: string }[] {
	const { ceiling } = plenumOf(lv)
	const low = [{ label: 'Floor', z: 0, title: 'On the raised floor (FL±0)' }, { label: '+300', z: WALL_Z, title: 'Wall socket, FL+300 (printers …)' }, { label: '+1200', z: AV_Z, title: 'Behind an AV monitor, FL+1200' }]
	const high = [{ label: 'Plenum', z: defaultZ('high', lv), title: 'In the ceiling plenum (its middle)' }, ...(ceiling != null ? [{ label: 'Ceiling', z: ceiling, title: `At the ceiling, FL+${ceiling}` }] : [])]
	return level === 'high' ? high : level === 'low' ? low : [...low, ...high]
}
