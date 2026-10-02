// The ELEVATION generator (ADR 0004): a level's data projected onto a named frame, drawn in view mm (x = u, y = −z).
// 2.5D: everything is an upright extrusion or a 3D polyline, so each item is a rectangle / band in (u, z) with a
// depth. Items are painted far → near with opaque fills, so nearer things hide what's behind (exact for upright boxes
// seen square-on; the interval method of ADR 0004 replaces this when sections need precise hidden lines).
import type { Id, Pt, Pt3, Level, Rack, Outlet } from '../domain/types'
import type { ProjectIndex } from '../domain/project'
import type { Shape } from '../domain/shapes'
import { isVertical } from '../domain/shapes'
import { rotate, rackFrontNormal } from '../domain/conventions'
import type { ViewSpace } from './space'
import type { Prim } from './display'

export const RU_MM = 44.45
const OUTLET_W = 1.2, OUTLET_H = 0.8, LABEL = 1.8, DATUM_LABEL = 1.6   // paper mm

interface Item { depth: number; prims: Prim[] }

export function elevationDisplayList(ix: ProjectIndex, levelId: Id, sp: ViewSpace, o: { scale: number }): Prim[] {
	const k = o.scale, level = ix.get(levelId) as Level | undefined
	const items: Item[] = []
	const rect = (u0: number, u1: number, z0: number, z1: number, cls: string, src?: Id, fill = true): Prim =>
		({ k: 'line', pts: [{ x: u0, y: -z0 }, { x: u1, y: -z0 }, { x: u1, y: -z1 }, { x: u0, y: -z1 }], closed: true, fill, cls, ...(src ? { src } : {}) })
	const uSpan = (pts: Pt3[]) => { const us = pts.map((p) => sp.fromWorld(p).x); return [Math.min(...us), Math.max(...us)] as const }

	for (const r of ix.racks) if (r.levelId === levelId && r.at) items.push(rackItem(ix, r, sp, rect, uSpan, k))
	for (const ot of ix.outlets) if (ot.levelId === levelId && ot.at) items.push(outletItem(ot, level, sp, rect, k))
	// Path nodes on another level (a riser's far end) are lifted by the difference in level heights.
	const elev = (id?: Id) => { const l = id ? ix.get(id) : undefined; return l?.type === 'level' ? l.elevationMm : 0 }
	const here = elev(levelId)
	const zOf = (n: { z: number; levelId?: Id }, s: Shape) => n.z + elev(n.levelId ?? s.levelId) - here
	for (const s of ix.shapes) if (s.levelId === levelId) items.push(...shapeItems(s, sp, rect, uSpan, zOf))

	items.sort((a, b) => a.depth - b.depth)   // far first, near last (larger depth = nearer)
	const out = items.flatMap((i) => i.prims)
	return [...datums(out, level, k), ...out]
}

type RectFn = (u0: number, u1: number, z0: number, z1: number, cls: string, src?: Id, fill?: boolean) => Prim
type SpanFn = (pts: Pt3[]) => readonly [number, number]

function footprint(at: Pt, w: number, d: number, rot = 0, z = 0): Pt3[] {
	return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, y]) => { const q = rotate({ x, y }, rot); return { x: at.x + q.x, y: at.y + q.y, z } })
}

/** A rack: its body, and — when its front or rear faces the viewer — the devices mounted on that face at their U. */
function rackItem(ix: ProjectIndex, r: Rack, sp: ViewSpace, rect: RectFn, uSpan: SpanFn, k: number): Item {
	const [u0, u1] = uSpan(footprint(r.at!, r.widthMm, r.depthMm, r.rot))
	const h = r.heightMm ?? r.heightU * RU_MM + 150
	const prims: Prim[] = [rect(u0, u1, 0, h, 'rack', r.id)]
	const facing = sp.frame ? rackFrontNormal(r).x * sp.frame.n.x + rackFrontNormal(r).y * sp.frame.n.y : 0
	const face = facing > 0.5 ? 'front' : facing < -0.5 ? 'rear' : null
	if (face) {
		const base = (h - r.heightU * RU_MM) / 2, mid = (u0 + u1) / 2
		for (const d of ix.devicesIn(r.id)) {
			if (d.kind === 'pdu' || d.face === 'none' || (d.face !== 'both' && d.face !== face)) continue
			const hw = Math.min(r.widthMm, d.widthMm ?? 482.6) / 2, z0 = base + (d.u - 1) * RU_MM
			prims.push(rect(mid - hw, mid + hw, z0, z0 + d.heightU * RU_MM, `device device-${d.kind}`, d.id))
			if (d.heightU * RU_MM * 0.8 >= LABEL * k * 0.6) prims.push({ k: 'text', at: { x: mid, y: -(z0 + d.heightU * RU_MM / 2) + LABEL * k * 0.35 }, text: d.name, size: Math.min(LABEL * k, d.heightU * RU_MM * 0.7), anchor: 'middle', cls: 'label', src: d.id })
		}
	}
	prims.push({ k: 'text', at: { x: (u0 + u1) / 2, y: -h - LABEL * k * 0.5 }, text: r.name, size: LABEL * k, anchor: 'middle', cls: 'label', src: r.id })
	return { depth: sp.depthOf({ ...r.at!, z: 0 }), prims }
}

