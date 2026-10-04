// The PLAN generator: one level's data → a display list (plan mm, y down). Pure: underlay placement and the drawing
// scale come in as inputs. Draw order: underlays, shapes / walls, containment, racks, outlets, labels on top.
import type { Id, Pt, Outlet, Rack, Underlay } from '../domain/types'
import type { Shape } from '../domain/shapes'
import type { ProjectIndex } from '../domain/project'
import { isVertical } from '../domain/shapes'
import { planOpenings } from '../domain/openings'
import { sectionMarks, sectionsOn } from './section'
import { rotate } from '../domain/conventions'
import type { Bounds, Prim } from './display'
import { blockPrims } from './blocks'
import { defaultOutletBlock, outletAttrs, insertAttrs, type Block } from '../domain/blocks'

export interface PlanOpts {
	/** 1:N — text and symbols are drawn at a constant paper size, so they scale with N. */
	scale: number
	/** Where an underlay sits (from its file's calibration); undefined = not ready / not calibrated. */
	underlay?: (u: Underlay) => { url: string; x: number; y: number; w: number; h: number; clip?: Bounds } | undefined
	/** The block library (built-ins + global). Without it outlets draw as plain circles. */
	blocks?: (id: Id) => Block | undefined
}

/** Paper sizes (mm) of plan symbols. */
const OUTLET_R = 1.5, LABEL = 1.8, RACK_LABEL = 2.2, RISER_LABEL = 1.6

export function planDisplayList(ix: ProjectIndex, levelId: Id, o: PlanOpts): Prim[] {
	const out: Prim[] = []
	const k = o.scale

	for (const u of ix.byId.values()) {
		if (u.type !== 'underlay' || u.levelId !== levelId) continue
		const pl = o.underlay?.(u)
		if (!pl) continue
		// a level can have several floorplans (zones, Dave: 33F = 3303 + 3307); `origin` moves one off the others
		const dx = u.origin?.x ?? 0, dy = u.origin?.y ?? 0, c = pl.clip
		out.push({ k: 'image', ...pl, x: pl.x + dx, y: pl.y + dy, ...(c ? { clip: { x0: c.x0 + dx, y0: c.y0 + dy, x1: c.x1 + dx, y1: c.y1 + dy } } : {}), opacity: u.opacity ?? 0.6, src: u.id })
	}
	const shapes = ix.shapes.filter((s) => s.levelId === levelId || (s.geom.kind === 'path' && s.geom.nodes.some((n) => n.levelId === levelId)) || passesThrough(ix, s, levelId))
	for (const s of shapes) if (s.role?.kind !== 'containment') out.push(...shapePrims(s, k, o.blocks))
	// Draw order follows height (2.5D): LOW runs (under-floor / at floor) go under racks and furniture; HIGH runs
	// (tier high, or wholly above the floor) and every RISER go on top — a riser often stands on or beside a rack,
	// and a rack's filled footprint would hide it.
	const over: Prim[] = []
	for (const s of shapes) {
		if (s.role?.kind !== 'containment' || s.geom.kind !== 'path') continue
		const high = s.role.tier === 'high' || s.geom.nodes.every((n) => n.z > 0)
		for (const p of runPrims(s, levelId, k, (id) => ix.nameOf(id))) (high || (p.k !== 'image' && p.cls.startsWith('riser')) ? over : out).push(p)
	}
	for (const r of ix.racks) if (r.levelId === levelId && r.at) out.push(...rackPrims(r, k))
	out.push(...over)
	for (const ot of ix.outlets) if (ot.levelId === levelId && ot.at) out.push(...outletPrims(ot, k, o.blocks))
	// section cut lines (Phase 6.2) on top
	for (const sec of sectionsOn(ix, levelId)) out.push(...sectionMarks(sec, k))
	return out
}

