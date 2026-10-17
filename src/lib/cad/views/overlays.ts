// OVERLAYS drawn over a view (split out of ui/ViewCanvas.svelte): the selected ports of a device, the circuit of a
// selected cord / port, the fill bands of runs, the routes of the selected outlets / links / ports, and the other
// pane's work plane. Pure: display-list in, display-list out.
import type { Prim } from './display'
import type { ProjectIndex } from '../domain/project'
import type { Id, Pt } from '../domain/types'
import type { Entity } from '../domain/drawing'
import type { PortSel } from '../editor/tools'
import type { Route } from '../domain/routing'
import type { Estimate } from '../domain/estimates'
import type { ViewSpec, ViewSpace } from './space'
import { levelElevation } from '../domain/routing'
import { primBounds, unionBounds } from './display'
import { spaceOf } from './space'
import { traceCircuit } from '../domain/cords'
import { fillTone, estCount } from '../domain/fill'

/** The selected ports (rack rows), a tint over their cells — then their labels and the panel's name (drawn over its
 *  ports) again on top, so neither is lost under the highlight (User 2026-10-07). */
export function portCells(prims: Prim[], s: PortSel | null): Prim[] {
	if (!s) return []
	const want = new Set(s.ports.map(String))
	const cells = prims.flatMap((p) => (p.k === 'line' && p.src === s.on && p.sub && want.has(p.sub) && p.cls.startsWith('port') ? [{ ...p, cls: 'port-sel', src: undefined }] : []))
	return [...cells, ...labelsOf(prims, new Set([...want].map((n) => `${s.on}:${n}`)), 'port-label port-label-sel'), ...namesOver(prims, [s.on])]
}

/** The panel ports linked to the selected OUTLETS (User 2026-10-10: pick outlets in the list, see their ports on the
 *  frame), drawn as selected ports. */
export function outletPortCells(ix: ProjectIndex, prims: Prim[], selection: Id[]): Prim[] {
	const outlets = new Set(selection.filter((id) => ix.get(id)?.type === 'outlet'))
	if (!outlets.size) return []
	const keys = new Set(ix.links.flatMap((l) => (outlets.has(l.b.on) ? [`${l.a.on}:${l.a.port}`] : outlets.has(l.a.on) ? [`${l.b.on}:${l.b.port}`] : [])))
	if (!keys.size) return []
	const cells = prims.flatMap((p) => (p.k === 'line' && p.src && p.sub && p.cls.startsWith('port') && keys.has(`${p.src}:${p.sub}`) ? [{ ...p, cls: 'port-sel', src: undefined }] : []))
	const devs = [...new Set([...keys].map((k) => k.split(':')[0]))]
	return [...cells, ...labelsOf(prims, keys, 'port-label port-label-sel'), ...namesOver(prims, devs)]
}

/** A panel's name drawn over its ports (no src: it takes no clicks) — found inside the device's body. */
function namesOver(prims: Prim[], devices: Id[]): Prim[] {
	const bodies = prims.flatMap((p) => (p.k === 'line' && p.src && devices.includes(p.src) && p.cls.startsWith('device ') ? [primBounds(p)] : []))
	return prims.filter((p) => p.k === 'text' && !p.src && p.cls.includes('on-ports') && bodies.some((b) => p.at.x >= b.x0 && p.at.x <= b.x1 && p.at.y >= b.y0 && p.at.y <= b.y1))
}

/** The port labels of these ports (`device:port`), restyled, to draw over a highlight cell (no layer color: the
 *  class decides). */
function labelsOf(prims: Prim[], keys: Set<string>, cls: string): Prim[] {
	return prims.flatMap((p) => (p.k === 'text' && p.src && p.sub && p.cls === 'port-label' && keys.has(`${p.src}:${p.sub}`) ? [{ ...p, cls, src: undefined, color: undefined }] : []))
}