/** An outlet: a faceplate at its height (low outlets on the floor unless a height is set; high ones at the ceiling). */
function outletItem(ot: Outlet, level: Level | undefined, sp: ViewSpace, rect: RectFn, k: number): Item {
	const z = ot.z ?? (ot.tier === 'high' ? level?.heights.clearHeightMm ?? 2700 : 0)
	const u = sp.fromWorld({ ...ot.at!, z }).x, w = OUTLET_W * k, h = OUTLET_H * k
	return {
		depth: sp.depthOf({ ...ot.at!, z }),
		prims: [rect(u - w / 2, u + w / 2, z, z + h, `outlet outlet-${ot.tier}`, ot.id), { k: 'text', at: { x: u, y: -(z + h) - LABEL * k * 0.3 }, text: ot.label, size: LABEL * k, anchor: 'middle', cls: 'label', src: ot.id }],
	}
}

function shapeItems(s: Shape, sp: ViewSpace, rect: RectFn, uSpan: SpanFn, zOf: (n: { z: number; levelId?: Id }, s: Shape) => number): Item[] {
	const g = s.geom
	if (g.kind === 'path') {
		const nodes = new Map(g.nodes.map((n) => [n.id, { ...n, z: zOf(n, s) }]))
		return g.segs.flatMap((sg): Item[] => {
			const a = nodes.get(sg.a), b = nodes.get(sg.b)
			if (!a || !b) return []
			const pa = sp.fromWorld(a), pb = sp.fromWorld(b), depth = (sp.depthOf(a) + sp.depthOf(b)) / 2
			const sec = sg.section ?? s.section
			if (s.role?.kind === 'wall' && sec) {
				return [{ depth, prims: [{ k: 'line', pts: [pa, pb, { x: pb.x, y: pb.y - sec.h }, { x: pa.x, y: pa.y - sec.h }], closed: true, fill: true, cls: 'wall', src: s.id }] }]
			}
			if (s.role?.kind === 'containment' && sec) {
				const lift = sec.anchor === 'centre' || sec.round ? 0 : sec.h / 2
				const cls = s.role.tier === 'high' ? 'run run-high' : 'run'
				return [{ depth, prims: [{ k: 'line', pts: [{ x: pa.x, y: pa.y - lift }, { x: pb.x, y: pb.y - lift }], w: isVertical(a, b) ? sec.w : sec.h, cls, src: s.id }] }]
			}
			return [{ depth, prims: [{ k: 'line', pts: [pa, pb], cls: 'shape', src: s.id }] }]
		})
	}
	if ((g.kind === 'rect' || g.kind === 'circle' || g.kind === 'polygon') && (!s.plane || s.plane.kind === 'plan')) {
		const z = s.plane?.z ?? 0, ext = s.extent ?? 0
		const pts: Pt3[] = g.kind === 'rect' ? footprint(g.centre, g.size.x, g.size.y, g.rot, z)
			: g.kind === 'circle' ? [{ x: g.centre.x - g.r, y: g.centre.y, z }, { x: g.centre.x + g.r, y: g.centre.y, z }, { x: g.centre.x, y: g.centre.y - g.r, z }, { x: g.centre.x, y: g.centre.y + g.r, z }]
			: g.pts.map((p) => ({ ...p, z }))
		const [u0, u1] = uSpan(pts)
		const c = pts.reduce((m, p) => ({ x: m.x + p.x / pts.length, y: m.y + p.y / pts.length, z }), { x: 0, y: 0, z })
		return [{ depth: sp.depthOf(c), prims: [ext ? rect(u0, u1, z, z + ext, 'shape', s.id) : { k: 'line', pts: [{ x: u0, y: -z }, { x: u1, y: -z }], cls: 'shape', src: s.id }] }]
	}
	return []   // plan text and vertical-plane regions don't show in elevations yet
}

/** Level datum lines across the drawing: slab, FFL, ceiling, slab above — with their heights. */
function datums(prims: Prim[], level: Level | undefined, k: number): Prim[] {
	if (!level) return []
	const xs = prims.flatMap((p) => (p.k === 'line' ? p.pts.map((q) => q.x) : p.k === 'text' ? [p.at.x] : []))
	const x0 = (xs.length ? Math.min(...xs) : -5000) - 1500, x1 = (xs.length ? Math.max(...xs) : 5000) + 1500
	const h = level.heights
	const lines: [number, string][] = [[-h.raisedFloorMm, 'SSL'], [0, 'FFL ±0'], [h.clearHeightMm, `CLG +${h.clearHeightMm}`], [h.clearHeightMm + h.plenumMm, 'SSL above']]
	return lines.flatMap(([z, label]): Prim[] => [
		{ k: 'line', pts: [{ x: x0, y: -z }, { x: x1, y: -z }], cls: z === 0 ? 'datum datum-ffl' : 'datum' },
		{ k: 'text', at: { x: x0, y: -z - DATUM_LABEL * k * 0.4 }, text: label, size: DATUM_LABEL * k, cls: 'datum-label' },
	])
}