/** One drawn shape as prims; `k` = drawing mm per paper mm (1 on a sheet, the plot scale in a plan). */
export function shapePrims(s: Shape, k: number, blocks?: PlanOpts['blocks']): Prim[] {
	const g = s.geom, cls = s.role?.kind === 'wall' ? 'wall' : 'shape'
	switch (g.kind) {
		case 'insert': {
			const b = blocks?.(g.blockId)
			if (b) return blockPrims(b, { at: g.at, rot: g.rot, scale: g.scale }, k, insertAttrs(b, g.attrs), s.id, 'shape')
			const r = 2 * k   // a missing block: a marked box so it can still be found and fixed
			return [{ k: 'line', pts: [{ x: g.at.x - r, y: g.at.y - r }, { x: g.at.x + r, y: g.at.y - r }, { x: g.at.x + r, y: g.at.y + r }, { x: g.at.x - r, y: g.at.y + r }], closed: true, cls: 'missing', src: s.id }]
		}
		case 'path': {
			const nodes = new Map(g.nodes.map((n) => [n.id, n]))
			return g.segs.flatMap((sg): Prim[] => {
				const a = nodes.get(sg.a), b = nodes.get(sg.b)
				if (!a || !b) return []
				const w = s.section ? (sg.section ?? s.section).w : undefined
				// a wall with openings: solid pieces around the holes, jambs, door leaves + arcs (Phase 6.1)
				if (s.role?.kind === 'wall' && w && s.role.openings.some((o) => o.segId === sg.id)) {
					const op = planOpenings(s, sg.id, w)
					return [
						...op.pieces.map(([p, q]): Prim => ({ k: 'line', pts: [p, q], w, cls, src: s.id })),
						...op.jambs.map(([p, q]): Prim => ({ k: 'line', pts: [p, q], cls: 'opening', src: s.id })),
						...op.swings.map((pts): Prim => ({ k: 'line', pts, cls: 'opening opening-swing', src: s.id })),
						// the gap itself, invisible but pickable: a click selects that opening
						...op.holes.map((h): Prim => ({ k: 'line', pts: [h.a, h.b], w, cls: 'opening-pick', src: s.id, sub: h.id })),
					]
				}
				return [{ k: 'line', pts: [a, b], ...(w ? { w } : {}), cls, src: s.id }]
			})
		}
		case 'rect': {
			const hx = g.size.x / 2, hy = g.size.y / 2
			const pts = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map(([x, y]) => add(g.centre, rotate({ x, y }, g.rot ?? 0)))
			// a box / desk can show which side is its back, like racks (a thick line on its local −y edge)
			return [{ k: 'line', pts, closed: true, fill: !!s.extent, cls, src: s.id }, ...(s.backLine ? [{ k: 'line', pts: [pts[0], pts[1]], cls: 'rack-back', src: s.id } as Prim] : [])]
		}
		case 'circle': return [{ k: 'circle', c: g.centre, r: g.r, fill: !!s.extent, cls, src: s.id }]
		case 'polygon': return [{ k: 'line', pts: g.pts, closed: true, fill: !!s.extent, cls, src: s.id }]
		case 'text': return [{ k: 'text', at: g.at, text: g.text, size: g.sizeMm * k, rot: g.rot, cls: 'note', src: s.id }]
		case 'leader': return leaderPrims(s.id, g.pts, g.text, k)
		case 'cloud': return [{ k: 'line', pts: cloudPts(g.pts, (g.arcMm ?? 6) * k), closed: true, cls: 'cloud', src: s.id }]
		default: return []
	}
}

/** A riser that passes THROUGH a level (L33 down to L12 shows on L30 too): a vertical segment whose ends lie above
 *  and below the level's floor. Drawn once, it appears on every floor it crosses. */
export function passesThrough(ix: ProjectIndex, s: Shape, levelId: Id): boolean {
	if (s.geom.kind !== 'path' || s.role?.kind !== 'containment') return false
	const lv = ix.get(levelId), at = lv?.type === 'level' ? lv.elevationMm : null
	if (at == null) return false
	const elev = (id: Id | undefined) => { const l = ix.get(id); return l?.type === 'level' ? l.elevationMm : 0 }
	const nodes = new Map(s.geom.nodes.map((n) => [n.id, n]))
	return s.geom.segs.some((sg) => {
		const a = nodes.get(sg.a), b = nodes.get(sg.b)
		if (!a || !b || !isVertical(a, b)) return false
		const za = a.z + elev(a.levelId ?? s.levelId), zb = b.z + elev(b.levelId ?? s.levelId)
		return Math.min(za, zb) < at && at < Math.max(za, zb)
	})
}