/** The circuit of a selected cord or single port (rack rows): its cords and ports drawn highlighted. */
export function circuitOf(ix: ProjectIndex, prims: Prim[], selection: Id[], ps: PortSel | null): Prim[] {
	const one = selection.length === 1 ? ix.get(selection[0]) : undefined
	const start = one?.type === 'cord' ? { on: one.a.on, port: one.a.port } : ps?.ports.length === 1 ? { on: ps.on, port: ps.ports[0] } : null
	if (!start) return []
	const steps = traceCircuit(ix, start)
	if (steps.length < 2) return []
	const cords = new Set(steps.flatMap((s) => (s.via?.kind === 'cord' ? [s.via.id] : [])))
	const ports = new Set(steps.map((s) => `${s.ref.on}:${s.ref.port}`))
	if (ps?.ports.length === 1) ports.delete(`${ps.on}:${ps.ports[0]}`)   // the selected port itself: blue, not blue over amber
	const lines = prims.flatMap((p) => p.k !== 'line' ? [] :
		p.src && cords.has(p.src) ? [{ ...p, cls: 'trace-cord', src: undefined, color: undefined }] :   // no inline color: the trace look wins
		p.src && p.sub && p.cls.startsWith('port') && ports.has(`${p.src}:${p.sub}`) ? [{ ...p, cls: 'trace-port', src: undefined }] : [])
	const devs = [...new Set(steps.map((s) => s.ref.on))]
	return [...lines, ...labelsOf(prims, ports, 'port-label port-label-trace'), ...namesOver(prims, devs)]   // labels and names over the cells
}

type BandFill = { shape: Id; seg: Id; pct: number; est?: Record<string, number> }
/** Fill overlay (Phase 5.3, plan): each run segment with cables in it as a band in its fill tone, with its % — and how
 *  many of its cables are estimates ("35% · 4 est."). */
export function fillBands(ix: ProjectIndex, fills: Iterable<BandFill> | Map<string, BandFill>, levelId: Id, plotScale: number): Prim[] {
	const out: Prim[] = []
	for (const f of fills instanceof Map ? fills.values() : fills) {
		const s = ix.get(f.shape)
		if (s?.type !== 'shape' || s.geom.kind !== 'path') continue
		const g = s.geom, sg = g.segs.find((x) => x.id === f.seg), a = g.nodes.find((n) => n.id === sg?.a), b = g.nodes.find((n) => n.id === sg?.b)
		if (!a || !b || (a.levelId ?? s.levelId) !== levelId || Math.hypot(b.x - a.x, b.y - a.y) < 0.5) continue
		const tone = fillTone(f.pct), w = (sg?.section ?? s.section)?.w ?? 100, est = estCount(f)
		out.push({ k: 'line', pts: [a, b], w: Math.max(w, 150), cls: `fill-band fill-${tone}` })
		out.push({ k: 'text', at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, text: `${Number.isFinite(f.pct) ? `${Math.round(f.pct)}%` : 'no size'}${est ? ` · ${est} est.` : ''}`, size: 2.2 * plotScale, anchor: 'middle', cls: `fill-label fill-${tone}` })
	}
	return out
}

/** Fill rates in an ELEVATION or SECTION (User 2026-10-17: risers and vertical conduits too): each run segment of this
 *  level — or rising / dropping to it — seen in `space`, the same bands and % as the plan. Heights are this level's
 *  (a node on another level is lifted by the difference of their FFLs). `range` (a section): only what lies in its cut. */
