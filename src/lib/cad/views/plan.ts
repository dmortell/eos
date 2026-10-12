// The PLAN generator: one level's data → a display list (plan mm, y down). Pure: underlay placement and the drawing
// scale come in as inputs. Draw order: underlays, shapes / walls, containment, racks, outlets, labels on top.
import type { Id, Pt, Outlet, Rack, Underlay, ProjectSettings } from '../domain/types'
import type { Shape, PathNode } from '../domain/shapes'
import type { ProjectIndex } from '../domain/project'
import { isVertical, ellipsePts, arcPts, byDrawOrder, outlineOf } from '../domain/shapes'
import { corners, trimmedEnds } from '../domain/bends'
import { outlineLoops, roundCorners, endCorners, nestLoops, type OutlineEdge } from '../domain/runOutline'
import { layersOf, layerOf } from '../domain/layers'
import { pictureRef } from '../domain/issue'
import { legendShapePrims } from './legend'
import { planOpenings } from '../domain/openings'
import { sectionMarks, sectionsOn } from './sectionMarks'
import { rotate } from '../domain/conventions'
import { tileLinesLocal } from '../domain/tiles'
import type { Bounds, Prim, Dash } from './display'
import { DASHES } from './display'
import { blockPrims } from './blocks'
import { markdownPrims } from './markdown'
import { defaultOutletBlock, outletAttrs, insertAttrs, blockFace, type Block, type BlockFace } from '../domain/blocks'
import { usageColour } from '../domain/usages'

export interface PlanOpts {
	/** 1:N — text and symbols are drawn at a constant paper size, so they scale with N. */
	scale: number
	/** Where an underlay sits (from its file's calibration); undefined = not ready / not calibrated. */
	underlay?: (u: Underlay) => { url: string; x: number; y: number; w: number; h: number; clip?: Bounds } | undefined
	/** The block library (built-ins + global). Without it outlets draw as plain circles. */
	blocks?: (id: Id) => Block | undefined
	/** Floorplans in black and white (on screen: the user's B/W; a sheet: its own setting). */
	gray?: boolean
	/** Outlets in their usage's color (true) or their layer's (false); absent = the project's old setting. */
	byUsage?: boolean
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
		out.push({ k: 'image', ...pl, x: pl.x + dx, y: pl.y + dy, ...(c ? { clip: { x0: c.x0 + dx, y0: c.y0 + dy, x1: c.x1 + dx, y1: c.y1 + dy } } : {}), opacity: u.opacity ?? 0.6, src: u.id, ...(o.gray ? { gray: true } : {}) })
	}
	const shapes = ix.shapes.filter((s) => s.levelId === levelId || (s.geom.kind === 'path' && s.geom.nodes.some((n) => n.levelId === levelId)) || passesThrough(ix, s, levelId))
	// (a shape drawn on an elevation's plane belongs to elevations, not the plan; so does a block put on a wall there)
	for (const s of [...shapes].sort(byDrawOrder)) if (s.role?.kind !== 'containment' && s.plane?.kind !== 'vertical' && !(s.geom.kind === 'insert' && s.geom.frame && s.geom.inElevations))
		out.push(...(s.geom.kind === 'legend' ? legendShapePrims(ix, s, new Set([levelId]), k, o.blocks) : shapePrims(s, k, o.blocks)))
	// Draw order follows height (2.5D): LOW runs (under-floor / at floor) go under racks and furniture; HIGH runs
	// (tier high, or wholly above the floor) and every RISER go on top — a riser often stands on or beside a rack,
	// and a rack's filled footprint would hide it.
	const over: Prim[] = []
	// the runs' bodies: joined runs as one outline each (backlog "Trunk drawing style"), under their pick bands
	const bodies = runBodies(ix, shapes, levelId)
	out.push(...bodies.low)
	over.push(...bodies.high)
	for (const s of shapes) {
		if (s.role?.kind !== 'containment' || s.geom.kind !== 'path') continue
		const high = s.role.tier === 'high' || s.geom.nodes.every((n) => n.z > 0)
		for (const p of runPrims(s, levelId, k, (id) => ix.nameOf(id))) (high || (p.k !== 'image' && p.cls.startsWith('riser')) ? over : out).push(p)
	}
	for (const r of ix.racks) if (r.levelId === levelId && r.at) out.push(...rackPrims(r, k))
	out.push(...over)
	// outlets in their usage's color (backlog "Usage colors and outlet tips"): the symbol, not its label — unless the
	// view draws them by layer (Usage colors off: the user's on screen, the sheet's on paper)
	const byUsage = o.byUsage ?? (ix.get('settings') as ProjectSettings | undefined)?.outletColour !== 'layer'
	for (const ot of ix.outlets) if (ot.levelId === levelId && ot.at) {
		const col = byUsage ? usageColour((id) => ix.get(id), ot.usage) : undefined
		out.push(...outletPrims(ot, k, o.blocks).map((p) => (col && p.k !== 'text' && p.k !== 'image' ? { ...p, color: col } : p)))
	}
	// section cut lines (Phase 6.2) on top
	for (const sec of sectionsOn(ix, levelId)) out.push(...sectionMarks(sec, k))
	return declutter(out)
}

