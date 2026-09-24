// One-off IMPORT of a Risers-tool doc (`risers/{id}`) into a BUILDING model (drawings-plan §6, phase 8). Pure;
// tested in risersImport.test.ts.
//   storeys  one per floor in the riser's range (all of them), stacked from its per-floor heights (slab, raised
//            floor, clear height, plenum) — the building model becomes the source of truth for levels; z = 0
//            is the top of the lowest floor's slab (the Risers tool's own datum)
//   geometry the riser elevation is a section along the building's width, so its x is model x (y = 0):
//            rooms → boxes on the raised floor, ladders → vertical trunks from the lowest floor's slab to the
//            top floor's soffit, cables → thin conduits room → ladder → room at their high (plenum) / low
//            (raised-floor void) levels
//   labels   not imported yet (listed in the notes)
// Ids are deterministic (`rsr-room-<id>`, `rsr-lad-<id>`, `rsr-cab-<id>`) so importing again REPLACES what was
// imported and keeps anything drawn in Pages.
import type { Model, Obj, Layer, Storey, Levels } from '../3dview/types'

export type FloorHeights = { slabMm: number; raisedFloorMm: number; clearHeightMm: number; plenumMm: number }
export const DEFAULT_HEIGHTS: FloorHeights = { slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2600, plenumMm: 700 }
/** The slice of the Risers tool's doc the import reads (risers/parts/types.ts RiserDocData). */
export type RisersDocIn = {
	fromFloor: number; toFloor: number
	floorHeights?: Record<number, Partial<FloorHeights>>
	settings?: { defaultFloorHeights?: Partial<FloorHeights> }
	rooms?: { id: string; kind: 'server' | 'eps'; floor: number; xMm: number; widthMm: number; label: string }[]
	ladders?: { id: string; label: string; xMm: number; fromFloor: number; toFloor: number; widthMm?: number }[]
	cables?: { id: string; label?: string; segments: { roomId: string; level?: 'high' | 'low'; entryLevel?: 'high' | 'low'; ladderId?: string }[] }[]
	labels?: unknown[]
}

export const RISER_LAYERS: Layer[] = [
	{ id: 'riser-rooms', name: 'Server rooms', group: 'Risers', color: '#2563eb', visible: true, locked: false },
	{ id: 'riser-eps', name: 'EPS rooms', group: 'Risers', color: '#d97706', visible: true, locked: false },
	{ id: 'riser-ladders', name: 'Riser ladders', group: 'Risers', color: '#6b7280', visible: true, locked: false },
	{ id: 'riser-cables', name: 'Riser cables', group: 'Risers', color: '#059669', visible: true, locked: false },
]
const ROOM_DEPTH = 2000   // the elevation has no depth: rooms get a nominal one
const storeyId = (n: number) => `st-F${n}`
/** 0 = the ground floor ("GF"); a building without one lists 0 as skipped (the Risers tool's convention). */
export const floorLabel = (n: number) => (n < 0 ? `B${-n}F` : n === 0 ? 'GF' : `${n}F`)

/** The floors a riser covers: EVERY floor in its range — a building's floors are contiguous even where the
 *  project lists only some (the storey heights must stack through the unlisted ones) — minus `skipped`. */
export function riserFloors(d: Pick<RisersDocIn, 'fromFloor' | 'toFloor'>, skipped: number[] = []): number[] {
	return stackFloors({ bottom: d.fromFloor, top: d.toFloor, skipped })
}

/** A building's floors from its stack: `bottom`…`top` without the skipped ones. 0 is the ground floor (GF) —
 *  a building with none (B1F → 1F, usual in Japan) lists 0 as skipped, like the Risers tool. */
export function stackFloors(s: { bottom: number; top: number; skipped?: number[] }): number[] {
	const lo = Math.min(s.bottom, s.top), hi = Math.max(s.bottom, s.top), skip = new Set(s.skipped ?? [])
	return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).filter((n) => !skip.has(n))
}
const storeyOf = (n: number, h: FloorHeights): Omit<Storey, 'z'> => ({ id: storeyId(n), name: floorLabel(n), slab: h.slabMm, floorSlab: 0,
	raisedFloor: h.raisedFloorMm, ceilingTile: h.raisedFloorMm + h.clearHeightMm, ceilingSlab: h.raisedFloorMm + h.clearHeightMm + h.plenumMm })
/** Stack storeys bottom-up: each datum (top of its slab) = the one below + its soffit height (`ceilingSlab`) +
 *  this floor's slab. The lowest datum is z 0. */
function stack(list: Omit<Storey, 'z'>[]): Storey[] {
	let z = 0
	return list.map((s, i) => { if (i > 0) z += (list[i - 1].ceilingSlab ?? 3600) + (s.slab ?? DEFAULT_HEIGHTS.slabMm); return { ...s, z } })
}
/** Storeys for `floors` from the riser's heights (per floor, else its defaults). Levels are heights above the
 *  datum (a floor model's `levels`). */
export function riserStoreys(d: RisersDocIn, floors: number[]): Storey[] {
	const hts = (n: number): FloorHeights => ({ ...DEFAULT_HEIGHTS, ...d.settings?.defaultFloorHeights, ...d.floorHeights?.[n] })
	return stack(floors.map((n) => storeyOf(n, hts(n))))
}
/** A building's storeys after its floor stack changed: an existing storey keeps its heights, a new floor gets
 *  the default ones, and the datums re-stack. */
