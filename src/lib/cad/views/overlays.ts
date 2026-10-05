// OVERLAYS drawn over a view (split out of ui/ViewCanvas.svelte): the selected ports of a device, the circuit of a
// selected cord / port, the fill bands of runs, the routes of the selected outlets / links / ports, and the other
// pane's work plane. Pure: display-list in, display-list out.
import type { Prim } from './display'
import type { ProjectIndex } from '../domain/project'
import type { Id } from '../domain/types'
import type { PortSel } from '../editor/tools'
import type { Route } from '../domain/routing'
import type { ViewSpec } from './space'
import { primBounds, unionBounds } from './display'
import { spaceOf } from './space'
import { traceCircuit } from '../domain/cords'
import { fillTone } from '../domain/fill'

/** The selected ports (rack rows), drawn over their cells. */
export function portCells(prims: Prim[], s: PortSel | null): Prim[] {
	if (!s) return []
	const want = new Set(s.ports.map(String))
	return prims.flatMap((p) => (p.k === 'line' && p.src === s.on && p.sub && want.has(p.sub) && p.cls.startsWith('port') ? [{ ...p, cls: 'port-sel', src: undefined }] : []))
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
	return prims.flatMap((p) => p.k !== 'line' ? [] :
		p.src && cords.has(p.src) ? [{ ...p, cls: 'trace-cord', src: undefined, color: undefined }] :   // no inline colour: the trace look wins
		p.src && p.sub && p.cls.startsWith('port') && ports.has(`${p.src}:${p.sub}`) ? [{ ...p, cls: 'trace-port', src: undefined }] : [])
}

/** Fill overlay (Phase 5.3, plan): each run segment with cables in it as a band in its fill tone, with its %. */
export function fillBands(ix: ProjectIndex, fills: Iterable<{ shape: Id; seg: Id; pct: number }> | Map<string, { shape: Id; seg: Id; pct: number }>, levelId: Id, plotScale: number): Prim[] {
	const out: Prim[] = []
	for (const f of fills instanceof Map ? fills.values() : fills) {
		const s = ix.get(f.shape)
		if (s?.type !== 'shape' || s.geom.kind !== 'path') continue
		const g = s.geom, sg = g.segs.find((x) => x.id === f.seg), a = g.nodes.find((n) => n.id === sg?.a), b = g.nodes.find((n) => n.id === sg?.b)
		if (!a || !b || (a.levelId ?? s.levelId) !== levelId || Math.hypot(b.x - a.x, b.y - a.y) < 0.5) continue
		const tone = fillTone(f.pct), w = (sg?.section ?? s.section)?.w ?? 100
		out.push({ k: 'line', pts: [a, b], w: Math.max(w, 150), cls: `fill-band fill-${tone}` })
		out.push({ k: 'text', at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, text: Number.isFinite(f.pct) ? `${Math.round(f.pct)}%` : 'no size', size: 2.2 * plotScale, anchor: 'middle', cls: `fill-label fill-${tone}` })
	}
	return out
}

/** The cable routes (Phase 5) of the selected outlets / links / panel ports, drawn over the runs they use (plan). */
export function routesOf(ix: ProjectIndex, routes: Map<Id, Route>, levelId: Id, selection: Id[], ps: PortSel | null): Prim[] {
	const links = new Set<string>()
	for (const id of selection) {
		const e = ix.get(id)
		if (e?.type === 'outlet') for (const p of e.ports) { const l = ix.linkAt({ on: e.id, port: p.port }); if (l) links.add(l.id) }
		else if (e?.type === 'link') links.add(e.id)
	}
	if (ps) for (const n of ps.ports) { const l = ix.linkAt({ on: ps.on, port: n }); if (l) links.add(l.id) }
	const out: Prim[] = []
	for (const id of links) for (const r of routes.get(id)?.segs ?? []) {
		const s = ix.get(r.shape)
		if (s?.type !== 'shape' || s.geom.kind !== 'path') continue
		const g = s.geom, sg = g.segs.find((x) => x.id === r.seg), a = g.nodes.find((n) => n.id === sg?.a), b = g.nodes.find((n) => n.id === sg?.b)
		if (!a || !b || ![a.levelId ?? s.levelId, b.levelId ?? s.levelId].includes(levelId)) continue
		out.push(Math.hypot(b.x - a.x, b.y - a.y) < 0.5 ? { k: 'circle', c: a, r: 150, cls: 'trace-route' } : { k: 'line', pts: [a, b], cls: 'trace-route' })
	}
	return out
}

/** The OTHER pane's work plane, drawn here: a depth line in plan, a height line in an elevation. */
export function workPlaneOf(spec: ViewSpec, other: ViewSpec, prims: Prim[], depth: number, z: number): Prim[] {
	const b = unionBounds(prims.map(primBounds))
	if (!b) return []
	if (spec.kind === 'plan' && other.kind === 'elevation') {
		const f = spaceOf(other).frame!, L = Math.hypot(b.x1 - b.x0, b.y1 - b.y0)
		const c = { x: f.o.x + f.n.x * depth, y: f.o.y + f.n.y * depth }
		return [{ k: 'line', pts: [{ x: c.x - f.t.x * L, y: c.y - f.t.y * L }, { x: c.x + f.t.x * L, y: c.y + f.t.y * L }], cls: 'workplane' }]
	}
	if (spec.kind === 'elevation' && other.kind === 'plan') return [{ k: 'line', pts: [{ x: b.x0, y: -z }, { x: b.x1, y: -z }], cls: 'workplane' }]
	return []
}