/** Containment: horizontal segments as bands of their real width; vertical ones as a riser symbol + z range. */
function runPrims(s: Shape, levelId: Id, k: number, levelName: (id: Id) => string): Prim[] {
	if (s.geom.kind !== 'path' || s.role?.kind !== 'containment') return []
	const high = s.role.tier === 'high', cls = high ? 'run run-high' : 'run'
	const nodes = new Map(s.geom.nodes.map((n) => [n.id, n]))
	const w = s.section?.w ?? 50
	const out: Prim[] = []
	for (const sg of s.geom.segs) {
		const a = nodes.get(sg.a), b = nodes.get(sg.b)
		if (!a || !b) continue
		if (isVertical(a, b)) {
			const lo = Math.min(a.z, b.z), hi = Math.max(a.z, b.z)
			out.push(s.section?.round
				? { k: 'circle', c: a, r: w / 2, cls: 'riser', src: s.id }
				: { k: 'line', pts: square(a, w), closed: true, cls: 'riser', src: s.id })
			const la = a.levelId ?? s.levelId ?? levelId, lb = b.levelId ?? s.levelId ?? levelId
			const text = la !== lb ? `Riser ${levelName(la)} ↕ ${levelName(lb)}` : `↕ ${fmtZ(lo)} → ${fmtZ(hi)}`
			out.push({ k: 'text', at: { x: a.x + w, y: a.y }, text, size: RISER_LABEL * k, cls: 'riser-label', src: s.id })
		} else if ((a.levelId ?? s.levelId) === levelId) {
			out.push({ k: 'line', pts: [a, b], w, cls, src: s.id })
		}
	}
	if (s.label) {
		const first = s.geom.nodes[0]
		if (first) out.push({ k: 'text', at: { x: first.x, y: first.y - w }, text: s.label, size: LABEL * k, cls: 'label', src: s.id })
	}
	return out
}

/** A rack: footprint, an X, and a thick BACK line on its rear edge (local −y; the front is +y, ADR 0004 — Dave: a back
 *  line on the edge reads better than a front line outside it). */
function rackPrims(r: Rack, k: number): Prim[] {
	const at = r.at!, rot = r.rot ?? 0, hw = r.widthMm / 2, hd = r.depthMm / 2
	const p = (x: number, y: number) => add(at, rotate({ x, y }, rot))
	const corners = [p(-hw, -hd), p(hw, -hd), p(hw, hd), p(-hw, hd)]
	return [
		{ k: 'line', pts: corners, closed: true, fill: true, cls: 'rack', src: r.id },
		{ k: 'line', pts: [corners[0], corners[2]], cls: 'rack-x', src: r.id },
		{ k: 'line', pts: [corners[1], corners[3]], cls: 'rack-x', src: r.id },
		{ k: 'line', pts: [corners[0], corners[1]], cls: 'rack-back', src: r.id },
		{ k: 'text', at, text: r.name, size: RACK_LABEL * k, anchor: 'middle', cls: 'label', src: r.id },
		...rackDoorPrims(r, p, hw, hd),
	]
}

/** A cabinet's doors on the plan: each leaf drawn open at 90° from its hinge, with its swing arc back to the closed
 *  position — so a cramped aisle shows. Front = the rack's local +y; "left" = the left of someone facing that face. */
export function rackDoorPrims(r: Rack, p: (x: number, y: number) => Pt, hw: number, hd: number): Prim[] {
	const d = r.doors
	if (!d) return []
	const out: Prim[] = []
	for (const face of ['front', 'rear'] as const) {
		const kind = d[face]
		if (!kind) continue
		const s = face === 'front' ? 1 : -1, y = s * hd
		// facing the front you look along −y, so your left is −x; facing the rear, +x
		const left = face === 'front' ? -hw : hw
		const hingeX = (d.hinge ?? 'left') === 'left' ? left : -left
		const leaves = kind === 'split' ? [{ h: -hw, len: hw }, { h: hw, len: hw }] : [{ h: hingeX, len: 2 * hw }]
		for (const { h, len } of leaves) {
			const dir = h < 0 ? 1 : -1   // the closed leaf runs from the hinge across the face
			out.push({ k: 'line', pts: [p(h, y), p(h, y + s * len)], cls: 'rack-door', src: r.id })
			out.push({ k: 'line', pts: Array.from({ length: 13 }, (_, i) => { const a = ((i / 12) * Math.PI) / 2; return p(h + dir * len * Math.sin(a), y + s * len * Math.cos(a)) }), cls: 'rack-door', src: r.id })
		}
	}
	return out
}