export function fillBandsElev(ix: ProjectIndex, fills: Iterable<BandFill> | Map<string, BandFill>, levelId: Id, space: ViewSpace, plotScale: number,
	range?: { near: number; far: number; u0: number; u1: number }): Prim[] {
	const out: Prim[] = [], base = levelElevation(ix, levelId)
	for (const f of fills instanceof Map ? fills.values() : fills) {
		const s = ix.get(f.shape)
		if (s?.type !== 'shape' || s.geom.kind !== 'path') continue
		const g = s.geom, sg = g.segs.find((x) => x.id === f.seg), a = g.nodes.find((n) => n.id === sg?.a), b = g.nodes.find((n) => n.id === sg?.b)
		if (!a || !b) continue
		const la = a.levelId ?? s.levelId, lb = b.levelId ?? s.levelId
		if (la !== levelId && lb !== levelId) continue
		const w3 = (n: typeof a, l: Id | undefined) => ({ x: n.x, y: n.y, z: n.z + levelElevation(ix, l) - base })
		const A = w3(a, la), B = w3(b, lb)
		if (range) {
			const d = (space.depthOf(A) + space.depthOf(B)) / 2
			if (d > range.near || d < range.far) continue
		}
		const pa = space.fromWorld(A), pb = space.fromWorld(B)
		if (range && Math.max(pa.x, pb.x) < range.u0 || range && Math.min(pa.x, pb.x) > range.u1) continue
		if (Math.hypot(pb.x - pa.x, pb.y - pa.y) < 0.5) continue   // end-on in this view
		const tone = fillTone(f.pct), w = (sg?.section ?? s.section)?.w ?? 100, est = estCount(f)
		out.push({ k: 'line', pts: [pa, pb], w: Math.max(w, 150), cls: `fill-band fill-${tone}` })
		out.push({ k: 'text', at: { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }, text: `${Number.isFinite(f.pct) ? `${Math.round(f.pct)}%` : 'no size'}${est ? ` · ${est} est.` : ''}`, size: 2.2 * plotScale, anchor: 'middle', cls: `fill-label fill-${tone}` })
	}
	return out
}

/** The cable routes (Phase 5) of the selected outlets / links / panel ports, drawn over the runs they use (plan). */
export function routesOf(ix: ProjectIndex, routes: Map<Id, Route>, levelId: Id, selection: Id[], ps: PortSel | null, estimates: readonly Estimate[] = []): Prim[] {
	const links = new Set<string>()
	for (const id of selection) {
		const e = ix.get(id)
		if (e?.type === 'outlet') for (const p of e.ports) { const l = ix.linkAt({ on: e.id, port: p.port }); if (l) links.add(l.id) }
		else if (e?.type === 'link') links.add(e.id)
	}
	if (ps) for (const n of ps.ports) { const l = ix.linkAt({ on: ps.on, port: n }); if (l) links.add(l.id) }
	const out: Prim[] = []
	const draw = (segs: Route['segs'], cls: string) => {
		for (const r of segs) {
			const s = ix.get(r.shape)
			if (s?.type !== 'shape' || s.geom.kind !== 'path') continue
			const g = s.geom, sg = g.segs.find((x) => x.id === r.seg), a = g.nodes.find((n) => n.id === sg?.a), b = g.nodes.find((n) => n.id === sg?.b)
			if (!a || !b || ![a.levelId ?? s.levelId, b.levelId ?? s.levelId].includes(levelId)) continue
			out.push(Math.hypot(b.x - a.x, b.y - a.y) < 0.5 ? { k: 'circle', c: a, r: 150, cls } : { k: 'line', pts: [a, b], cls })
		}
	}
	for (const id of links) draw(routes.get(id)?.segs ?? [], 'trace-route')
	// a selected outlet's ESTIMATED cables (ports with no link), only where its room is set — a guessed room isn't shown as if it were known
	const outlets = new Set(selection.filter((id) => ix.get(id)?.type === 'outlet'))
	for (const e of estimates) if (e.roomSet && outlets.has(e.outletId)) draw(e.segs, 'trace-route trace-route-est')
	return out
}

/** Colors for server rooms on the all-routes overlay, in the rooms' name order. */
const ROOM_COLOURS = ['#0ea5e9', '#f97316', '#a855f7', '#22c55e', '#e11d48', '#eab308', '#14b8a6', '#6366f1']

