// One-off IMPORT of a Risers-tool doc (`risers/{id}`) into a BUILDING model (drawings-plan §6, phase 8). Pure;
// tested in risersImport.test.ts.
//   storeys  one per floor in the riser's range (all of them), stacked from its per-floor heights (slab, raised
//            floor, clear height, plenum) — the building model becomes the source of truth for levels; z = 0
//            is the top of the lowest floor's slab (the Risers tool's own datum)
//   geometry the riser elevation is a section along the building's width, so its x is model x (y = 0):
//            rooms → boxes on the raised floor, ladders → vertical trunks from the lowest floor's slab to the
//            top floor's soffit, cables → thin conduits room → ladder → room at their high (plenum) / low
//            (raised-floor void) levels
//   labels   free text labels → text shapes drawn in the FRONT elevation (drawing coords [x, GROUND − z]; the
//            Risers tool measures them down from the top of its lowest floor's slab); cable colours kept
// Ids are deterministic (`rsr-<riserId>-room-<id>`, `…-lad-`, `…-cab-`, `…-lbl-`) so importing again REPLACES
// what was imported and keeps anything drawn in Pages.
import type { Model, Obj, Layer, Storey, Levels } from '../3dview/types'
import type { Ent } from '../ui/geometry'
import { GROUND } from '../ui/geometry'
import { PT_MM } from '../constants'

export type FloorHeights = { slabMm: number; raisedFloorMm: number; clearHeightMm: number; plenumMm: number }
export const DEFAULT_HEIGHTS: FloorHeights = { slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2600, plenumMm: 700 }
/** The slice of the Risers tool's doc the import reads (risers/parts/types.ts RiserDocData). */
export type RisersDocIn = {
	fromFloor: number; toFloor: number
	floorHeights?: Record<number, Partial<FloorHeights>>
	settings?: { defaultFloorHeights?: Partial<FloorHeights> }
	rooms?: { id: string; kind: 'server' | 'eps'; floor: number; xMm: number; widthMm: number; label: string }[]
	ladders?: { id: string; label: string; xMm: number; fromFloor: number; toFloor: number; widthMm?: number }[]
	cables?: { id: string; label?: string; media?: 'copper' | 'fiber'; color?: string; segments: { roomId: string; level?: 'high' | 'low'; entryLevel?: 'high' | 'low'; ladderId?: string }[] }[]
	labels?: { id: string; xMm: number; yMm: number; text: string; fontSizeMm?: number; color?: string }[]
	/** The floors the Risers tool's elevation hides ("Visible") — a riser drawing's hidden floors. */
	hiddenFloors?: number[]
}
/** The storey ids a riser DRAWING shows: its from…to range minus its hidden floors (existing storeys only). */
export function riserVisibleStoreys(d: Pick<RisersDocIn, 'fromFloor' | 'toFloor' | 'hiddenFloors'>, storeys: Storey[]): string[] {
	const want = new Set(riserFloors(d, d.hiddenFloors ?? []).map(storeyId))
	return storeys.filter((s) => want.has(s.id)).map((s) => s.id)
}
/** The object-id prefix of one riser's imported geometry (so several risers can share a building). */
export const riserPrefix = (riserId: string) => `rsr-${riserId}-`
const LEGACY = /^rsr-(room|lad|cab)-/   // before per-riser ids

