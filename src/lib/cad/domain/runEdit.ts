// Run edits shared by one run's Properties and several runs' (backlog "Run location presets", "Edit several runs at
// once"): converting a path to a line / wall / trunk / conduit / tray, and where it runs — under floor, ceiling plenum,
// below ceiling, on a wall — as a height from its level's heights and a tier. Pure.
import type { Shape, Section } from './shapes'
import type { Id, Space } from './types'
import type { ProjectIndex } from './project'
import { naturalCompare } from './labels'
import { toLine, toWall, toContainment } from './make'

export type RunKind = 'line' | 'wall' | 'trunk' | 'conduit' | 'tray' | 'ladder'
export const kindOf = (s: Shape): RunKind => (s.role?.kind === 'wall' ? 'wall' : s.role?.kind === 'containment' ? s.role.form : 'line')

/** The path as another kind of thing, keeping its geometry (and its size where it has one). */
export function convertRun(s: Shape, to: RunKind): Shape {
	if (to === kindOf(s) || s.geom.kind !== 'path') return s
	const base = toLine(s), sec: Section = s.section ?? { w: 100, h: 50 }, high = s.geom.nodes.some((n) => n.z > 0)
	return to === 'line' ? base
		: to === 'wall' ? toWall(base, sec.w || 100, sec.h > 200 ? sec.h : 2700)
		: toContainment(base, to === 'conduit' ? { w: sec.w, h: sec.w, round: true, anchor: 'centre' } : { w: sec.w, h: sec.h }, { tier: high ? 'high' : 'low', form: to })
}

export const RUN_PLACES = { floor: 'under floor', plenum: 'ceiling plenum', below: 'below ceiling', wall: 'on wall' } as const
export type RunPlace = keyof typeof RUN_PLACES
type Heights = { raisedFloorMm: number; clearHeightMm: number; plenumMm: number }

/** The Z (mm above FFL) and tier a place means on a level, for a run of section height `h`. */
export function placeOf(heights: Heights | undefined, p: RunPlace, h = 50): { z: number; tier: 'low' | 'high' | 'wall' } | null {
	if (!heights) return null
	const half = h / 2
	if (p === 'floor') return { z: -Math.max(heights.raisedFloorMm / 2, half), tier: 'low' }
	if (p === 'plenum') return { z: heights.clearHeightMm + heights.plenumMm / 2, tier: 'high' }
	if (p === 'below') return { z: heights.clearHeightMm - half - 50, tier: 'high' }
	return { z: 300, tier: 'wall' }
}

/** A run's main height: the Z most of its nodes share (drops to outlets end elsewhere). */
export function mainZ(s: Shape): number | undefined {
	if (s.geom.kind !== 'path') return undefined
	const n = new Map<number, number>()
	for (const x of s.geom.nodes) n.set(x.z, (n.get(x.z) ?? 0) + 1)
	return [...n].sort((a, b) => b[1] - a[1])[0]?.[0]
}

/** Where a run runs now ('' = none of the places). */
export function placeNow(s: Shape, heights: Heights | undefined): RunPlace | '' {
	const z = mainZ(s), role = s.role
	return (Object.keys(RUN_PLACES) as RunPlace[]).find((p) => { const q = placeOf(heights, p, s.section?.h); return q && q.z === z && role?.kind === 'containment' && role.tier === q.tier }) ?? ''
}

/** The run moved to a place: its main-height nodes to that Z (drops keep their ends), its tier. Null = can't. */
export function setRunPlace(s: Shape, heights: Heights | undefined, p: RunPlace): Shape | null {
	const q = placeOf(heights, p, s.section?.h), role = s.role
	if (!q || role?.kind !== 'containment' || s.geom.kind !== 'path') return null
	const was = mainZ(s)
	return { ...s, role: { ...role, tier: q.tier }, geom: { ...s.geom, nodes: s.geom.nodes.map((n) => (n.z === was ? { ...n, z: q.z } : n)) } }
}

/** The server rooms a run can be set to serve: those on every level it reaches, plus any it serves already (so a
 *  stale one can be unticked). Serving decides only where cables may JOIN the run (an outlet's drop, a rack's); once
 *  in, a cable goes along any run — a riser needs none (Dave 2026-10-10: Journey's high conduits served 33IDF1 only,
 *  so 33IDF2's TV07 / TV08 found no run beside them). */
export function servableRooms(ix: ProjectIndex, s: Shape): Space[] {
	if (s.geom.kind !== 'path') return []
	const levels = new Set([s.levelId, ...s.geom.nodes.map((n) => n.levelId)].filter(Boolean))
	const now = new Set(s.role?.kind === 'containment' ? s.role.serves ?? [] : [])
	return ix.spaces.filter((r) => (r.kind === 'server room' && levels.has(r.levelId)) || now.has(r.id)).sort((a, b) => naturalCompare(a.name, b.name))
}

/** The run with a server room ticked on / off; none left = it serves every room (`serves` dropped). */
export function toggleServes(s: Shape, roomId: Id, on: boolean): Shape {
	if (s.role?.kind !== 'containment') return s
	const { serves: _, ...role } = s.role
	const next = on ? [...new Set([...(s.role.serves ?? []), roomId])] : (s.role.serves ?? []).filter((id) => id !== roomId)
	return { ...s, role: next.length ? { ...role, serves: next } : role }
}