/** EVERY horizontal cable's route on this level (backlog "Show all routes"; the plan's Routes toggle), colored by its
 *  server room (the panel end's room): each run segment once per room, rooms sharing a segment drawn side by side.
 *  ESTIMATED cables (unlinked outlet ports) are drawn dashed and lighter where a room has only estimates on a
 *  segment. `rooms` = the color of each room drawn (for the strip's key). */
export function allRoutesOf(ix: ProjectIndex, routes: Map<Id, Route>, levelId: Id, estimates: readonly Estimate[] = []): { prims: Prim[]; rooms: { id: Id; name: string; color: string }[] } {
	const roomOf = (linkId: Id): Id | undefined => {
		const l = ix.get(linkId)
		if (l?.type !== 'link') return undefined
		const d = ix.get(l.a.on), rack = d?.type === 'device' ? ix.get(d.rackId) : undefined
		return rack?.type === 'rack' ? rack.spaceId : undefined
	}
	// per segment: its rooms, each true = a linked cable, false = estimates only
	const bySeg = new Map<string, { a: Pt; b: Pt; rooms: Map<Id, boolean> }>()
	const cables: [Id | undefined, Route['segs'], boolean][] = [
		...[...routes].map(([linkId, r]): [Id | undefined, Route['segs'], boolean] => [roomOf(linkId), r.segs, true]),
		...estimates.map((e): [Id | undefined, Route['segs'], boolean] => [e.roomId, e.segs, false]),
	]
	for (const [room, segs, linked] of cables) {
		if (!room) continue
		for (const x of segs) {
			const key = `${x.shape}:${x.seg}`
			let e = bySeg.get(key)
			if (!e) {
				const s = ix.get(x.shape)
				if (s?.type !== 'shape' || s.geom.kind !== 'path') continue
				const g = s.geom, sg = g.segs.find((q) => q.id === x.seg), a = g.nodes.find((n) => n.id === sg?.a), b = g.nodes.find((n) => n.id === sg?.b)
				if (!a || !b || (a.levelId ?? s.levelId) !== levelId || (b.levelId ?? s.levelId) !== levelId || Math.hypot(b.x - a.x, b.y - a.y) < 0.5) continue
				bySeg.set(key, (e = { a, b, rooms: new Map() }))
			}
			e.rooms.set(room, linked || !!e.rooms.get(room))
		}
	}
	const all = [...new Set([...bySeg.values()].flatMap((e) => [...e.rooms.keys()]))].map((id) => ({ id, name: ix.nameOf(id) })).sort((p, q) => p.name.localeCompare(q.name, undefined, { numeric: true }))
	const color = new Map(all.map((r, i) => [r.id, ROOM_COLOURS[i % ROOM_COLOURS.length]]))
	const prims: Prim[] = []
	for (const { a, b, rooms } of bySeg.values()) {
		const list = all.filter((r) => rooms.has(r.id)), len = Math.hypot(b.x - a.x, b.y - a.y), nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len
		list.forEach((r, i) => {
			const off = (i - (list.length - 1) / 2) * 60   // side by side, 60 mm apart
			prims.push({ k: 'line', pts: [{ x: a.x + nx * off, y: a.y + ny * off }, { x: b.x + nx * off, y: b.y + ny * off }], cls: rooms.get(r.id) ? 'all-route' : 'all-route all-route-est', color: color.get(r.id) })
		})
	}
	return { prims, rooms: all.map((r) => ({ ...r, color: color.get(r.id)! })) }
}