/** An outlet: its block (its own, else the default for its usage / tier / mount) with {LABEL} filled in — or, with no
 *  block library, a circle (filled low, outlined high) and the label. */
function outletPrims(o: Outlet, k: number, blocks?: PlanOpts['blocks']): Prim[] {
	const b = blocks?.(o.blockId ?? defaultOutletBlock(o))
	if (b) return blockPrims(b, { at: o.at!, rot: o.rot }, k, outletAttrs(o), o.id, `outlet outlet-${o.tier}`)
	const r = OUTLET_R * k
	return [
		{ k: 'circle', c: o.at!, r, fill: o.tier === 'low', cls: `outlet outlet-${o.tier}`, src: o.id },
		{ k: 'text', at: { x: o.at!.x + r * 1.3, y: o.at!.y + r * 0.4 }, text: o.label, size: LABEL * k, cls: 'label', src: o.id },
	]
}

const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y })

/** A leader: the line (tip first), a filled arrowhead at the tip, its text beside the last point. Paper-mm sizes × k. */
function leaderPrims(id: string, pts: Pt[], text: string | undefined, k: number): Prim[] {
	if (pts.length < 2) return []
	const [tip, next] = pts, len = Math.hypot(next.x - tip.x, next.y - tip.y) || 1
	const ux = (next.x - tip.x) / len, uy = (next.y - tip.y) / len, a = 3 * k, b = 1 * k
	const head = [tip, { x: tip.x + ux * a - uy * b, y: tip.y + uy * a + ux * b }, { x: tip.x + ux * a + uy * b, y: tip.y + uy * a - ux * b }]
	const out: Prim[] = [{ k: 'line', pts, cls: 'leader', src: id }, { k: 'line', pts: head, closed: true, fill: true, cls: 'leader leader-head', src: id }]
	if (text) {
		const end = pts[pts.length - 1], prev = pts[pts.length - 2], right = end.x >= prev.x
		out.push({ k: 'text', at: { x: end.x + (right ? 1 : -1) * k, y: end.y + 0.9 * k }, text, size: 2.5 * k, anchor: right ? 'start' : 'end', cls: 'note', src: id })
	}
	return out
}

/** A revision cloud: each edge of the outline as a row of outward bumps about `arc` long (polyline points). */
function cloudPts(pts: Pt[], arc: number): Pt[] {
	if (pts.length < 2) return pts
	// clockwise or not decides which side is "out"
	const area = pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p.x * q.y - q.x * p.y }, 0), side = area > 0 ? -1 : 1
	const out: Pt[] = []
	for (let i = 0; i < pts.length; i++) {
		const a = pts[i], b = pts[(i + 1) % pts.length], len = Math.hypot(b.x - a.x, b.y - a.y)
		if (len < 1e-6) continue
		const n = Math.max(1, Math.round(len / arc)), ux = (b.x - a.x) / len, uy = (b.y - a.y) / len, step = len / n
		for (let j = 0; j < n; j++) for (let t = 0; t < 8; t++) {
			const f = t / 8, along = (j + f) * step, bulge = Math.sin(Math.PI * f) * step * 0.45 * side
			out.push({ x: a.x + ux * along - uy * bulge, y: a.y + uy * along + ux * bulge })
		}
	}
	return out
}
const square = (c: Pt, w: number): Pt[] => [{ x: c.x - w / 2, y: c.y - w / 2 }, { x: c.x + w / 2, y: c.y - w / 2 }, { x: c.x + w / 2, y: c.y + w / 2 }, { x: c.x - w / 2, y: c.y + w / 2 }]
const fmtZ = (z: number) => `${z >= 0 ? '+' : '-'}${Math.abs(Math.round(z))}`