/** One drawn shape as prims; `k` = drawing mm per paper mm (1 on a sheet, the plot scale in a plan). Its own color
 *  (`style.stroke`, Properties → Color) on all of them. */
/** `face`: how a block insert is drawn — its plan symbol, or its front drawing (elevations / sections: `faceFor`). */
export function shapePrims(s: Shape, k: number, blocks?: PlanOpts['blocks'], face: BlockFace = 'plan'): Prim[] {
	const ps = basePrims(s, k, blocks, face), fill = s.style?.fill && FILLABLE.has(s.geom.kind) ? regionFill(ps[0], s.style.fill) : null
	return ownStyle(s, fill ? [fill, ...ps] : ps)
}
const FILLABLE = new Set(['rect', 'circle', 'ellipse', 'polygon'])
/** A region's fill (Properties → Fill): its outline again, filled with the color, drawn under it. */
function regionFill(p: Prim | undefined, color: string): Prim | null {
	if (p?.k === 'line' || p?.k === 'circle') return { ...p, fill: true, cls: 'shape-fill', color }
	return null
}
function basePrims(s: Shape, k: number, blocks: PlanOpts['blocks'] | undefined, face: BlockFace): Prim[] {
	const g = s.geom, cls = s.role?.kind === 'wall' ? 'wall' : 'shape'
	switch (g.kind) {
		case 'insert': {
			const b = blocks?.(g.blockId)
			if (b) return blockPrims(blockFace(b, face), { at: g.at, rot: g.rot, scale: g.scale }, k, insertAttrs(b, g.attrs, g.hidden), s.id, 'shape')
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
			}).concat(!s.role && s.style?.ends ? lineEnds(g, s.style.ends, k, s.id) : [])
		}
		case 'rect': {
			const hx = g.size.x / 2, hy = g.size.y / 2
			const pts = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map(([x, y]) => add(g.centre, rotate({ x, y }, g.rot ?? 0)))
			// a box / desk can show which side is its back, like racks (a thick line on its local −y edge), and its doors
			const local = (x: number, y: number) => add(g.centre, rotate({ x, y }, g.rot ?? 0))
			const tiles = s.tiles ? tileLinesLocal(g.size, s.tiles).map(([p, q]): Prim => ({ k: 'line', pts: [local(p.x, p.y), local(q.x, q.y)], cls: 'tile-line', src: s.id })) : []
			return [{ k: 'line', pts, closed: true, fill: !!s.extent, cls, src: s.id }, ...tiles, ...(s.backLine ? [{ k: 'line', pts: [pts[0], pts[1]], cls: 'rack-back', src: s.id } as Prim] : []),
				...doorPrims(s.doors, s.id, local, hx, hy)]
		}
		case 'circle': return [{ k: 'circle', c: g.centre, r: g.r, fill: !!s.extent, cls, src: s.id }]
		case 'ellipse': return [{ k: 'line', pts: ellipsePts(g), closed: true, fill: !!s.extent, cls, src: s.id }]
		case 'polygon': return [{ k: 'line', pts: g.pts, closed: true, fill: !!s.extent, cls, src: s.id }]
		case 'arc': return [{ k: 'line', pts: arcPts(g), cls, src: s.id }]
		case 'text': {
			// one prim per line (backlog "Text options": multi-line, aligned on its anchor point), lines going down the text
			const size = g.sizeMm * k, lh = size * LINE, r = ((g.rot ?? 0) * Math.PI) / 180, anchor = ANCHOR[g.align ?? 'left']
			// a MARKDOWN text: headings, lists, bold / italic and tables laid out in its box (views/markdown.ts)
			if (g.markdown) {
				const m = markdownPrims(g, k, s.id)
				return s.style?.fill ? [textBox(g.at, Array(m.lines).fill(''), size, g.rot, s.style.fill, s.id, anchor, m.w), ...m.prims] : m.prims
			}
			// a text with a WIDTH wraps inside it (backlog "Text that fills a box"), and an unturned one is clipped to it
			const lines = g.width ? g.text.split('\n').flatMap((p) => wrapLine(p, size, g.width!)) : g.text.split('\n')
			const x0 = g.at.x - (anchor === 'middle' ? g.width! / 2 : anchor === 'end' ? g.width! : 0)
			const clip = g.width && !g.rot ? { clip: { x0, y0: g.at.y - size * 2, x1: x0 + g.width, y1: g.at.y + lh * lines.length + size } } : {}
			const ts = lines.map((text, i): Prim => ({ k: 'text', at: { x: g.at.x - Math.sin(r) * lh * i, y: g.at.y + Math.cos(r) * lh * i }, text, size, rot: g.rot, ...(anchor !== 'start' ? { anchor } : {}), cls: 'note', src: s.id, ...clip }))
			return s.style?.fill ? [textBox(g.at, lines, size, g.rot, s.style.fill, s.id, anchor, g.width), ...ts] : ts
		}
		case 'leader': return leaderPrims(s.id, g.pts, g.text, k, g.border)
		case 'cloud': return [{ k: 'line', pts: cloudPts(g.pts, (g.arcMm ?? 6) * k), closed: true, cls: 'cloud', src: s.id }]
		case 'dimension': return dimensionPrims(g, k, s.id)
		case 'image': {
			// the picture fitted in its box (its own proportions), then an unseen frame that takes clicks and the selection
			const box = outlineOf(g)!
			return [{ k: 'image', url: pictureRef(g.fileId, g.page ?? 1), x: g.centre.x - g.size.x / 2, y: g.centre.y - g.size.y / 2, w: g.size.x, h: g.size.y, fit: 'centre', ...(g.rot ? { rot: g.rot } : {}), src: s.id },
				{ k: 'line', pts: box, closed: true, fill: true, cls: 'image-frame', src: s.id }]
		}
		default: return []
	}
}