export function restack(floors: number[], existing: Storey[] = []): Storey[] {
	return stack(floors.map((n) => { const e = existing.find((s) => s.id === storeyId(n)); if (!e) return storeyOf(n, DEFAULT_HEIGHTS); const { z: _z, ...rest } = e; return rest }))
}
/** A storey's levels (for a floor model's cached `levels`). */
export const storeyLevels = (s: Storey): Levels => ({ floorSlab: s.floorSlab, raisedFloor: s.raisedFloor, ceilingTile: s.ceilingTile, ceilingSlab: s.ceilingSlab })

/** `floors` = the building's whole stack (its place's `floors`), else the riser's own range. */
export function risersToBuilding(d: RisersDocIn, floors: number[] = riserFloors(d)): { storeys: Storey[]; objects: Obj[]; notes: string[] } {
	const storeys = riserStoreys(d, floors), notes: string[] = []
	const st = (n: number) => storeys.find((s) => s.id === storeyId(n))
	const objects: Obj[] = []
	const rooms = new Map((d.rooms ?? []).map((r) => [r.id, r]))
	for (const r of d.rooms ?? []) {
		const s = st(r.floor); if (!s) { notes.push(`Room “${r.label}” is on ${floorLabel(r.floor)}, outside the riser's floors`); continue }
		objects.push({ type: 'prism', id: `rsr-room-${r.id}`, layer: r.kind === 'eps' ? 'riser-eps' : 'riser-rooms', edges: 4,
			x: r.xMm - r.widthMm / 2, y: -ROOM_DEPTH / 2, z: s.z + (s.raisedFloor ?? 0), w: r.widthMm, d: ROOM_DEPTH, h: (s.ceilingTile ?? 2900) - (s.raisedFloor ?? 0) })
	}
	for (const l of d.ladders ?? []) {
		const a = st(Math.min(l.fromFloor, l.toFloor)), b = st(Math.max(l.fromFloor, l.toFloor))
		if (!a || !b) { notes.push(`Ladder “${l.label}” runs outside the riser's floors`); continue }
		const z0 = a.z, z1 = b.z + (b.ceilingSlab ?? 3500)
		objects.push({ type: 'conduit', id: `rsr-lad-${l.id}`, layer: 'riser-ladders', w: l.widthMm ?? 300, h: 100, edges: 4,
			nodes: [{ id: 'a', x: l.xMm, y: 0, z: z0 }, { id: 'b', x: l.xMm, y: 0, z: z1 }], segments: [{ id: 's', a: 'a', b: 'b' }] } as Obj)
	}
	const ladders = new Map((d.ladders ?? []).map((l) => [l.id, l]))
	// a cable runs in the plenum (high) or the raised-floor void (low) of each floor it passes
	const levelZ = (n: number, lvl?: 'high' | 'low') => { const s = st(n)!; return lvl === 'low' ? s.z + (s.raisedFloor ?? 300) / 2 : s.z + ((s.ceilingTile ?? 2900) + (s.ceilingSlab ?? 3600)) / 2 }
	for (const c of d.cables ?? []) {
		const pts: { x: number; z: number }[] = []
		const add = (x: number, z: number) => { const p = pts[pts.length - 1]; if (!p || p.x !== x || p.z !== z) pts.push({ x, z }) }
		let ok = true
		c.segments.forEach((sg, i) => {
			const r = rooms.get(sg.roomId); if (!r || !st(r.floor)) { ok = false; return }
			const prev = c.segments[i - 1]
			const arriving = sg.entryLevel ?? prev?.level ?? sg.level
			if (i > 0) add(r.xMm, levelZ(r.floor, arriving))   // arrive at this room
			const next = c.segments[i + 1]
			if (!next) return
			const nr = rooms.get(next.roomId), lad = sg.ladderId ? ladders.get(sg.ladderId) : undefined
			if (!nr || !st(nr.floor)) { ok = false; return }
			add(r.xMm, levelZ(r.floor, sg.level))                  // leave this room at its exit level
			const nzEntry = levelZ(nr.floor, next.entryLevel ?? sg.level)
			if (lad) { add(lad.xMm, levelZ(r.floor, sg.level)); add(lad.xMm, nzEntry) }   // along to the ladder, up / down it
		})
		if (!ok || pts.length < 2) { notes.push(`Cable “${c.label ?? c.id}” has a route through a room outside the riser — not imported`); continue }
		objects.push({ type: 'conduit', id: `rsr-cab-${c.id}`, layer: 'riser-cables', w: 40, h: 40, edges: 16,
			nodes: pts.map((p, i) => ({ id: `n${i}`, x: p.x, y: 0, z: p.z })), segments: pts.slice(1).map((_, i) => ({ id: `s${i}`, a: `n${i}`, b: `n${i + 1}` })) } as Obj)
	}
	if (d.labels?.length) notes.push(`${d.labels.length} text label${d.labels.length === 1 ? '' : 's'} not imported (no elevation text yet)`)
	return { storeys, objects, notes }
}

/** The building model with the riser merged in: its imported objects replaced (by id), its storeys replaced,
 *  the riser layers added once. A NEW model object (the input isn't mutated). */
export function mergeRisers(m: Model, r: { storeys: Storey[]; objects: Obj[] }): Model {
	const keep = m.objects.filter((o) => !o.id?.startsWith('rsr-'))
	const layers = [...(m.layers ?? [])]
	for (const l of RISER_LAYERS) if (!layers.some((x) => x.id === l.id)) layers.push({ ...l })
	return { ...m, objects: [...keep, ...r.objects], storeys: r.storeys, layers }
}
