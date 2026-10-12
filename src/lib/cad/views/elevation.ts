// The ELEVATION generator (ADR 0004): a level's data projected onto a named frame, drawn in view mm (x = u, y = −z).
// 2.5D: everything is an upright extrusion or a 3D polyline, so each item is a rectangle / band in (u, z) with a
// depth. Items are painted far → near with opaque fills, so nearer things hide what's behind (exact for upright boxes
// seen square-on; the interval method of ADR 0004 replaces this when sections need precise hidden lines).
import type { Id, Pt, Pt3, Level, Rack, Outlet } from '../domain/types'
import type { ProjectIndex } from '../domain/project'
import type { Shape } from '../domain/shapes'
import { isFlat, isVertical, outlineOf, ownFrame, sameFrame, arcPoints, arcThrough } from '../domain/shapes'
import { passesThrough, shapePrims, dimLine, ownStyle, lineEnds } from './plan'
import { openingCorners, wallSpan } from '../domain/openings'
import { RACK_DEVICE_W, roomFloor } from '../domain/devices'
import { rotate, rackFrontNormal, unproject } from '../domain/conventions'
import type { ViewSpace } from './space'
import type { Prim } from './display'
import { insertAttrs, frontOf, type Block } from '../domain/blocks'
import { blockPrims } from './blocks'
import { pictureRef } from '../domain/issue'

export const RU_MM = 44.45
const LABEL = 1.8, DATUM_LABEL = 1.6   // paper mm
/** A faceplate at true size (a standard single-gang plate), so it doesn't grow on smaller-scale drawings. */
const FACEPLATE_MM = 86

export interface Item { depth: number; prims: Prim[] }

/** `range` (a section): only what lies between depth `far` and `near` (view depth: larger = nearer), clipped to u0..u1
 *  across; `extra` = more items (a section's cut walls), drawn in depth order with the rest. */
/** `band` (UX review UX14, a test for Dave): an elevation's depth band — what's nearer than `near` is left out (as a
 *  section cuts it away), what's beyond `far` is drawn faded, so the near things read. */