export const RISER_LAYERS: Layer[] = [
	{ id: 'riser-rooms', name: 'IDF rooms', group: 'Risers', color: '#2563eb', visible: true, locked: false },
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
/** A storey's heights as the Risers tool names them (slab, raised floor, clear height, plenum). */
export function storeyHeights(s: Storey): FloorHeights {
	const raised = s.raisedFloor ?? DEFAULT_HEIGHTS.raisedFloorMm, tile = s.ceilingTile ?? raised + DEFAULT_HEIGHTS.clearHeightMm
	return { slabMm: s.slab ?? DEFAULT_HEIGHTS.slabMm, raisedFloorMm: raised, clearHeightMm: tile - raised, plenumMm: (s.ceilingSlab ?? tile + DEFAULT_HEIGHTS.plenumMm) - tile }
}
/** The storeys with one floor's heights changed (a building's HEIGHTS table; id '*' = every floor), re-stacked. */
export function setStoreyHeights(storeys: Storey[], id: string | '*', patch: Partial<FloorHeights>): Storey[] {
	const sorted = [...storeys].sort((a, b) => a.z - b.z)
	return stack(sorted.map((s) => {
		const { z: _z, ...rest } = s
		if (id !== '*' && s.id !== id) return rest
		const h = { ...storeyHeights(s), ...patch }
		return { ...rest, ...storeyOf(0, h), id: s.id, name: s.name }
	}))
}
/** A building's storeys after its floor stack changed: an existing storey keeps its heights, a new floor gets
 *  the default ones, and the datums re-stack. */
export function restack(floors: number[], existing: Storey[] = []): Storey[] {
	return stack(floors.map((n) => { const e = existing.find((s) => s.id === storeyId(n)); if (!e) return storeyOf(n, DEFAULT_HEIGHTS); const { z: _z, ...rest } = e; return rest }))
}
/** A storey's levels (for a floor model's cached `levels`). */
export const storeyLevels = (s: Storey): Levels => ({ floorSlab: s.floorSlab, raisedFloor: s.raisedFloor, ceilingTile: s.ceilingTile, ceilingSlab: s.ceilingSlab })

/** `floors` = the building's whole stack (its place's `floors`), else the riser's own range. `riserId` keys the
 *  object ids (several risers per building); `layerIds` = the model's layers — ladders go on its Trunks layer and
 *  cables on Copper / Fiber Trunks by media when it has them (else the import's own Risers layers). */
export function risersToBuilding(d: RisersDocIn, floors: number[] = riserFloors(d), opts: { riserId?: string; layerIds?: string[]; storeys?: Storey[]; textLayer?: string } = {}): { storeys: Storey[]; objects: Obj[]; shapes: Ent[]; notes: string[] } {
	// `opts.storeys` = the building's own (edited) storeys to build on; else the riser's heights
	const storeys = opts.storeys ?? riserStoreys(d, floors), notes: string[] = []
	const pre = opts.riserId ? riserPrefix(opts.riserId) : 'rsr-', has = new Set(opts.layerIds ?? [])
	const ladderLayer = has.has('trunks') ? 'trunks' : 'riser-ladders'
	const cableLayer = (media?: string) => (media === 'fiber' ? (has.has('fiber') ? 'fiber' : 'riser-cables') : has.has('copper') ? 'copper' : 'riser-cables')
	const st = (n: number) => storeys.find((s) => s.id === storeyId(n))
	const objects: Obj[] = []
	const rooms = new Map((d.rooms ?? []).map((r) => [r.id, r]))
	for (const r of d.rooms ?? []) {
		const s = st(r.floor); if (!s) { notes.push(`Room “${r.label}” is on ${floorLabel(r.floor)}, outside the riser's floors`); continue }
		objects.push({ type: 'prism', id: `${pre}room-${r.id}`, layer: r.kind === 'eps' ? 'riser-eps' : 'riser-rooms', edges: 4, label: r.label,
			x: r.xMm - r.widthMm / 2, y: -ROOM_DEPTH / 2, z: s.z + (s.raisedFloor ?? 0), w: r.widthMm, d: ROOM_DEPTH, h: (s.ceilingTile ?? 2900) - (s.raisedFloor ?? 0) })
	}
	for (const l of d.ladders ?? []) {
		const a = st(Math.min(l.fromFloor, l.toFloor)), b = st(Math.max(l.fromFloor, l.toFloor))
		if (!a || !b) { notes.push(`Ladder “${l.label}” runs outside the riser's floors`); continue }
		const z0 = a.z, z1 = b.z + (b.ceilingSlab ?? 3500)
		objects.push({ type: 'conduit', id: `${pre}lad-${l.id}`, layer: ladderLayer, label: l.label, w: l.widthMm ?? 300, h: 100, edges: 4,
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
		objects.push({ type: 'conduit', id: `${pre}cab-${c.id}`, layer: cableLayer(c.media), label: c.label, ...(c.color ? { color: c.color } : {}), w: 40, h: 40, edges: 16,
			nodes: pts.map((p, i) => ({ id: `n${i}`, x: p.x, y: 0, z: p.z })), segments: pts.slice(1).map((_, i) => ({ id: `s${i}`, a: `n${i}`, b: `n${i + 1}` })) } as Obj)
	}
	// free text labels → front-elevation text (Pages text is sized on paper: the Risers tool's mm → pt at 1:100)
	const shapes: Ent[] = []
	const base = st(Math.min(d.fromFloor, d.toFloor)) ?? storeys[0]
	for (const l of d.labels ?? []) {
		if (!base) break
		const fs = l.fontSizeMm ?? 240, zBaseline = base.z - l.yMm - fs * 0.8
		const e: Ent = { id: `${pre}lbl-${l.id}`, type: 'text', plane: 'front', a: [l.xMm, GROUND - zBaseline], text: l.text, fontPt: Math.max(4, Math.round(fs / 100 / PT_MM)) }
		if (opts.textLayer) e.layer = opts.textLayer
		if (l.color) e.color = l.color
		shapes.push(e)
	}
	return { storeys, objects, shapes, notes }
}

/** The building model with ONE riser merged in: that riser's imported objects replaced (and any from before
 *  per-riser ids), its storeys replaced, the layers the objects use added once / made visible (the Trunks layers
 *  start hidden). A NEW model object (the input isn't mutated). */
export function mergeRisers(m: Model, r: { storeys: Storey[]; objects: Obj[]; shapes?: Ent[] }, riserId?: string, opts: { keepLabels?: boolean } = {}): Model {
	const mine = (id?: string) => !!id && (riserId ? id.startsWith(riserPrefix(riserId)) || LEGACY.test(id) : id.startsWith('rsr-'))
	const keep = m.objects.filter((o) => !mine(o.id))
	// its text labels: replaced like the objects (a re-stack keeps text edited in Pages, at the new height)
	const oldShapes = new Map((m.shapes ?? []).filter((e) => mine(e.id)).map((e) => [e.id, e]))
	const shapes = [...(m.shapes ?? []).filter((e) => !mine(e.id)), ...(r.shapes ?? []).map((e) => (opts.keepLabels && oldShapes.has(e.id) ? { ...oldShapes.get(e.id)!, a: e.a } : e))]
	// a re-stack (not a re-import) keeps labels renamed in Pages
	if (opts.keepLabels) {
		const old = new Map(m.objects.filter((o) => mine(o.id)).map((o) => [o.id, o.label]))
		r = { ...r, objects: r.objects.map((o) => (old.has(o.id) ? { ...o, label: old.get(o.id) } : o)) }
	}
	const used = new Set(r.objects.map((o) => o.layer).filter((x): x is string => !!x))
	const layers = (m.layers ?? []).map((l) => (used.has(l.id) && !l.visible ? { ...l, visible: true } : l))
	for (const l of RISER_LAYERS) if (used.has(l.id) && !layers.some((x) => x.id === l.id)) layers.push({ ...l })
	return { ...m, objects: [...keep, ...r.objects], shapes, storeys: r.storeys, layers }
}
