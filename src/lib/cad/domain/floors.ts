// The building's floors (Floor manager): which floor numbers exist (a lowest–top range with gaps, e.g. no GF), their
// names from a pattern ("{n}F", basements "B{n}F"), and the stack of FFL elevations from each floor's heights.
// Area levels (a separate plan of part of a floor, `Level.area`) share their floor's number and elevation.
import type { Id, Level } from './types'

export type Heights = Level['heights']
export const DEFAULT_HEIGHTS: Heights = { slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2600, plenumMm: 700 }

/** How floors are named: `{n}` = the number, `{nn}` = two digits; basements use their number without the minus;
 *  floor 0 (when the building has one) takes the ground name. */
export interface FloorNames { above: string; below: string; ground?: string }
export const DEFAULT_NAMES: FloorNames = { above: '{n}F', below: 'B{n}F', ground: 'GF' }

export function floorName(n: number, names: FloorNames): string {
	if (n === 0) return names.ground || 'GF'
	const a = Math.abs(n), pat = n < 0 ? names.below : names.above
	return pat.replace(/\{nn\}/g, String(a).padStart(2, '0')).replace(/\{n\}/g, String(a))
}

/** The floor numbers a building has: lowest … top, without the skipped ones. */
export function floorNumbers(lowest: number, top: number, skip: number[] = []): number[] {
	const out: number[] = []
	for (let n = Math.min(lowest, top); n <= Math.max(lowest, top); n++) if (!skip.includes(n)) out.push(n)
	return out
}

/** Slab top to the slab top above: what one storey adds to the stack. */
const below = (h: Heights) => h.raisedFloorMm + h.slabMm   // FFL down to the slab's underside
const above = (h: Heights) => h.clearHeightMm + h.plenumMm  // FFL up to the next slab's underside

/**
 * FFL elevations stacked from each floor's heights, keeping the anchor where it is (floor 1 if there is one, else the
 * lowest): the next floor's FFL = this FFL + clear + plenum (to the next slab) + its slab + its raised floor.
 * A floor between two levels that has no level of its own still takes a storey (at the heights of the level below
 * it) unless it's in `skip` (it doesn't exist, e.g. no GF). Area levels follow their floor. Returns only the levels
 * whose elevation changes.
 */
export function restack(levels: Level[], skip: number[] = []): Level[] {
	const main = levels.filter((l) => !l.area).sort((a, b) => a.number - b.number)
	if (!main.length) return []
	/** Storeys with no level between floors a < b, each as tall as `h`. */
	const gaps = (a: number, b: number, h: Heights) => { let n = 0; for (let m = a + 1; m < b; m++) if (!skip.includes(m)) n++; return n * (below(h) + above(h)) }
	const ai = Math.max(0, main.findIndex((l) => l.number === 1))
	const elev = new Map<number, number>([[main[ai].number, main[ai].elevationMm]])
	for (let i = ai + 1; i < main.length; i++) {
		const lo = main[i - 1], hi = main[i]
		elev.set(hi.number, elev.get(lo.number)! + above(lo.heights) + gaps(lo.number, hi.number, lo.heights) + below(hi.heights))
	}
	for (let i = ai - 1; i >= 0; i--) {
		const lo = main[i], hi = main[i + 1]
		elev.set(lo.number, elev.get(hi.number)! - below(hi.heights) - gaps(lo.number, hi.number, lo.heights) - above(lo.heights))
	}
	return levels.flatMap((l) => { const e = elev.get(l.number); return e !== undefined && e !== l.elevationMm ? [{ ...l, elevationMm: e }] : [] })
}

export interface FloorPlanResult {
	/** New levels for floor numbers in the range that have none yet. */
	add: Level[]
	/** Existing main levels outside the range or skipped, with nothing on them: removed. */
	remove: Level[]
	/** The same, but with content: kept, and reported (delete them in the Levels list first). */
	keep: Level[]
}

/** What setting the building's range does to its levels. `contents(levelId)` counts what's on a level. */
export function planFloors(levels: Level[], o: { lowest: number; top: number; skip: number[]; names: FloorNames; buildingId: Id }, contents: (id: Id) => number, newId: () => Id): FloorPlanResult {
	const want = new Set(floorNumbers(o.lowest, o.top, o.skip))
	const main = levels.filter((l) => !l.area)
	const have = new Set(main.map((l) => l.number))
	const heights = main[0]?.heights ?? DEFAULT_HEIGHTS
	const add: Level[] = [...want].filter((n) => !have.has(n)).map((n) => ({
		type: 'level', id: newId(), buildingId: o.buildingId, number: n, name: floorName(n, o.names), order: n, elevationMm: 0, heights: { ...heights },
	}))
	const gone = levels.filter((l) => !want.has(l.number))
	return { add, remove: gone.filter((l) => !contents(l.id)), keep: gone.filter((l) => contents(l.id) > 0) }
}

/** Every level renamed from the pattern; an area level reads "<floor name> <area>". Only the ones that change. */
export function renameFloors(levels: Level[], names: FloorNames): Level[] {
	return levels.flatMap((l) => {
		const name = l.area ? `${floorName(l.number, names)} ${l.area}` : floorName(l.number, names)
		return name !== l.name ? [{ ...l, name }] : []
	})
}