export function elevationDisplayList(ix: ProjectIndex, levelId: Id, sp: ViewSpace, o: { scale: number; range?: { near: number; far: number; u0: number; u1: number }; band?: { near: number; far: number }; extra?: Item[]; blocks?: (id: Id) => Block | undefined }): Prim[] {
	const k = o.scale, level = ix.get(levelId) as Level | undefined
	const items: Item[] = []
	const rect = (u0: number, u1: number, z0: number, z1: number, cls: string, src?: Id, fill = true): Prim =>
		({ k: 'line', pts: [{ x: u0, y: -z0 }, { x: u1, y: -z0 }, { x: u1, y: -z1 }, { x: u0, y: -z1 }], closed: true, fill, cls, ...(src ? { src } : {}) })
	const uSpan = (pts: Pt3[]) => { const us = pts.map((p) => sp.fromWorld(p).x); return [Math.min(...us), Math.max(...us)] as const }

	for (const r of ix.racks) if (r.levelId === levelId && r.at) items.push(rackItem(ix, r, sp, rect, uSpan, k))
	// only outlets placed in an elevation / section (on a wall): one placed on a plan is a plan symbol (Dave 2026-10-10)
	for (const ot of ix.outlets) if (ot.levelId === levelId && ot.at && ot.inElevations) items.push(outletItem(ot, level, sp, rect, k))
	// Path nodes on another level (a riser's far end) are lifted by the difference in level heights.
	const elev = (id?: Id) => { const l = id ? ix.get(id) : undefined; return l?.type === 'level' ? l.elevationMm : 0 }
	const here = elev(levelId)
	const zOf = (n: { z: number; levelId?: Id }, s: Shape) => n.z + elev(n.levelId ?? s.levelId) - here
	// Shapes on this level, plus risers that END here or pass THROUGH it from another level. Anything reaching another
	// level is cut to this floor's height (slab underside → top of the plenum), so a 30-floor riser is one storey here.
	const h = level?.heights, floor = { y0: -((h?.clearHeightMm ?? 2600) + (h?.plenumMm ?? 700)), y1: (h?.raisedFloorMm ?? 300) + (h?.slabMm ?? 200) }
	for (const s of ix.shapes) {
		// a note, line or flat shape drawn on ONE elevation / section shows only there (not mirrored into the others)
		const own = ownFrame(s)
		if (own && !(sp.frame && sameFrame(own, sp.frame))) continue
		// a note or dimension drawn ON an elevation's plane: put into this view's coordinates, drawn as on a plan
		if (s.plane?.kind === 'vertical' && s.geom.kind !== 'path' && !outlineOf(s.geom)) {
			if (s.levelId !== levelId) continue
			const plane = s.plane, to = (q: Pt) => sp.fromWorld(unproject(plane.frame, { u: q.x, v: q.y }, plane.depth))
			const g = viewGeom(s.geom, to)
			if (g) items.push({ depth: sp.depthOf(unproject(plane.frame, { u: 0, v: 0 }, plane.depth)) + 1 + (s.order ?? 0) * 1e-3, prims: shapePrims({ ...s, geom: g }, k) })   // draw order among them
			continue
		}
		// a block insert placed in an elevation (a wall faceplate): its symbol at its height, facing the viewer; one
		// placed on the plan is a plan symbol, not shown here
		if (s.geom.kind === 'insert') {
			if (s.levelId !== levelId || !s.geom.inElevations) continue
			const g = s.geom, b = o.blocks?.(g.blockId), p = { x: g.at.x, y: g.at.y, z: g.z ?? 0 }, v = sp.fromWorld(p)
			if (b) items.push({ depth: sp.depthOf(p) + 1, prims: blockPrims(frontOf(b), { at: v, scale: g.scale }, k, insertAttrs(b, g.attrs, g.hidden), s.id, 'shape') })   // its front drawing, if it has one
			continue
		}
		if (planDrawing(s)) continue
		const reaches =s.geom.kind === 'path' && s.geom.nodes.some((n) => (n.levelId ?? s.levelId) !== levelId)
		if (s.levelId !== levelId && !(s.geom.kind === 'path' && s.geom.nodes.some((n) => n.levelId === levelId)) && !passesThrough(ix, s, levelId)) continue
		const its = shapeItems(s, sp, rect, uSpan, zOf, wallSpan(ix, s), k)
		// ±1 km across: wide enough for any building. (±1e9 broke Chrome's clipping in some view directions — the
		// riser vanished from the front / right elevations.)
		items.push(...(reaches ? its.map((it) => ({ ...it, prims: it.prims.map((p) => ({ ...p, clip: { x0: -1e6, x1: 1e6, ...floor } })) })) : its))
	}

	let kept = items
	if (o.range) {
		const r = o.range
		const across = (p: Prim) => (p.k === 'line' ? p.pts.map((q) => q.x) : p.k === 'circle' ? [p.c.x - p.r, p.c.x + p.r] : p.k === 'text' ? [p.at.x] : [p.x, p.x + p.w])
		kept = items.filter((it) => {
			if (it.depth > r.near || it.depth < r.far) return false
			const xs = it.prims.flatMap(across)
			return xs.length > 0 && Math.max(...xs) >= r.u0 && Math.min(...xs) <= r.u1
		}).map((it) => ({ ...it, prims: it.prims.map((p) => ({ ...p, clip: { x0: Math.max(r.u0, p.clip?.x0 ?? r.u0), x1: Math.min(r.u1, p.clip?.x1 ?? r.u1), y0: p.clip?.y0 ?? -1e6, y1: p.clip?.y1 ?? 1e6 } })) }))
	}
	if (o.band) {
		const b = o.band
		kept = kept.filter((it) => it.depth <= b.near).map((it) => (it.depth < b.far ? { ...it, prims: it.prims.map((p) => (p.k === 'image' ? p : { ...p, cls: `${p.cls} far` })) } : it))
	}
	kept = [...kept, ...(o.extra ?? [])]
	kept.sort((a, b) => a.depth - b.depth)   // far first, near last (larger depth = nearer)
	const out = kept.flatMap((i) => i.prims)
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
	const h = r.heightMm ?? r.heightU * RU_MM + 150, f = roomFloor(ix, r.spaceId)   // it stands on its room's floor
	const prims: Prim[] = [rect(u0, u1, f, f + h, 'rack', r.id)]
	const facing = sp.frame ? rackFrontNormal(r).x * sp.frame.n.x + rackFrontNormal(r).y * sp.frame.n.y : 0
	const face = facing > 0.5 ? 'front' : facing < -0.5 ? 'rear' : null
	if (face) {
		const base = (h - r.heightU * RU_MM) / 2 + f, mid = (u0 + u1) / 2
		for (const d of ix.devicesIn(r.id)) {
			if (d.kind === 'pdu' || d.face === 'none' || (d.face !== 'both' && d.face !== face)) continue
			const hw = Math.min(r.widthMm, d.widthMm ?? RACK_DEVICE_W) / 2, z0 = base + (d.u - 1) * RU_MM
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
	const u = sp.fromWorld({ ...ot.at!, z }).x, w = FACEPLATE_MM, h = FACEPLATE_MM
	return {
		depth: sp.depthOf({ ...ot.at!, z }),
		prims: [rect(u - w / 2, u + w / 2, z, z + h, `outlet outlet-${ot.tier}`, ot.id), { k: 'text', at: { x: u, y: -(z + h) - LABEL * k * 0.3 }, text: ot.label, size: LABEL * k, anchor: 'middle', cls: 'label', src: ot.id }],
	}
}

/** A note's / dimension's geometry put into view coordinates by `to` (from its plane's (u, z)) — a dimension's offset
 *  measured again there, so its line stays where it was and its text stays above it. Null = not a note. */
function viewGeom(g: Shape['geom'], to: (p: Pt) => Pt): Shape['geom'] | null {
	switch (g.kind) {
		case 'text': return { ...g, at: to(g.at) }
		case 'leader': case 'cloud': return { ...g, pts: g.pts.map(to) }
		// an arc: through its three points as seen here (the view's y-down turns it the other way round)
		case 'arc': { const [a, m, b] = arcPoints(g).map(to); return arcThrough(a, m, b) }
		case 'dimension': {
			const a = to(g.a), b = to(g.b), a2 = to(dimLine(g).a2), t = g.textAt ? { textAt: to(g.textAt) } : {}
			if (g.mode === 'horizontal') return { ...g, a, b, ...t, offset: a2.y - a.y }
			if (g.mode === 'vertical') return { ...g, a, b, ...t, offset: a2.x - a.x }
			const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
			return { ...g, a, b, ...t, offset: ((a2.x - a.x) * -(b.y - a.y) + (a2.y - a.y) * (b.x - a.x)) / L }
		}
		default: return null
	}
}

/** Drawing on a plan (Dave 2026-10-10: not shown in elevations): a flat line, box, circle or polygon — no height, no
 *  role, not on an elevation's plane. A line rising (its nodes at different heights or levels) is a 3D line: shown. */
function planDrawing(s: Shape): boolean {
	if (s.role || s.plane?.kind === 'vertical' || !isFlat(s)) return false
	const g = s.geom
	if (g.kind !== 'path') return true
	return g.nodes.every((n) => n.z === g.nodes[0].z && (n.levelId ?? s.levelId) === s.levelId)
}

/** A plain line's end marks, on its projected nodes (`k` = drawing mm per paper mm). */
function endItems(s: Shape, g: Extract<Shape['geom'], { kind: 'path' }>, nodes: Map<Id, Pt3 & { id: Id }>, sp: ViewSpace, k: number): Item[] {
	const flat = { ...g, nodes: g.nodes.map((n) => { const w = nodes.get(n.id)!; return { ...n, ...sp.fromWorld(w), z: 0 } }) }
	const n0 = nodes.get(g.nodes[0]?.id ?? '')
	return [{ depth: n0 ? sp.depthOf(n0) : 0, prims: ownStyle(s, lineEnds(flat, s.style!.ends!, k, s.id)) }]
}

function shapeItems(s: Shape, sp: ViewSpace, rect: RectFn, uSpan: SpanFn, zOf: (n: { z: number; levelId?: Id }, s: Shape) => number, span?: { z0: number; z1: number }, k = 100): Item[] {
	const g = s.geom
	if (g.kind === 'path') {
		const nodes = new Map(g.nodes.map((n) => [n.id, { ...n, z: zOf(n, s) }]))
		return g.segs.flatMap((sg): Item[] => {
			const a = nodes.get(sg.a), b = nodes.get(sg.b)
			if (!a || !b) return []
			const pa = sp.fromWorld(a), pb = sp.fromWorld(b), depth = (sp.depthOf(a) + sp.depthOf(b)) / 2
			const sec = sg.section ?? s.section
			if (s.role?.kind === 'wall' && sec) {
				// the wall face as solid pieces AROUND its openings (beside, below, above each), so what's behind shows
				// through the holes; each hole outlined
				const lift = zOf({ z: 0 }, s)   // the wall's floor relative to this view's level
				const holes = s.role.openings.filter((o) => o.segId === sg.id).map((o) => {
					const c = openingCorners(s, o).map((p) => sp.fromWorld({ ...p, z: p.z + lift }))
					const xs = c.map((q) => q.x)
					return { u0: Math.min(...xs), u1: Math.max(...xs), y0: Math.min(...c.map((q) => q.y)), y1: Math.max(...c.map((q) => q.y)), c }
				}).sort((x, y) => x.u0 - y.u0)
				// a slab-to-slab wall spans its level's slab → slab above, whatever its own height says
				const ua = Math.min(pa.x, pb.x), ub = Math.max(pa.x, pb.x)
				const top = span ? -(span.z1 + lift) : Math.min(pa.y, pb.y) - sec.h, bot = span ? -(span.z0 + lift) : Math.max(pa.y, pb.y)
				const box = (x0: number, x1: number, y0: number, y1: number): Prim => ({ k: 'line', pts: [{ x: x0, y: y1 }, { x: x1, y: y1 }, { x: x1, y: y0 }, { x: x0, y: y0 }], closed: true, fill: true, cls: 'wall', src: s.id })
				if (!holes.length) return [{ depth, prims: [span ? box(ua, ub, top, bot) : { k: 'line', pts: [pa, pb, { x: pb.x, y: pb.y - sec.h }, { x: pa.x, y: pa.y - sec.h }], closed: true, fill: true, cls: 'wall', src: s.id }] }]
				const face: Prim[] = []
				let from = ua
				for (const h of holes) {
					if (h.u0 > from) face.push(box(from, h.u0, top, bot))
					if (h.y1 < bot) face.push(box(h.u0, h.u1, h.y1, bot))   // below the hole
					if (h.y0 > top) face.push(box(h.u0, h.u1, top, h.y0))   // above it
					from = Math.max(from, h.u1)
				}
				if (from < ub) face.push(box(from, ub, top, bot))
				return [{ depth, prims: [...face, ...holes.map((h): Prim => ({ k: 'line', pts: h.c, closed: true, cls: 'opening', src: s.id }))] }]
			}
			if (s.role?.kind === 'containment' && sec) {
				const lift = sec.anchor === 'centre' || sec.round ? 0 : sec.h / 2
				const cls = s.role.tier === 'high' ? 'run run-high' : 'run'
				return [{ depth, prims: [{ k: 'line', pts: [{ x: pa.x, y: pa.y - lift }, { x: pb.x, y: pb.y - lift }], w: isVertical(a, b) ? sec.w : sec.h, cls, src: s.id }] }]
			}
			return [{ depth, prims: ownStyle(s, [{ k: 'line', pts: [pa, pb], cls: 'shape', src: s.id }]) }]
		}).concat(!s.role && s.style?.ends ? endItems(s, g, nodes, sp, k) : [])
	}
	// a region drawn ON an elevation's plane (the Shape tool there): its (u, z) outline put back in the model, seen here
	if (s.plane?.kind === 'vertical') {
		const plane = s.plane, out = outlineOf(g)
		if (!out?.length) return []
		const world = out.map((q) => unproject(plane.frame, { u: q.x, v: q.y }, plane.depth))
		const mid = world.reduce((m, p) => ({ x: m.x + p.x / world.length, y: m.y + p.y / world.length, z: m.z + p.z / world.length }), { x: 0, y: 0, z: 0 })
		const pts = world.map((p) => sp.fromWorld(p))
		// an image (backlog "Images in elevations"): the picture fitted in its box as seen here, the unseen frame on top
		if (g.kind === 'image') {
			const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y), x = Math.min(...xs), y = Math.min(...ys)
			return [{ depth: sp.depthOf(mid), prims: [{ k: 'image', url: pictureRef(g.fileId, g.page ?? 1), x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, fit: 'centre', src: s.id },
				{ k: 'line', pts, closed: true, fill: true, cls: 'image-frame', src: s.id }] }]
		}
		const fill: Prim[] = s.style?.fill ? [{ k: 'line', pts, closed: true, fill: true, cls: 'shape-fill', color: s.style.fill, src: s.id }] : []
		return [{ depth: sp.depthOf(mid), prims: [...fill, ...ownStyle(s, [{ k: 'line', pts, closed: true, cls: 'shape', src: s.id }])] }]
	}
	if ((g.kind === 'rect' || g.kind === 'circle' || g.kind === 'ellipse' || g.kind === 'polygon') && (!s.plane || s.plane.kind === 'plan')) {
		const z = s.plane?.z ?? 0, ext = s.extent ?? 0
		const pts: Pt3[] = g.kind === 'rect' ? footprint(g.centre, g.size.x, g.size.y, g.rot, z)
			: g.kind === 'circle' ? [{ x: g.centre.x - g.r, y: g.centre.y, z }, { x: g.centre.x + g.r, y: g.centre.y, z }, { x: g.centre.x, y: g.centre.y - g.r, z }, { x: g.centre.x, y: g.centre.y + g.r, z }]
			: (outlineOf(g) ?? []).map((p) => ({ ...p, z }))
		const [u0, u1] = uSpan(pts)
		const c = pts.reduce((m, p) => ({ x: m.x + p.x / pts.length, y: m.y + p.y / pts.length, z }), { x: 0, y: 0, z })
		return [{ depth: sp.depthOf(c), prims: ownStyle(s, [ext ? rect(u0, u1, z, z + ext, 'shape', s.id) : { k: 'line', pts: [{ x: u0, y: -z }, { x: u1, y: -z }], cls: 'shape', src: s.id }]) }]
	}
	return []   // plan notes and dimensions don't show in elevations
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