/** A shape's own style on all its prims: its line color, lineweight and line type (backlog "Shape style"); a text's
 *  background box and a region's fill keep theirs, and text takes only the color. */
export function ownStyle(s: Shape, ps: Prim[]): Prim[] {
	const st = s.style ?? {}, dash = st.dash && (DASHES as string[]).includes(st.dash) ? (st.dash as Dash) : undefined
	if (!st.stroke && !st.weightMm && !dash) return ps
	return ps.map((p) => {
		if (p.k === 'image' || p.cls === 'note-bg' || p.cls === 'shape-fill') return p
		const own = { ...(st.stroke ? { color: st.stroke } : {}), ...(p.k !== 'text' && st.weightMm ? { weight: st.weightMm } : {}), ...(p.k !== 'text' && dash && !/line-(head|tick)/.test(p.cls) ? { dash } : {}) }
		return { ...p, ...own }
	})
}

/** A filled box behind a text (its background): the text's width estimated as for title blocks (0.6 em Latin, 1 em
 *  full-width), turned with it. */
/** A text's line spacing (× its size). */
const LINE = 1.3
const ANCHOR = { left: 'start', centre: 'middle', right: 'end' } as const
function textBox(at: Pt, lines: string[], size: number, rot: number | undefined, fill: string, src: string, anchor: 'start' | 'middle' | 'end' = 'start', width?: number): Prim {
	const w = width ?? Math.max(...lines.map((t) => textWidth(t, size))), pad = size * 0.25   // a boxed text: its box's width
	const x0 = anchor === 'middle' ? -w / 2 : anchor === 'end' ? -w : 0, y1 = (lines.length - 1) * size * LINE
	const r = ((rot ?? 0) * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r)
	const pts = [[x0 - pad, -size - pad], [x0 + w + pad, -size - pad], [x0 + w + pad, y1 + pad], [x0 - pad, y1 + pad]].map(([x, y]) => ({ x: at.x + x * c - y * sn, y: at.y + x * sn + y * c }))
	return { k: 'line', pts, closed: true, fill: true, cls: 'note-bg', color: fill, src }
}