/** The OTHER pane's work plane, drawn here: a depth line in plan, a height line in an elevation. */
export function workPlaneOf(spec: ViewSpec, other: ViewSpec, prims: Prim[], depth: number, z: number, band?: { front: number; back: number }): Prim[] {
	const b = unionBounds(prims.map(primBounds))
	if (!b) return []
	if (spec.kind === 'plan' && other.kind === 'elevation') {
		const f = spaceOf(other).frame!, L = Math.hypot(b.x1 - b.x0, b.y1 - b.y0)
		const at = (d: number, cls: string): Prim => {
			const c = { x: f.o.x + f.n.x * d, y: f.o.y + f.n.y * d }
			return { k: 'line', pts: [{ x: c.x - f.t.x * L, y: c.y - f.t.y * L }, { x: c.x + f.t.x * L, y: c.y + f.t.y * L }], cls }
		}
		// the elevation's depth band (UX14): its near and far edges either side of the work plane
		return [at(depth, 'workplane'), ...(band ? [at(depth + band.front, 'band-edge'), at(depth - band.back, 'band-edge')] : [])]
	}
	if (spec.kind === 'elevation' && other.kind === 'plan') return [{ k: 'line', pts: [{ x: b.x0, y: -z }, { x: b.x1, y: -z }], cls: 'workplane' }]
	return []
}

/** The work plane's GRIP (User 2026-10-10: make it movable): where its line starts by the drawing, and what dragging
 *  it sets — the elevation's work depth (in the plan) or the plan's Z (in the elevation). A grip, not the whole line:
 *  at Z 0 the line lies on the floor line, where most things sit. Null = no line here. */
export function workPlaneGrip(spec: ViewSpec, other: ViewSpec, prims: Prim[], depth: number, z: number): { at: Pt; what: 'depth' | 'z' } | null {
	const b = unionBounds(prims.map(primBounds))
	if (!b) return null
	if (spec.kind === 'plan' && other.kind === 'elevation') {
		const f = spaceOf(other).frame!, c = { x: f.o.x + f.n.x * depth, y: f.o.y + f.n.y * depth }
		const s = Math.min(...[[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]].map(([x, y]) => (x - c.x) * f.t.x + (y - c.y) * f.t.y))
		return { at: { x: c.x + f.t.x * s, y: c.y + f.t.y * s }, what: 'depth' }
	}
	if (spec.kind === 'elevation' && other.kind === 'plan') return { at: { x: b.x0, y: -z }, what: 'z' }
	return null
}

/** The value the work-plane grip dragged to `p` gives: the depth along the elevation's view direction (plan), or the
 *  height (elevation). */
export function workPlaneAt(spec: ViewSpec, other: ViewSpec, p: Pt): number | null {
	if (spec.kind === 'plan' && other.kind === 'elevation') { const f = spaceOf(other).frame!; return (p.x - f.o.x) * f.n.x + (p.y - f.o.y) * f.n.y }
	if (spec.kind === 'elevation' && other.kind === 'plan') return -p.y
	return null
}

/** A sheet's picked VIEWPORT: its frame highlighted and (unlocked) corner grips a constant `g` mm (= 4 px) across. */
export function viewportHighlight(prims: Prim[], vpId: Id, locked: boolean, g: number): Prim[] {
	const frame = prims.find((p) => p.k === 'line' && p.sub === vpId && p.cls.startsWith('viewport'))
	if (!frame || frame.k !== 'line') return []
	const grips: Prim[] = locked ? [] : frame.pts.map((q) => ({ k: 'line', pts: [{ x: q.x - g, y: q.y - g }, { x: q.x + g, y: q.y - g }, { x: q.x + g, y: q.y + g }, { x: q.x - g, y: q.y + g }], closed: true, fill: true, cls: 'grip' }))
	return [{ ...frame, cls: 'viewport sel', src: undefined }, ...grips]
}

/** What a view shows that can be picked (Ctrl+A, Select similar): devices in a rack row, notes on a sheet (not the
 *  sheet), else anything but a sheet. */
export function pickableIn(ix: ProjectIndex, prims: Prim[], kind: string): Entity[] {
	const out = new Map<string, Entity>()
	for (const p of prims) {
		const e = p.src && p.k !== 'image' ? ix.get(p.src) : undefined
		if (e && (kind === 'row' ? e.type === 'device' : kind === 'sheet' ? e.type === 'shape' : e.type !== 'sheet')) out.set(e.id, e)
	}
	return [...out.values()]
}
