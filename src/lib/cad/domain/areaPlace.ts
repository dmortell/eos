// WHOLE-FLOOR PLAN and AREA PLACEMENT (backlog 6, User 2026-11-22: "upload a PDF of the whole floor, mark where 3303
// and 3307 are, then draw the runs between them"). An area plan (Level.area: a tenant area drawn on its own floorplan,
// in its own coordinates) can be PLACED on its floor's main plan (the level of the same building and number with no
// area): `Level.place` turns and shifts its coordinates into the main plan's. Lengths don't change (mm both sides).
// With it, the main plan shows the placed areas greyed, and routing reads every placed area's runs, outlets and racks
// in the main plan's coordinates — so a run drawn on the whole floor from an end in 3303 to an end in 3307 joins them.
import type { Id, Level, Pt } from './types'
import type { ProjectIndex } from './project'

/** Where an area plan sits on its floor's main plan: its points turned by `rot` (degrees, the plan's own sense —
 *  y down on screen, so clockwise) about its origin, then moved by (x, y). */
export type AreaPlace = { x: number; y: number; rot: number }

/** The floor's MAIN plan for a level: itself when it has no area; else the level of its building and number with none. */
export function mainLevelOf(ix: ProjectIndex, level: Level | undefined): Level | undefined {
	if (!level?.area) return level
	return ix.levels.find((l) => !l.area && l.buildingId === level.buildingId && l.number === level.number)
}

/** The placement of a level's coordinates on its floor's main plan, or null (not an area, not placed, no main plan). */
export function placeOf(ix: ProjectIndex, levelId: Id | undefined): AreaPlace | null {
	const l = ix.getOf('level', levelId)
	return l?.area && l.place && mainLevelOf(ix, l) ? l.place : null
}

/** An area point on the main plan. */
export function toMain(pl: AreaPlace | null, p: Pt): Pt {
	if (!pl) return p
	const a = (pl.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
	return { x: pl.x + p.x * c - p.y * s, y: pl.y + p.x * s + p.y * c }
}

/** A main-plan point in the area's own coordinates. */
export function fromMain(pl: AreaPlace | null, p: Pt): Pt {
	if (!pl) return p
	const a = (-pl.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), dx = p.x - pl.x, dy = p.y - pl.y
	return { x: dx * c - dy * s, y: dx * s + dy * c }
}

/** The area plans placed on a main plan. */
export function placedAreas(ix: ProjectIndex, mainId: Id): Level[] {
	const m = ix.getOf('level', mainId)
	if (!m || m.area) return []
	return ix.levels.filter((l) => l.area && l.place && l.buildingId === m.buildingId && l.number === m.number)
}

/** The placement that takes area points a1, a2 onto main-plan points b1, b2 (two point pairs, as clicked), and how the
 *  two distances compare (`scale` ≈ 1 when both plans are drawn to the same scale). Null when a pair is one point. */
export function solvePlace(a1: Pt, a2: Pt, b1: Pt, b2: Pt): { place: AreaPlace; scale: number } | null {
	const da = Math.hypot(a2.x - a1.x, a2.y - a1.y), db = Math.hypot(b2.x - b1.x, b2.y - b1.y)
	if (da < 1 || db < 1) return null
	const rot = ((Math.atan2(b2.y - b1.y, b2.x - b1.x) - Math.atan2(a2.y - a1.y, a2.x - a1.x)) * 180) / Math.PI
	const r = Math.round(((rot % 360) + 540) % 360 * 1e6) / 1e6 - 180   // −180 … 180
	const turned = toMain({ x: 0, y: 0, rot: r }, a1)
	return { place: { x: Math.round((b1.x - turned.x) * 10) / 10, y: Math.round((b1.y - turned.y) * 10) / 10, rot: r }, scale: db / da }
}

/** Make a floor's main plan an AREA plan (User: 33F 3303 becomes an area of a new whole-floor 33F): the level keeps its
 *  id, name and everything on it, and gets `area`; a new main level takes the floor (its number, elevation, heights,
 *  named as the floor). Refused (null) when the level is already an area, or the area name is empty. */
export function makeAreaOf(level: Level, area: string, floorName: string, newId: Id): { main: Level; area: Level } | null {
	const a = area.trim()
	if (level.area || !a) return null
	const main: Level = { type: 'level', id: newId, buildingId: level.buildingId, number: level.number, name: floorName, order: level.order, elevationMm: level.elevationMm, heights: { ...level.heights } }
	return { main, area: { ...level, area: a, order: level.order + 0.5 } }
}