/**
 * A DIMENSION (backlog "Markup kinds" part 3): extension lines from the two points to the dimension line (set off by
 * `offset`), architectural ticks at its ends, and the length over its middle — mm below a metre, else m (or its own
 * text). Aligned with the points, or horizontal / vertical. In the shape's own space; `k` = drawing mm per paper mm.
 */
type Dim = Extract<Shape['geom'], { kind: 'dimension' }>
/** A dimension's measured length and the two ends of its dimension line. */
export function dimLine(g: Dim): { a2: Pt; b2: Pt; len: number } {
	const { a, b } = g
	if (g.mode === 'horizontal') return { a2: { x: a.x, y: a.y + g.offset }, b2: { x: b.x, y: a.y + g.offset }, len: Math.abs(b.x - a.x) }
	if (g.mode === 'vertical') return { a2: { x: a.x + g.offset, y: a.y }, b2: { x: a.x + g.offset, y: b.y }, len: Math.abs(b.y - a.y) }
	const len = Math.hypot(b.x - a.x, b.y - a.y)
	const n = len ? { x: -(b.y - a.y) / len, y: (b.x - a.x) / len } : { x: 0, y: -1 }
	return { a2: { x: a.x + n.x * g.offset, y: a.y + n.y * g.offset }, b2: { x: b.x + n.x * g.offset, y: b.y + n.y * g.offset }, len }
}
/** Where a point lands as an offset for this dimension (the third click of the tool). */
export function dimOffset(g: Pick<Dim, 'a' | 'b' | 'mode'>, p: Pt): number {
	if (g.mode === 'horizontal') return p.y - g.a.y
	if (g.mode === 'vertical') return p.x - g.a.x
	const L = Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y) || 1
	return ((p.x - g.a.x) * -(g.b.y - g.a.y) + (p.y - g.a.y) * (g.b.x - g.a.x)) / L
}

