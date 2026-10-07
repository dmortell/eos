// The RISER view (Phase 5.5): the building's backbone as a schematic elevation, generated from the data — nothing is
// drawn by hand (Dave: "risers from data only is ok for now"). Looking at the building from the front: x = plan x,
// up = true elevation (view y = −z, y down like every view). It shows:
//   · a band per floor: the slab under FFL, FFL, and the ceiling line (Level.heights); floors with area plans (33F
//     3303 / 3307) share one band;
//   · the server rooms, at the x of their placed racks;
//   · the riser runs (containment between levels) at their real x, with their labels;
//   · the BACKBONE cables, grouped per panel pair + cable type + the risers their routes use, each group as one
//     line room → riser → room labelled "24 × cat6a · 12m". Groups sharing a riser are laid side by side in lanes.
// Positions are real where the data has them; the view is a schematic (cable lengths come from the plans' routes).
import type { Id, Level, Rack, Device, Link } from '../domain/types'
import type { Shape, PathNode } from '../domain/shapes'
import type { ProjectIndex } from '../domain/project'
import type { Route } from '../domain/routing'
import { routeLinks, levelElevation } from '../domain/routing'
import { isVertical } from '../domain/shapes'
import type { Prim } from './display'

const ROOM_H = 2200, LANE = 180, MARGIN = 3000, BREAK_H = 1200

export interface RiserOpts { scale?: number; routes?: Map<Id, Route>; hideEmpty?: boolean }

/**
 * True elevation → the view's height, with floors left out squeezed: each run of hidden floors becomes one break band
 * BREAK_H tall; everything in a shown floor keeps its true size. With `storey` (a floor's own height), the space
 * above a floor's storey up to the next level — floors with no level at all, e.g. Journey's 13F–29F — is squeezed
 * the same way. `bands` = the squeezed runs, for their break marks (`from` / `to` = the hidden levels, if any).
 */
export function squeeze(floors: number[], shown: (e: number) => boolean, storey?: (e: number) => number): { z: (z: number) => number; bands: { z0: number; z1: number; from?: number; to?: number }[] } {
	const fs = [...new Set(floors)].sort((a, b) => a - b)
	if (!fs.length) return { z: (z) => z, bands: [] }
	// the true bands, bottom up: each floor's storey (shown or hidden), then any gap to the next level (hidden)
	const segs: { lo: number; hi: number; shown: boolean; level?: number }[] = []
	fs.forEach((e, i) => {
		const next = fs[i + 1] ?? e + (storey?.(e) ?? 4000), own = storey ? Math.min(next, e + storey(e)) : next   // nothing above the top floor
		segs.push({ lo: e, hi: own, shown: shown(e), level: e })
		if (own < next) segs.push({ lo: own, hi: next, shown: false })
	})
	const at: { lo: number; hi: number; v: number; h: number }[] = []   // true lo..hi → view v..v+h
	const bands: { z0: number; z1: number; from?: number; to?: number }[] = []
	let v = fs[0]
	for (let i = 0; i < segs.length; i++) {
		if (segs[i].shown) { at.push({ lo: segs[i].lo, hi: segs[i].hi, v, h: segs[i].hi - segs[i].lo }); v += segs[i].hi - segs[i].lo; continue }
		let j = i
		while (j + 1 < segs.length && !segs[j + 1].shown) j++
		const run = segs.slice(i, j + 1), levels = run.flatMap((s) => (s.level !== undefined ? [s.level] : []))
		run.forEach((s, q) => at.push({ lo: s.lo, hi: s.hi, v: v + (q * BREAK_H) / run.length, h: BREAK_H / run.length }))
		bands.push({ z0: v, z1: v + BREAK_H, ...(levels.length ? { from: levels[0], to: levels.at(-1) } : {}) })
		v += BREAK_H
		i = j
	}
	const z = (t: number): number => {
		if (t < fs[0]) return at[0].v - (fs[0] - t)
		const b = at.findLast((x) => t >= x.lo) ?? at[0]
		return t >= b.hi ? b.v + b.h + (t - b.hi) : b.v + ((t - b.lo) / (b.hi - b.lo)) * b.h
	}
	return { z, bands }
}

