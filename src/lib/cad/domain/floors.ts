// The building's floors (Floor manager): which floor numbers exist (a lowest–top range with gaps, e.g. no GF), their
// names from a pattern ("{n}F", basements "B{n}F"), and the stack of FFL elevations from each floor's heights.
// Area levels (a separate plan of part of a floor, `Level.area`) share their floor's number and elevation.
import type { Id, Level, Outlet } from './types'

export type Heights = Level['heights']
export const DEFAULT_HEIGHTS: Heights = { slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2600, plenumMm: 700 }
/** A level's heights, or the defaults (no level, or one saved without them) — the ONE place a default height comes from
 *  (Review 2 Q5: 2600 / 2700, 700 / 800 were written in a dozen places). */
export function heightsOf(level: Pick<Level, 'heights'> | undefined): Heights { return { ...DEFAULT_HEIGHTS, ...level?.heights } }
/** An outlet's height above its level's FFL: its own Z, else by mount — ceiling = the level's clear height, wall = 300,
 *  floor = 0. Every view, routing, Properties, moves and pastes use this (Review 2 Q5: the elevation went by tier). */
export function outletZ(o: Pick<Outlet, 'z' | 'mount'>, level: Pick<Level, 'heights'> | undefined): number {
	return o.z ?? (o.mount === 'ceiling' ? heightsOf(level).clearHeightMm : o.mount === 'wall' ? 300 : 0)
}

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
/**
 * W33 (User 2026-10-15: unused floors leave the Navigator but stay in the riser view): the building's floors that have
 * NO level (no model — never made, or deleted), as stand-in levels where `restack` leaves their storey: the heights of
 * the level below (above, for floors under the lowest one), named from the building's pattern. `id` = "floor:<n>"; not
 * in the store. Skipped numbers (floors that don't exist) aren't floors.
 */
export function floorsWithoutLevel(levels: Level[], building: { id: Id; floors?: { lowest: number; top: number; skip?: number[]; above: string; below: string; ground?: string } } | undefined): Level[] {
	const f = building?.floors
	const main = levels.filter((l) => !l.area && l.buildingId === building?.id).sort((a, b) => a.number - b.number)
	if (!f || !main.length) return []
	const skip = f.skip ?? [], storeys = (a: number, b: number) => floorNumbers(a + 1, b - 1, skip).filter((n) => n > a && n < b).length
	const have = new Set(main.map((l) => l.number))
	return floorNumbers(f.lowest, f.top, skip).filter((n) => !have.has(n)).map((n): Level => {
		const lo = [...main].reverse().find((l) => l.number < n), hi = main.find((l) => l.number > n)
		const h = heightsOf(lo ?? hi), step = below(h) + above(h)
		const elevationMm = lo ? lo.elevationMm + above(heightsOf(lo)) + storeys(lo.number, n) * step + below(h)
			: hi!.elevationMm - below(heightsOf(hi)) - storeys(n, hi!.number) * step - above(h)
		return { type: 'level', id: `floor:${n}`, buildingId: building!.id, number: n, name: floorName(n, { above: f.above, below: f.below, ground: f.ground }), order: n, elevationMm, heights: { ...h } }
	})
}

export function restack(levels: Level[], skip: number[] = [], datum?: number): Level[] {
	const main = levels.filter((l) => !l.area).sort((a, b) => a.number - b.number)
	if (!main.length) return []
	/** Storeys with no level between floors a < b, each as tall as `h`. */
	const gaps = (a: number, b: number, h: Heights) => { let n = 0; for (let m = a + 1; m < b; m++) if (!skip.includes(m)) n++; return n * (below(h) + above(h)) }
	// the anchor: the DATUM floor at FFL 0 when one is set (W10: AU / UK put GF at 0), else floor 1 where it is
	const di = datum == null ? -1 : main.findIndex((l) => l.number === datum)
	const ai = di >= 0 ? di : Math.max(0, main.findIndex((l) => l.number === 1))
	const elev = new Map<number, number>([[main[ai].number, di >= 0 ? 0 : main[ai].elevationMm]])
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
export function planFloors(levels: Level[], o: { lowest: number; top: number; skip: number[]; names: FloorNames; buildingId: Id; before?: number[] }, contents: (id: Id) => number, newId: () => Id): FloorPlanResult {
	const want = new Set(floorNumbers(o.lowest, o.top, o.skip))
	const main = levels.filter((l) => !l.area)
	// W33: a floor already in the range with no level had its model deleted on purpose — Apply doesn't bring it back
	// (its chip creates it); only floors NEW to the range get a level
	const have = new Set([...main.map((l) => l.number), ...(o.before ?? [])])
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

/** A new AREA plan of a floor (a tenant office drawn on its own floorplan, e.g. 33F's 3303): the floor's number,
 *  elevation and heights, named "<floor> <area>", listed after it. */
export function newAreaLevel(floor: Level, area: string, id: string): Level {
	return { type: 'level', id, buildingId: floor.buildingId, number: floor.number, name: `${floor.name} ${area}`, order: floor.order + 0.5, elevationMm: floor.elevationMm, heights: { ...floor.heights }, area }
}

/** A floor given another number (Floor manager): it and its area plans; refused when the number isn't a whole number
 *  or another floor has it. */
export function renumberFloor(levels: Level[], floorId: string, n: number): { put: Level[] } | { problem: string } {
	const f = levels.find((l) => l.id === floorId && !l.area)
	if (!f) return { problem: 'No such floor' }
	if (!Number.isInteger(n)) return { problem: 'A floor number is a whole number' }
	if (n === f.number) return { put: [] }
	const other = levels.find((l) => !l.area && l.number === n)
	if (other) return { problem: `${other.name} is already floor ${n}` }
	return { put: levels.filter((l) => l.number === f.number && (l.id === f.id || l.area)).map((l) => ({ ...l, number: n, order: l.area ? n + 0.5 : n })) }
}