export function dimensionPrims(g: Dim, k: number, src: string): Prim[] {
	const { a, b } = g, { a2, b2, len } = dimLine(g)
	if (len < 1e-6) return []
	const gap = 1 * k, over = 1.5 * k, tick = 1.2 * k
	const ext = (p: Pt, q: Pt, gap: number): Prim | null => {
		const L = Math.hypot(q.x - p.x, q.y - p.y)
		if (L < gap) return null
		const u = { x: (q.x - p.x) / L, y: (q.y - p.y) / L }
		return { k: 'line', pts: [{ x: p.x + u.x * gap, y: p.y + u.y * gap }, { x: q.x + u.x * over, y: q.y + u.y * over }], cls: 'dim', src }
	}
	const d = { x: (b2.x - a2.x) / len, y: (b2.y - a2.y) / len }, dl = Math.hypot(d.x, d.y) || 1, u = { x: d.x / dl, y: d.y / dl }
	const slash = (p: Pt): Prim => ({ k: 'line', pts: [{ x: p.x - (u.x - u.y) * tick * 0.7, y: p.y - (u.y + u.x) * tick * 0.7 }, { x: p.x + (u.x - u.y) * tick * 0.7, y: p.y + (u.y + u.x) * tick * 0.7 }], cls: 'dim dim-tick', src })
	// the text reads along the line, never upside down; set just off it (above it on screen)
	let ang = (Math.atan2(u.y, u.x) * 180) / Math.PI
	if (ang > 90) ang -= 180; else if (ang <= -90) ang += 180
	const r = (ang * Math.PI) / 180, up = { x: Math.sin(r), y: -Math.cos(r) }, mid = { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 }
	const text = g.text ?? (len < 10000 ? `${Math.round(len)}` : `${(len / 1000).toFixed(1)} m`)   // mm up to 10 m (Dave)
	return [
		...[ext(a, a2, g.gapA ?? gap), ext(b, b2, g.gapB ?? gap)].filter((p): p is Prim => !!p),
		{ k: 'line', pts: [{ x: a2.x - u.x * over, y: a2.y - u.y * over }, { x: b2.x + u.x * over, y: b2.y + u.y * over }], cls: 'dim', src },
		slash(a2), slash(b2),
		{ k: 'text', at: g.textAt ?? { x: mid.x + up.x * k, y: mid.y + up.y * k }, text, size: 2.5 * k, anchor: 'middle', rot: ang || undefined, cls: 'dim-text', src },
	]
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

/**
 * The runs' BODIES (backlog "Trunk drawing style", G048 / G187, the legacy outlets tool's look): every level segment
 * of the containment runs as a band, the bands of runs on the same layer, tier, color and weight walked into ONE
 * outline (runs that meet at a point join; domain/runOutline.ts), its corners rounded (a quarter of the width; square
 * ends stay), filled faintly in the run's color. High (ceiling) runs dashed, primary runs stronger. A corner's bend
 * radius (domain/bends.ts) shapes the outline. No source: the runs' own bands (drawn invisibly over it) are what
 * picks and selects them; the outline carries its layer so hiding the layer hides it.
 */
function runBodies(ix: ProjectIndex, shapes: Shape[], levelId: Id): { low: Prim[]; high: Prim[] } {
	const known = new Set(layersOf(ix.layers).map((l) => l.id))
	const buckets = new Map<string, { high: boolean; layer?: Id; color?: string; primary: boolean; edges: OutlineEdge[] }>()
	for (const s of shapes) {
		if (s.role?.kind !== 'containment' || s.geom.kind !== 'path') continue
		const high = s.role.tier === 'high' || s.geom.nodes.every((n) => n.z > 0), layer = layerOf(s, known), color = s.style?.stroke, primary = !!s.role.primary
		const k = `${high}|${layer}|${color ?? ''}|${primary}`
		const b = buckets.get(k) ?? buckets.set(k, { high, layer, color, primary, edges: [] }).get(k)!
		const nodes = new Map(s.geom.nodes.map((n) => [n.id, n])), bends = corners(s), w0 = s.section?.w ?? 50
		for (const sg of s.geom.segs) {
			const a = nodes.get(sg.a), z = nodes.get(sg.b)
			if (!a || !z || isVertical(a, z) || (a.levelId ?? s.levelId) !== levelId) continue
			const [p, q] = trimmedEnds(bends, sg.id, a, z)
			b.edges.push({ a: p, b: q, w: (sg.section ?? s.section)?.w ?? w0 })
		}
		for (const bd of bends.values()) {
			if (bd.r <= 0 || (nodes.get(bd.node)?.levelId ?? s.levelId) !== levelId) continue
			const w = Math.min(...s.geom.segs.filter((g) => bd.segs.includes(g.id)).map((g) => (g.section ?? s.section)?.w ?? w0))
			for (let i = 1; i < bd.arc.length; i++) b.edges.push({ a: bd.arc[i - 1], b: bd.arc[i], w })
		}
	}
	const low: Prim[] = [], high: Prim[] = []
	for (const b of buckets.values()) {
		if (!b.edges.length) continue
		const r = Math.min(...b.edges.map((e) => e.w)) / 4, sharp = endCorners(b.edges)
		const cls = `run-body${b.high ? ' run-high run-ceiling' : ''}${b.primary ? ' run-primary' : ''}`
		// a ring of runs gives an outside loop and its hole: the hole goes with the loop round it, so it stays unfilled
		for (const { outer, holes } of nestLoops(outlineLoops(b.edges).map((l) => roundCorners(l, r, sharp))))
			(b.high ? high : low).push({ k: 'line', pts: outer, closed: true, fill: true, cls, ...(holes.length ? { holes } : {}), ...(b.layer ? { layer: b.layer } : {}), ...(b.color ? { color: b.color } : {}) })
	}
	return { low, high }
}

/** Containment: horizontal segments as bands of their real width — invisible over the run's body (they pick and select
 *  it); vertical ones as a riser symbol + z range. */
function runPrims(s: Shape, levelId: Id, k: number, levelName: (id: Id) => string): Prim[] {
	if (s.geom.kind !== 'path' || s.role?.kind !== 'containment') return []
	const high = s.role.tier === 'high', cls = high ? 'run run-hit run-high' : 'run run-hit'
	const nodes = new Map(s.geom.nodes.map((n) => [n.id, n]))
	const w = s.section?.w ?? 50
	const out: Prim[] = []
	// corners with a radius (backlog "Bend radius"): the segments stop at the arc's tangent points, the arc joins them
	const bends = corners(s), colour = s.style?.stroke ? { color: s.style.stroke } : {}
	for (const bd of bends.values()) {
		const n = nodes.get(bd.node)
		if (bd.r <= 0 || (n?.levelId ?? s.levelId) !== levelId) continue
		const segW = s.geom.segs.filter((g) => bd.segs.includes(g.id)).map((g) => (g.section ?? s.section)?.w ?? w)
		out.push({ k: 'line', pts: bd.arc, w: Math.min(...segW), cls, src: s.id, ...colour })
	}
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
			// a segment's own size wins (a reducer); a run's own color (several runs edited at once) over the tier's
			out.push({ k: 'line', pts: trimmedEnds(bends, sg.id, a, b), w: (sg.section ?? s.section)?.w ?? w, cls, src: s.id, ...colour })
		}
	}
	// the run's label sits along it, by the middle of its longest segment on this level (UX review L3: at the first node
	// it landed on the racks and risers there)
	if (s.label) {
		let best: { a: PathNode; b: PathNode; len: number } | null = null
		for (const sg of s.geom.segs) {
			const a = nodes.get(sg.a), b = nodes.get(sg.b)
			if (!a || !b || isVertical(a, b) || (a.levelId ?? s.levelId) !== levelId) continue
			const len = Math.hypot(b.x - a.x, b.y - a.y)
			if (!best || len > best.len) best = { a, b, len }
		}
		const at = best ? { x: (best.a.x + best.b.x) / 2, y: (best.a.y + best.b.y) / 2 - w } : s.geom.nodes[0]
		if (at) out.push({ k: 'text', at, text: s.label, size: LABEL * k, anchor: best ? 'middle' : undefined, cls: 'label run-label', src: s.id })
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
export const rackDoorPrims = (r: Rack, p: (x: number, y: number) => Pt, hw: number, hd: number): Prim[] => doorPrims(r.doors, r.id, p, hw, hd)

/** Doors drawn open at 90° with their swing (racks, and boxes / cabinets drawn as shapes — backlog "Door swings on
 *  other objects"): `p` maps the footprint's local (x, y) (front = +y) to the plan; `hw` / `hd` = its half width / depth. */
export function doorPrims(d: Rack['doors'], id: string, p: (x: number, y: number) => Pt, hw: number, hd: number): Prim[] {
	const r = { id }
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

/** A plain line's end marks (backlog "Markup kinds" part 2): at its first node (`a`) and at every other loose end
 *  (`b`), pointing out along the last segment — a filled arrow (3 × 2 paper mm), a dot (Ø1.6) or a 45° tick (3 long).
 *  Paper-mm sizes × k. */
export function lineEnds(g: Extract<Shape['geom'], { kind: 'path' }>, ends: NonNullable<NonNullable<Shape['style']>['ends']>, k: number, id: string): Prim[] {
	const byId = new Map(g.nodes.map((n) => [n.id, n])), degree = new Map<string, string[]>()
	for (const sg of g.segs) { degree.set(sg.a, [...(degree.get(sg.a) ?? []), sg.b]); degree.set(sg.b, [...(degree.get(sg.b) ?? []), sg.a]) }
	const out: Prim[] = []
	for (const [nid, nbrs] of degree) {
		if (nbrs.length !== 1) continue
		const mark = nid === g.nodes[0]?.id ? ends.a : ends.b, n = byId.get(nid), from = byId.get(nbrs[0])
		if (!mark || !n || !from) continue
		const tip = { x: n.x, y: n.y }
		const len = Math.hypot(tip.x - from.x, tip.y - from.y) || 1, ux = (from.x - tip.x) / len, uy = (from.y - tip.y) / len
		if (mark === 'arrow') {
			const a = 3 * k, b = 1 * k
			out.push({ k: 'line', pts: [tip, { x: tip.x + ux * a - uy * b, y: tip.y + uy * a + ux * b }, { x: tip.x + ux * a + uy * b, y: tip.y + uy * a - ux * b }], closed: true, fill: true, cls: 'shape line-head ink', src: id })
		} else if (mark === 'dot') out.push({ k: 'circle', c: tip, r: 0.8 * k, fill: true, cls: 'shape line-head ink', src: id })
		else {
			const t = 1.5 * k, c = Math.SQRT1_2, dx = (ux * c - uy * c) * t, dy = (uy * c + ux * c) * t   // the tick: 45° across the line
			out.push({ k: 'line', pts: [{ x: tip.x - dx, y: tip.y - dy }, { x: tip.x + dx, y: tip.y + dy }], cls: 'shape line-tick', src: id })
		}
	}
	return out
}

/** A leader: the line (tip first), a filled arrowhead at the tip, its text beside the last point. Paper-mm sizes × k. */
function leaderPrims(id: string, pts: Pt[], text: string | undefined, k: number, border?: 'underline' | 'box'): Prim[] {
	if (pts.length < 2) return []
	const [tip, next] = pts, len = Math.hypot(next.x - tip.x, next.y - tip.y) || 1
	const ux = (next.x - tip.x) / len, uy = (next.y - tip.y) / len, a = 3 * k, b = 1 * k
	const head = [tip, { x: tip.x + ux * a - uy * b, y: tip.y + uy * a + ux * b }, { x: tip.x + ux * a + uy * b, y: tip.y + uy * a - ux * b }]
	const out: Prim[] = [{ k: 'line', pts, cls: 'leader', src: id }, { k: 'line', pts: head, closed: true, fill: true, cls: 'leader leader-head', src: id }]
	if (text) {
		// its words beside the last point, on the side the leader goes; several lines go down (backlog "Callouts")
		const end = pts[pts.length - 1], prev = pts[pts.length - 2], right = end.x >= prev.x, size = 2.5 * k, lh = size * LINE
		const lines = text.split('\n'), x = end.x + (right ? 1 : -1) * k, y0 = end.y + 0.9 * k
		lines.forEach((t, i) => out.push({ k: 'text', at: { x, y: y0 + i * lh }, text: t, size, anchor: right ? 'start' : 'end', cls: 'note', src: id }))
		if (border) {
			const w = Math.max(...lines.map((t) => textWidth(t, size))), pad = 0.6 * k
			const x0 = right ? x - pad : x - w - pad, x1 = right ? x + w + pad : x + pad, bottom = y0 + (lines.length - 1) * lh + pad
			out.push(border === 'box'
				? { k: 'line', pts: [{ x: x0, y: y0 - size - pad }, { x: x1, y: y0 - size - pad }, { x: x1, y: bottom }, { x: x0, y: bottom }], closed: true, cls: 'leader', src: id }
				: { k: 'line', pts: [{ x: right ? end.x : x1, y: bottom }, { x: right ? x1 : end.x, y: bottom }], cls: 'leader', src: id })
		}
	}
	return out
}
/** About how wide a line of text draws (Latin ~0.6 of its size, CJK a full em). */
const textWidth = (t: string, size: number) => [...t].reduce((a, ch) => a + (ch.charCodeAt(0) >= 0x2e80 ? 1 : 0.6) * size, 0)

/** One paragraph broken into lines that fit `width`: at spaces, and between any two CJK characters; a word longer than
 *  the width goes on a line of its own (and is clipped). */
export function wrapLine(text: string, size: number, width: number): string[] {
	const tokens = text.match(/[⺀-￿]|[^\s⺀-￿]+|\s+/g) ?? ['']
	const out: string[] = []
	let cur = ''
	for (const t of tokens) {
		const next = cur + t
		if (cur.trim() && !/^\s+$/.test(t) && textWidth(next.trimEnd(), size) > width) { out.push(cur.trimEnd()); cur = t.trimStart() }
		else cur = next
	}
	out.push(cur.trimEnd())
	return out
}

/** A revision cloud: each edge of the outline as a row of outward bumps about `arc` long (polyline points). */
export function cloudPts(pts: Pt[], arc: number): Pt[] {
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

/** Labels that collide (UX review L3: TR1, +2105 / +2600, V06 / P3C / TR2 printed on top of each other): run and
 *  riser labels move down a line at a time (up to four) until they're clear of every label already placed; rack and
 *  outlet labels stay where they are (they belong on their symbols). Labels scale with the drawing, so a collision
 *  is the same at every zoom — moving is the only fix. Pure; tested in plan.test.ts. */
export function declutter(prims: Prim[]): Prim[] {
	const box = (p: Extract<Prim, { k: 'text' }>) => {
		const w = p.text.length * p.size * 0.55, x0 = p.anchor === 'middle' ? p.at.x - w / 2 : p.anchor === 'end' ? p.at.x - w : p.at.x
		return { x0, x1: x0 + w, y0: p.at.y - p.size, y1: p.at.y + p.size * 0.25 }
	}
	type B = ReturnType<typeof box>
	const hit = (a: B, b: B) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
	type T = Extract<Prim, { k: 'text' }>
	const movable = (p: Prim): boolean => p.k === 'text' && !p.rot && (p.cls === 'riser-label' || p.cls.includes('run-label'))
	const placed: B[] = prims.flatMap((p) => (p.k === 'text' && !movable(p) && (p.cls === 'label' || p.cls.startsWith('label')) && !p.rot ? [box(p)] : []))
	return prims.map((p) => {
		if (!movable(p)) return p
		let q = p as T
		for (let i = 0; i < 4 && placed.some((b) => hit(box(q), b)); i++) q = { ...q, at: { x: q.at.x, y: q.at.y + q.size * 1.25 } }
		placed.push(box(q))
		return q
	})
}
