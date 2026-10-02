// The PLAN generator: one level's data → a display list (plan mm, y down). Pure: underlay placement and the drawing
// scale come in as inputs. Draw order: underlays, shapes / walls, containment, racks, outlets, labels on top.
import type { Id, Pt, Outlet, Rack, Underlay } from '../domain/types'
import type { Shape } from '../domain/shapes'
import type { ProjectIndex } from '../domain/project'
import { isVertical } from '../domain/shapes'
import { rotate } from '../domain/conventions'
import type { Prim } from './display'
import { blockPrims } from './blocks'
import { defaultOutletBlock, outletAttrs, type Block } from '../domain/blocks'

export interface PlanOpts {
	/** 1:N — text and symbols are drawn at a constant paper size, so they scale with N. */
	scale: number
	/** Where an underlay sits (from its file's calibration); undefined = not ready / not calibrated. */
	underlay?: (u: Underlay) => { url: string; x: number; y: number; w: number; h: number } | undefined
	/** The block library (built-ins + global). Without it outlets draw as plain circles. */
	blocks?: (id: Id) => Block | undefined
}

/** Paper sizes (mm) of plan symbols. */
const OUTLET_R = 1.5, LABEL = 1.8, RACK_LABEL = 2.2, RISER_LABEL = 1.6
export const RACK_FRONT_GAP = 40

export function planDisplayList(ix: ProjectIndex, levelId: Id, o: PlanOpts): Prim[] {
	const out: Prim[] = []
	const k = o.scale

	for (const u of ix.byId.values()) {
		if (u.type !== 'underlay' || u.levelId !== levelId) continue
		const pl = o.underlay?.(u)
		if (pl) out.push({ k: 'image', ...pl, opacity: u.opacity ?? 0.6, src: u.id })
	}
	const shapes = ix.shapes.filter((s) => s.levelId === levelId || (s.geom.kind === 'path' && s.geom.nodes.some((n) => n.levelId === levelId)))
	for (const s of shapes) if (s.role?.kind !== 'containment') out.push(...shapePrims(s, k, o.blocks))
	for (const s of shapes) if (s.role?.kind === 'containment') out.push(...runPrims(s, levelId, k, (id) => ix.nameOf(id)))
	for (const r of ix.racks) if (r.levelId === levelId && r.at) out.push(...rackPrims(r, k))
	for (const ot of ix.outlets) if (ot.levelId === levelId && ot.at) out.push(...outletPrims(ot, k, o.blocks))
	return out
}

function shapePrims(s: Shape, k: number, blocks?: PlanOpts['blocks']): Prim[] {
	const g = s.geom, cls = s.role?.kind === 'wall' ? 'wall' : 'shape'
	switch (g.kind) {
		case 'insert': {
			const b = blocks?.(g.blockId)
			if (b) return blockPrims(b, { at: g.at, rot: g.rot, scale: g.scale }, k, g.attrs ?? {}, s.id, 'shape')
			const r = 2 * k   // a missing block: a marked box so it can still be found and fixed
			return [{ k: 'line', pts: [{ x: g.at.x - r, y: g.at.y - r }, { x: g.at.x + r, y: g.at.y - r }, { x: g.at.x + r, y: g.at.y + r }, { x: g.at.x - r, y: g.at.y + r }], closed: true, cls: 'missing', src: s.id }]
		}
		case 'path': {
			const nodes = new Map(g.nodes.map((n) => [n.id, n]))
			return g.segs.flatMap((sg): Prim[] => {
				const a = nodes.get(sg.a), b = nodes.get(sg.b)
				return a && b ? [{ k: 'line', pts: [a, b], ...(s.section ? { w: (sg.section ?? s.section).w } : {}), cls, src: s.id }] : []
			})
		}
		case 'rect': {
			const hx = g.size.x / 2, hy = g.size.y / 2
			const pts = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map(([x, y]) => add(g.centre, rotate({ x, y }, g.rot ?? 0)))
			return [{ k: 'line', pts, closed: true, fill: !!s.extent, cls, src: s.id }]
		}
		case 'circle': return [{ k: 'circle', c: g.centre, r: g.r, fill: !!s.extent, cls, src: s.id }]
		case 'polygon': return [{ k: 'line', pts: g.pts, closed: true, fill: !!s.extent, cls, src: s.id }]
		case 'text': return [{ k: 'text', at: g.at, text: g.text, size: g.sizeMm * k, rot: g.rot, cls: 'note', src: s.id }]
		default: return []
	}
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

/** A rack: footprint, an X, and the FRONT line just outside its local +y face (ADR 0004). */
function rackPrims(r: Rack, k: number): Prim[] {
	const at = r.at!, rot = r.rot ?? 0, hw = r.widthMm / 2, hd = r.depthMm / 2
	const p = (x: number, y: number) => add(at, rotate({ x, y }, rot))
	const corners = [p(-hw, -hd), p(hw, -hd), p(hw, hd), p(-hw, hd)]
	const fy = hd + RACK_FRONT_GAP
	return [
		{ k: 'line', pts: corners, closed: true, fill: true, cls: 'rack', src: r.id },
		{ k: 'line', pts: [corners[0], corners[2]], cls: 'rack-x', src: r.id },
		{ k: 'line', pts: [corners[1], corners[3]], cls: 'rack-x', src: r.id },
		{ k: 'line', pts: [p(-hw * 0.6, fy), p(hw * 0.6, fy)], cls: 'rack-front', src: r.id },
		{ k: 'text', at, text: r.name, size: RACK_LABEL * k, anchor: 'middle', cls: 'label', src: r.id },
	]
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
const square = (c: Pt, w: number): Pt[] => [{ x: c.x - w / 2, y: c.y - w / 2 }, { x: c.x + w / 2, y: c.y - w / 2 }, { x: c.x + w / 2, y: c.y + w / 2 }, { x: c.x - w / 2, y: c.y + w / 2 }]
const fmtZ = (z: number) => `${z >= 0 ? '+' : '−'}${Math.abs(Math.round(z))}`