/** The risers: containment with a vertical segment between two levels. */
export function riserShafts(ix: ProjectIndex): { s: Shape; x: number; y: number; z0: number; z1: number; w: number }[] {
	const out: { s: Shape; x: number; y: number; z0: number; z1: number; w: number }[] = []
	for (const s of ix.shapes) {
		if (s.role?.kind !== 'containment' || s.geom.kind !== 'path') continue
		const nodes = new Map(s.geom.nodes.map((n) => [n.id, n]))
		const z = (n: PathNode) => n.z + levelElevation(ix, n.levelId ?? s.levelId)
		for (const g of s.geom.segs) {
			const a = nodes.get(g.a), b = nodes.get(g.b)
			if (!a || !b || !isVertical(a, b) || (a.levelId ?? s.levelId) === (b.levelId ?? s.levelId)) continue
			out.push({ s, x: a.x, y: a.y, z0: Math.min(z(a), z(b)), z1: Math.max(z(a), z(b)), w: Math.max(s.section?.w ?? 150, 150) })
		}
	}
	return out
}

export function riserDisplayList(ix: ProjectIndex, o: RiserOpts = {}): Prim[] {
	const k = o.scale ?? 100, txt = 2.5 * k, small = 2 * k
	const routes = o.routes ?? routeLinks(ix)
	const shafts = riserShafts(ix)
	// rooms at the x of their placed racks
	const rooms = ix.spaces.filter((sp) => sp.kind === 'server room').flatMap((sp) => {
		const racks = ix.racks.filter((r) => r.spaceId === sp.id && r.at)
		if (!racks.length) return []
		const xs = racks.flatMap((r) => [r.at!.x - r.widthMm / 2, r.at!.x + r.widthMm / 2])
		return [{ sp, x0: Math.min(...xs) - 300, x1: Math.max(...xs) + 300, z: levelElevation(ix, sp.levelId) }]
	})
	const xs = [...rooms.flatMap((r) => [r.x0, r.x1]), ...shafts.map((s) => s.x)]
	if (!xs.length) return [{ k: 'text', at: { x: 0, y: 0 }, text: 'No risers or placed server rooms yet', size: txt, cls: 'label' }]
	const x0 = Math.min(...xs) - MARGIN, x1 = Math.max(...xs) + MARGIN
	const out: Prim[] = []

	// floors: one band per elevation (area plans share it); floors with no server room can be squeezed into breaks
	const byElev = new Map<number, Level[]>()
	for (const l of ix.levels) byElev.set(l.elevationMm, [...(byElev.get(l.elevationMm) ?? []), l])
	const shown = (e: number) => !o.hideEmpty || rooms.some((r) => r.z === e)
	const storeyOf = (e: number) => { const h = byElev.get(e)?.[0]?.heights; return h ? h.raisedFloorMm + h.slabMm + h.clearHeightMm + h.plenumMm : 3800 }
	const { z: zv, bands } = squeeze([...byElev.keys()], shown, o.hideEmpty ? storeyOf : undefined)
	// each floor as a section through the building (as the old Risers tool): the slab, the raised-floor void above it
	// up to FFL, the room, the ceiling, the plenum up to the slab above — that slab drawn here too when no floor shows
	// directly above (the top floor, a floor under a break). Heights: ADR 0004 (slab top at FFL − raised floor).
	const elevs = [...byElev.keys()].sort((a, b) => a - b)
	const strip = (za: number, zb: number, cls: string): Prim => ({ k: 'line', pts: [{ x: x0, y: -za }, { x: x1, y: -za }, { x: x1, y: -zb }, { x: x0, y: -zb }], closed: true, fill: true, cls })
	for (const [e, ls] of [...byElev].sort((a, b) => a[0] - b[0])) {
		if (!shown(e)) continue
		const h = ls[0].heights, slab = h?.slabMm ?? 200, rf = h?.raisedFloorMm ?? 300, ceil = h?.clearHeightMm ?? 2600, plenum = h?.plenumMm ?? 700, v = zv(e)
		out.push(strip(v - rf, v - rf - slab, 'riser-slab'))
		if (rf > 0) out.push(strip(v, v - rf, 'riser-void'))
		if (plenum > 0) out.push(strip(v + ceil, v + ceil + plenum, 'riser-void'))
		// the slab above, unless the next floor up is shown and its own slab starts where this storey ends
		const above = elevs[elevs.indexOf(e) + 1], ha = above === undefined ? undefined : byElev.get(above)?.[0]?.heights
		const nextSlabAt = above === undefined ? Infinity : above - (ha?.raisedFloorMm ?? 300) - (ha?.slabMm ?? 200)
		if (above === undefined || !shown(above) || Math.abs(nextSlabAt - (e + ceil + plenum)) > 1) out.push(strip(v + ceil + plenum, v + ceil + plenum + slab, 'riser-slab'))
		out.push({ k: 'line', pts: [{ x: x0, y: -v }, { x: x1, y: -v }], cls: 'riser-ffl' })
		out.push({ k: 'line', pts: [{ x: x0, y: -(v + ceil) }, { x: x1, y: -(v + ceil) }], cls: 'riser-ceiling' })
		const names = [...new Set(ls.map((l) => l.name))].join(' / ')
		out.push({ k: 'text', at: { x: x0 + 200, y: -v - 300 }, text: `${names}  FFL ${(e / 1000).toFixed(2)}`, size: txt, cls: 'rv-label' })
	}
	// a break mark across each run of left-out floors, naming them
	const nameAt = (e: number) => [...new Set((byElev.get(e) ?? []).map((l) => l.name))].join(' / ')
	for (const b of bands) {
		const ym = -(b.z0 + b.z1) / 2, step = (x1 - x0) / 24, amp = BREAK_H * 0.15
		out.push({ k: 'line', pts: Array.from({ length: 25 }, (_, i) => ({ x: x0 + i * step, y: ym + (i % 2 ? amp : -amp) })), cls: 'riser-break' })
		const what = b.from === undefined ? 'floors with no level' : b.from === b.to ? `${nameAt(b.from)} not shown` : `${nameAt(b.from)} – ${nameAt(b.to!)} not shown`
		out.push({ k: 'text', at: { x: x0 + 200, y: ym - amp - small * 0.3 }, text: what, size: small, cls: 'datum-label' })
	}
	for (const r of rooms) {
		// the room fills its storey, FFL to ceiling (the old tool's boxes did; a fixed 2200 sat under a 2600 ceiling)
		const v = zv(r.z), rh = byElev.get(r.z)?.[0]?.heights?.clearHeightMm ?? ROOM_H
		out.push({ k: 'line', pts: [{ x: r.x0, y: -v }, { x: r.x1, y: -v }, { x: r.x1, y: -(v + rh) }, { x: r.x0, y: -(v + rh) }], closed: true, fill: true, cls: 'riser-room', src: r.sp.id })
		out.push({ k: 'text', at: { x: (r.x0 + r.x1) / 2, y: -(v + rh) + txt * 1.4 }, text: r.sp.name, size: txt, anchor: 'middle', cls: 'rv-label', src: r.sp.id })
	}
	for (const sh of shafts) {
		const v0 = zv(sh.z0), v1 = zv(sh.z1)
		out.push({ k: 'line', pts: [{ x: sh.x - sh.w / 2, y: -v0 }, { x: sh.x + sh.w / 2, y: -v0 }, { x: sh.x + sh.w / 2, y: -v1 }, { x: sh.x - sh.w / 2, y: -v1 }], closed: true, fill: true, cls: 'riser-shaft', src: sh.s.id })
		out.push({ k: 'text', at: { x: sh.x, y: -v1 - small * 0.6 }, text: sh.s.label || 'Riser', size: small, anchor: 'middle', cls: 'rv-label', src: sh.s.id })
	}

	// backbone groups
	const rackOf = (on: Id) => { const d = ix.get<Device>(on); return d?.type === 'device' ? ix.get<Rack>(d.rackId) : undefined }
	const roomBox = (rack: Rack | undefined) => rooms.find((r) => r.sp.id === rack?.spaceId)
	const shaftIds = new Set(shafts.map((s) => s.s.id))
	type Group = { a: Id; b: Id; type: string; risers: Id[]; links: Link[]; lengths: number[]; unrouted: number }
	const groups = new Map<string, Group>()
	for (const l of ix.links) {
		if (l.kind !== 'backbone') continue
		const ra = rackOf(l.a.on), rb = rackOf(l.b.on)
		if (!ra || !rb) continue
		const r = routes.get(l.id), risers = [...new Set((r?.segs ?? []).map((s) => s.shape).filter((id) => shaftIds.has(id)))]
		const [a, b] = ra.id < rb.id ? [ra.id, rb.id] : [rb.id, ra.id]
		const key = `${a}|${b}|${l.cableType ?? ''}|${risers.join(',')}`
		const g = groups.get(key) ?? { a, b, type: l.cableType ?? 'cable', risers, links: [], lengths: [], unrouted: 0 }
		g.links.push(l)
		if (r?.lengthM != null && !r.problem) g.lengths.push(r.lengthM)
		else g.unrouted++
		groups.set(key, g)
	}
	const lanesAt = new Map<Id, number>()   // per riser: lanes used so far
	let n = 0
	for (const g of groups.values()) {
		const ra = ix.get<Rack>(g.a)!, rb = ix.get<Rack>(g.b)!, A = roomBox(ra), B = roomBox(rb)
		if (!A || !B) continue
		const lo = A.z <= B.z ? { rack: ra, box: A } : { rack: rb, box: B }, hi = lo.rack === ra ? { rack: rb, box: B } : { rack: ra, box: A }
		const yA = -(zv(lo.box.z) + 600 + (n % 6) * 120), yB = -(zv(hi.box.z) + 600 + (n % 6) * 120)
		const xa = lo.rack.at!.x, xb = hi.rack.at!.x
		const sh = shafts.find((s) => s.s.id === g.risers[0])
		const lane = sh ? (lanesAt.get(sh.s.id) ?? 0) : 0
		if (sh) lanesAt.set(sh.s.id, lane + 1)
		const xr = sh ? sh.x + (lane - 0.5) * LANE : (xa + xb) / 2
		const pts = sh || lo.box.z !== hi.box.z ? [{ x: xa, y: yA }, { x: xr, y: yA }, { x: xr, y: yB }, { x: xb, y: yB }] : [{ x: xa, y: yA }, { x: xb, y: yB }]
		const len = g.lengths.length ? (Math.min(...g.lengths) === Math.max(...g.lengths) ? `${g.lengths[0]}m` : `${Math.min(...g.lengths)}–${Math.max(...g.lengths)}m`) : ''
		const label = `${g.links.length} × ${g.type}${len ? ` · ${len}` : ''}${g.unrouted ? ` · ${g.unrouted} no route` : ''}`
		out.push({ k: 'line', pts, cls: g.unrouted === g.links.length ? 'backbone backbone-none' : 'backbone', src: g.links[0].id })
		out.push({ k: 'text', at: { x: xr + small * 0.4, y: (yA + yB) / 2 }, text: label, size: small, cls: 'backbone-label', src: g.links[0].id })
		n++
	}
	return out
}
