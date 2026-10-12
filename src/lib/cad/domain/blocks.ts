// Blocks (ADR 0007): a named list of ordinary shapes in local mm, placed by an insert shape or drawing an outlet.
// GLOBAL only (Dave, 2026-10-02 — no per-project blocks): the built-ins below live in code; blocks people make live in
// one global doc (`settings/cadBlocks`). ANNOTATIVE blocks (outlet symbols) are drawn in paper mm, so they keep their
// printed size at any scale; others are real model mm (a desk, a rack shelf item).
import type { Id, Pt, Outlet } from './types'
import type { BlockDef } from './drawing'
import type { ShapeCore, Shape, Geometry } from './shapes'
import { moveGeometry, ellipsePts, placeGeometry, mirrorGeometry, sameFrame } from './shapes'
import { project, unproject, type ElevFrame } from './conventions'
import { newId } from './ids'

/** The `{TAG}`s that are DATA fields (drawing fields, filled from the project), not block attributes an insert fills. */
export const DATA_FIELDS = ['PROJECT', 'LEVEL', 'SHEET', 'SHEET_TITLE', 'DATE'] as const
/** Is this `{TAG}` a data field (not a block attribute an insert fills)? */
export const isDataField = (tag: string) => (DATA_FIELDS as readonly string[]).includes(tag) || tag.startsWith('COUNT:')

export type BlockShape = BlockDef['shapes'][number]
export type Block = BlockDef & { annotative?: boolean; builtin?: boolean
	/** Its FRONT drawing, in real mm, centred on the insert point: what an elevation / section shows of an insert placed on
	 *  a wall (the plan symbol is a plan view). Absent = the plan symbol is shown there too. */
	front?: BlockShape[] }
/** The block as an elevation / section draws it: its front drawing (real mm), if it has one. */
export const frontOf = (b: Block): Block => (b.front ? { ...b, shapes: b.front, annotative: false } : b)
/** How a view draws blocks: its PLAN symbol, or its FRONT (an elevation / section). Decided once, by the view's kind,
 *  for every way a block is drawn — a plan, an elevation, a note in a viewport, the Insert ghost, the Blocks window. */
export type BlockFace = 'plan' | 'front'
export const faceFor = (viewKind: string): BlockFace => (viewKind === 'elevation' || viewKind === 'section' ? 'front' : 'plan')
export const blockFace = (b: Block, face: BlockFace): Block => (face === 'front' ? frontOf(b) : b)
/** Is this block drawn in paper mm (annotative) with this face? Only built-in symbols are; blocks people make from
 *  model shapes are real mm. For code with no block library at hand (untying a note from a viewport). */
export const annotativeIn = (blockId: Id, face: BlockFace): boolean => { const b = BUILTIN_BLOCKS.find((x) => x.id === blockId); return !!b && !!blockFace(b, face).annotative }

const sh = (geom: Geometry, extra: Partial<BlockShape> = {}): BlockShape => ({ id: newId(), geom, ...extra })
/** A straight line as a two-node path. */
const seg = (x1: number, y1: number, x2: number, y2: number): BlockShape => {
	const a = { id: newId(), x: x1, y: y1, z: 0 }, b = { id: newId(), x: x2, y: y2, z: 0 }
	return sh({ kind: 'path', nodes: [a, b], segs: [{ id: newId(), a: a.id, b: b.id }] })
}
const solid = { style: { fill: 'solid' } }
// the label above the symbol, the usage below it (y down, `at` = the text's baseline; symbols reach ±1.8)
const label: BlockShape = sh({ kind: 'text', at: { x: 0, y: -2.2 }, text: '{LABEL}', sizeMm: 1.8, align: 'centre' })
const usage: BlockShape = sh({ kind: 'text', at: { x: 0, y: 3.6 }, text: '{USAGE}', sizeMm: 1.4, align: 'centre' })
// the number of ports in the MIDDLE of the symbol (Dave: "port numbers should be shown in the center of the outlet";
// it was to the right) — centred on (0, cy), white on a filled symbol, dark with a halo on an outline one
const ports = (sizeMm = 1.2, cy = 0): BlockShape => sh({ kind: 'text', at: { x: 0, y: cy + sizeMm * 0.35 }, text: '{PORTS}', sizeMm, align: 'centre' })

/** The built-in outlet symbols (paper mm, centred on the outlet). */
export const BUILTIN_BLOCKS: Block[] = [
	{ type: 'block', id: 'builtin:outlet-floor', name: 'Outlet - floor box', scope: 'global', category: 'outlet', annotative: true, builtin: true,
		shapes: [sh({ kind: 'rect', centre: { x: 0, y: 0 }, size: { x: 3, y: 3 } }), sh({ kind: 'circle', centre: { x: 0, y: 0 }, r: 0.9 }, solid), label, usage, ports(1.1)] },
	{ type: 'block', id: 'builtin:outlet-wall', name: 'Outlet - wall', scope: 'global', category: 'outlet', annotative: true, builtin: true,
		shapes: [sh({ kind: 'polygon', pts: [{ x: -1.6, y: -1.2 }, { x: 1.6, y: -1.2 }, { x: 0, y: 1.5 }] }, solid), label, usage, ports(1.2, -0.3)] },
	{ type: 'block', id: 'builtin:outlet-box', name: 'Outlet - desk/box', scope: 'global', category: 'outlet', annotative: true, builtin: true,
		shapes: [sh({ kind: 'circle', centre: { x: 0, y: 0 }, r: 1.5 }, solid), label, usage, ports(1.4)] },
	{ type: 'block', id: 'builtin:outlet-ceiling', name: 'Outlet - ceiling', scope: 'global', category: 'outlet', annotative: true, builtin: true,
		shapes: [sh({ kind: 'circle', centre: { x: 0, y: 0 }, r: 1.5 }), seg(-1.06, -1.06, 1.06, 1.06), seg(1.06, -1.06, -1.06, 1.06), label, usage, ports(1.3)] },
	// the AP: a ring with a disc (its port count white on it); its usage reads below like every other outlet (it used to say "AP" in the middle)
	{ type: 'block', id: 'builtin:ap', name: 'Wireless AP', scope: 'global', category: 'outlet', annotative: true, builtin: true,
		shapes: [sh({ kind: 'circle', centre: { x: 0, y: 0 }, r: 1.8 }), sh({ kind: 'circle', centre: { x: 0, y: 0 }, r: 0.95 }, solid), label, { ...usage, geom: { kind: 'text', at: { x: 0, y: 3.9 }, text: '{USAGE}', sizeMm: 1.4, align: 'centre' } }, ports(1.2)] },
	// wall faceplates, seen on the plan against the wall: a plate (one or two gangs) with a data triangle or power pins
	...faceplates(),
	...drawingSymbols(),
]

/** Drawing symbols (backlog "Markup kinds" part 5, Dave 2026-10-09: datum, detail and elevation tags — no north
 *  arrow), paper mm, the insert point at the symbol's centre (a datum: on its line). Their words are attributes, so
 *  each insert says its own (Properties › Attributes). Turn an elevation tag to aim its pointer. */
function drawingSymbols(): Block[] {
	const text = (x: number, y: number, t: string, sizeMm: number, align: 'left' | 'centre' = 'centre') => sh({ kind: 'text', at: { x, y }, text: t, sizeMm, align })
	/** A filled quarter of a circle of radius r, from angle a0 (degrees, y down). */
	const quarter = (r: number, a0: number) => sh({ kind: 'polygon', pts: [{ x: 0, y: 0 }, ...Array.from({ length: 7 }, (_, i) => { const a = ((a0 + i * 15) * Math.PI) / 180; return { x: r * Math.cos(a), y: r * Math.sin(a) } })] }, solid)
	return [
		// a level datum: a quartered target on the line, its name and height above the line
		{ type: 'block', id: 'builtin:datum', name: 'Datum (level)', scope: 'global', category: 'symbol', annotative: true, builtin: true,
			attrs: [{ tag: 'NAME', label: 'Name', default: 'FFL' }, { tag: 'HEIGHT', label: 'Height', default: '+0' }],
			shapes: [sh({ kind: 'circle', centre: { x: 0, y: 0 }, r: 1.6 }), quarter(1.6, 180), quarter(1.6, 0), seg(-1.6, 0, 18, 0), text(2.6, -0.7, '{NAME} {HEIGHT}', 2, 'left')] },
		// a detail callout: the detail's number over the sheet it is drawn on
		{ type: 'block', id: 'builtin:detail', name: 'Detail callout', scope: 'global', category: 'symbol', annotative: true, builtin: true,
			attrs: [{ tag: 'NUMBER', label: 'Detail no.', default: '1' }, { tag: 'ON_SHEET', label: 'On sheet', default: 'A-501' }],
			shapes: [sh({ kind: 'circle', centre: { x: 0, y: 0 }, r: 5 }), seg(-5, 0, 5, 0), text(0, -1.3, '{NUMBER}', 3), text(0, 3.4, '{ON_SHEET}', 2)] },
		// an elevation tag: the same bubble with a filled pointer towards what the elevation looks at (turn the insert)
		{ type: 'block', id: 'builtin:elevation-tag', name: 'Elevation tag', scope: 'global', category: 'symbol', annotative: true, builtin: true,
			attrs: [{ tag: 'NUMBER', label: 'Elevation no.', default: '1' }, { tag: 'ON_SHEET', label: 'On sheet', default: 'A-201' }],
			// the pointer sits on the circle's edge (its base follows the arc), clear of the number inside
			shapes: [sh({ kind: 'polygon', pts: [...Array.from({ length: 9 }, (_, i) => { const t = ((-130 + i * 10) * Math.PI) / 180; return { x: 4 * Math.cos(t), y: 4 * Math.sin(t) } }), { x: 0, y: -7.5 }] }, solid),
				sh({ kind: 'circle', centre: { x: 0, y: 0 }, r: 4 }), seg(-4, 0, 4, 0), text(0, -0.9, '{NUMBER}', 2.2), text(0, 2.8, '{ON_SHEET}', 1.8)] },
	]
}

/** Data / power faceplates, single / dual gang (paper mm, the plate's back on the wall line y = −0.75). */
function faceplates(): Block[] {
	const data = (x: number) => sh({ kind: 'polygon', pts: [{ x: x - 0.7, y: -0.45 }, { x: x + 0.7, y: -0.45 }, { x, y: 0.55 }] }, solid)
	const pins = (x: number): BlockShape[] => [seg(x - 0.35, -0.4, x - 0.35, 0.4), seg(x + 0.35, -0.4, x + 0.35, 0.4)]
	const make = (id: string, name: string, gangs: 1 | 2, mark: (x: number) => BlockShape[], front?: BlockShape[]): Block => {
		const w = gangs === 1 ? 2.6 : 4.8, xs = gangs === 1 ? [0] : [-1.15, 1.15]
		return { type: 'block', id, name, scope: 'global', category: 'outlet', annotative: true, builtin: true,
			shapes: [sh({ kind: 'rect', centre: { x: 0, y: 0 }, size: { x: w, y: 1.5 } }), ...xs.flatMap(mark), label, usage, ports(1.1)], ...(front ? { front } : {}) }
	}
	return [
		make('builtin:faceplate-data-1', 'Faceplate - data, single', 1, (x) => [data(x)], plateFront([0], rj45)),
		make('builtin:faceplate-data-2', 'Faceplate - data, dual', 2, (x) => [data(x)], plateFront([-22, 22], rj45)),
		make('builtin:faceplate-power-1', 'Faceplate - power, single', 1, pins, plateFront([0], power)),
		make('builtin:faceplate-power-2', 'Faceplate - power, dual', 2, pins, plateFront([-22, 22], power)),
	]
}

/** A faceplate from the front (Dave 2026-10-12): a 70 × 115 mm plate, a 50 × 90 mm frame for the sockets, and a socket
 *  centred at each y in `cys` (one above the other). Real mm. */
function plateFront(cys: number[], socket: (cy: number) => BlockShape[]): BlockShape[] {
	return [sh({ kind: 'rect', centre: { x: 0, y: 0 }, size: { x: 70, y: 115 } }), sh({ kind: 'rect', centre: { x: 0, y: 0 }, size: { x: 50, y: 90 } }), ...cys.flatMap(socket)]
}
/** A power socket: two short upright lines for its prongs over a circle for its earth. */
function power(cy: number): BlockShape[] { return [seg(-6.35, cy - 9, -6.35, cy - 1), seg(6.35, cy - 9, 6.35, cy - 1), sh({ kind: 'circle', centre: { x: 0, y: cy + 6 }, r: 2.5 })] }
/** A data socket: a small rectangle for its RJ45 jack. */
function rj45(cy: number): BlockShape[] { return [sh({ kind: 'rect', centre: { x: 0, y: cy }, size: { x: 14, y: 12 } })] }

/** The block that draws an outlet when it names none: by usage, then tier, then mount. */
export function defaultOutletBlock(o: Pick<Outlet, 'mount' | 'tier' | 'usage'>): Id {
	if (o.usage === 'AP') return 'builtin:ap'
	if (o.tier === 'high' || o.mount === 'ceiling') return 'builtin:outlet-ceiling'
	if (o.mount === 'wall') return 'builtin:outlet-wall'
	if (o.mount === 'floor') return 'builtin:outlet-floor'
	return 'builtin:outlet-box'
}

/** `{LABEL}`-style placeholders → values (unknown tags stay as written). */
export function fillAttrs(text: string, attrs: Record<string, string>): string {
	return text.replace(/\{([A-Z_]+)\}/g, (m, k: string) => attrs[k] ?? m)
}

export const outletAttrs = (o: Outlet): Record<string, string> => ({ LABEL: o.label, PORTS: String(o.ports.length), USAGE: o.usage })

/** An INSERT's attributes: every `{TAG}` in the block blank unless the insert sets it (an outlet symbol placed as a
 *  plain block — a power faceplate — has no label / ports / usage to show; Dave, A009). */
export function insertAttrs(b: Block, attrs: Record<string, string> = {}, hidden: string[] = []): Record<string, string> {
	const out: Record<string, string> = {}
	for (const d of blockAttrDefs(b)) out[d.tag] = d.default ?? ''
	const all = { ...out, ...attrs }
	for (const t of hidden) all[t] = ''   // a hidden attribute keeps its value (data) but doesn't draw
	return all
}

/** A block's ATTRIBUTES (backlog "Block attributes on an insert"): its declared ones (`attrs`, with label and default)
 *  then any other `{TAG}` its texts use, in that order — not the data fields ({PROJECT}, {LEVEL} …, domain/fields.ts). */
export function blockAttrDefs(b: Block): { tag: string; label: string; default?: string }[] {
	const out = [...(b.attrs ?? []).map((a) => ({ ...a }))], seen = new Set(out.map((a) => a.tag))
	for (const s of b.shapes) if (s.geom.kind === 'text') for (const m of s.geom.text.matchAll(/\{([A-Z_]+)\}/g)) {
		if (!seen.has(m[1]) && !isDataField(m[1])) { seen.add(m[1]); out.push({ tag: m[1], label: m[1][0] + m[1].slice(1).toLowerCase() }) }
	}
	return out
}

// ── Make a block from shapes ─────────────────────────────────────────────────────────────────────────────────────

function pointsOf(g: Geometry): Pt[] {
	switch (g.kind) {
		case 'path': return g.nodes
		case 'rect': return [{ x: g.centre.x - g.size.x / 2, y: g.centre.y - g.size.y / 2 }, { x: g.centre.x + g.size.x / 2, y: g.centre.y + g.size.y / 2 }]
		case 'circle': case 'arc': return [{ x: g.centre.x - g.r, y: g.centre.y - g.r }, { x: g.centre.x + g.r, y: g.centre.y + g.r }]
		case 'ellipse': return ellipsePts(g)
		case 'polygon': case 'leader': case 'cloud': return g.pts
		case 'text': case 'insert': case 'legend': return [g.at]
		case 'dimension': return [g.a, g.b]
		case 'image': return [g.centre]
	}
}

/** Why these shapes can't become a block, or null. Shapes drawn on an elevation / section's plane can't: a block is a
 *  plan drawing (its insert's point is a plan point), so they would land on the plan, metres from where they were. */
export function blockProblem(shapes: Shape[]): string | null {
	if (shapes.some((s) => s.plane?.kind === 'vertical')) return 'Make block takes plan shapes — not ones drawn on an elevation or section'
	return null
}

/** Why these shapes can't become a block's FRONT drawing, or null: they must lie on the plane of ONE elevation or
 *  section (what you draw in an elevation), and not be blocks themselves. */
export function frontProblem(shapes: Shape[]): string | null {
	if (!shapes.length) return 'Select the shapes drawn in the elevation first'
	if (shapes.some((s) => s.geom.kind === 'insert' || s.geom.kind === 'legend')) return 'A front drawing is made of drawn shapes, not blocks or legends'
	const planes = shapes.map((s) => (s.plane?.kind === 'vertical' ? s.plane : null))
	if (planes.some((p) => !p)) return 'A front drawing is made from shapes drawn in an elevation or section'
	const first = planes[0]!
	if (planes.some((p) => !sameFrame(p!.frame, first.frame))) return 'Those shapes are in different elevations — pick ones from one view'
	return null
}

/**
 * The FRONT drawing of a block from shapes drawn in an elevation or section: real mm, y down, origin = the middle of
 * their extent (as the plan symbol of Make block). `at` says where that middle is in the view — its u along the
 * elevation, its height v and the plane's depth — so the insert that replaces them goes back to the same place.
 */
export function frontFromShapes(shapes: Shape[], k = 100): { front: BlockShape[]; width: number; height: number; at: { u: number; v: number; depth: number; frame: ElevFrame } } | null {
	if (frontProblem(shapes)) return null
	const pl = shapes[0].plane as Extract<NonNullable<Shape['plane']>, { kind: 'vertical' }>
	/** The shape's points in view mm: u across, −height down the page. */
	const view = (g: Geometry): Geometry => {
		if (g.kind === 'path') return { ...g, nodes: g.nodes.map((n) => { const q = project(pl.frame, n); return { ...n, x: q.u, y: -q.v, z: 0 } }) }
		// a text's size is paper mm in the view (drawn × the drawing scale `k`); in a block it is real mm
		if (g.kind === 'text') return { ...g, at: { x: g.at.x, y: -g.at.y }, sizeMm: g.sizeMm * k }
		if (g.kind === 'insert' || g.kind === 'legend') return { ...g, at: { x: g.at.x, y: -g.at.y } }
		return mirrorGeometry(g, { x: 0, y: 0 }, { x: 1, y: 0 })
	}
	const shown = shapes.map((s) => ({ s, geom: view(s.geom) }))
	const pts = shown.flatMap((x) => pointsOf(x.geom))
	const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
	const c = { x: Math.round((Math.min(...xs) + Math.max(...xs)) / 2), y: Math.round((Math.min(...ys) + Math.max(...ys)) / 2) }
	const front = shown.map(({ s, geom }): BlockShape => {
		const { type: _t, groupId: _g, levelId: _l, viewId: _v, sheetId: _s, plane: _p, ...rest } = s as ShapeCore & { levelId?: Id; viewId?: Id; sheetId?: Id; plane?: unknown }
		return { ...rest, geom: moveGeometry(geom, { x: -c.x, y: -c.y }) }
	})
	return { front, width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), at: { u: c.x, v: -c.y, depth: pl.depth, frame: pl.frame } }
}

/** What "Make block" writes for shapes drawn in an elevation: the block (a NEW one named `to.name`, its plan symbol a
 *  plain box of the front's width; or `to.blockId`'s `front` replaced — your own blocks only) and the insert that
 *  replaces the shapes, placed in that elevation at the same place and height. Null = it can't be done. */
export function frontBlock(shapes: Shape[], to: { blockId: Id } | { name: string }, existing?: Block): { write: Block | { id: Id; front: BlockShape[] }; insert: Shape } | null {
	const f = frontFromShapes(shapes), owner = shapes[0]
	if (!f || !owner.levelId) return null
	if ('blockId' in to && (!existing || existing.id !== to.blockId || existing.builtin)) return null
	const write = 'blockId' in to ? { id: to.blockId, front: f.front }
		: { type: 'block', id: newId(), name: to.name, scope: 'global', shapes: [sh({ kind: 'rect', centre: { x: 0, y: 0 }, size: { x: Math.max(10, Math.round(f.width)), y: 50 } })], front: f.front } satisfies Block
	const p = unproject(f.at.frame, { u: f.at.u, v: f.at.v }, f.at.depth), n = f.at.frame.n
	const rot = Math.round((Math.atan2(-n.x, n.y) * 180) / Math.PI + 360) % 360   // its front towards the viewer, as the Insert tool places it
	const insert = { type: 'shape', id: newId(), levelId: owner.levelId, ...(owner.layerId ? { layerId: owner.layerId } : {}),
		geom: { kind: 'insert', blockId: write.id, at: { x: Math.round(p.x), y: Math.round(p.y) }, ...(rot ? { rot } : {}), ...(f.at.v ? { z: Math.round(f.at.v) } : {}), inElevations: true, frame: f.at.frame } } as Shape
	return { write, insert }
}

/**
 * Turn model shapes into a block (local mm, origin = the middle of their extent) and the insert that replaces them.
 * The caller writes the block to the library and swaps the shapes for the insert in one undo step.
 */
export function blockFromShapes(shapes: Shape[], name: string): { block: Block; insert: Shape } {
	const pts = shapes.flatMap((s) => pointsOf(s.geom))
	const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
	const c = { x: Math.round((Math.min(...xs) + Math.max(...xs)) / 2), y: Math.round((Math.min(...ys) + Math.max(...ys)) / 2) }
	const block: Block = {
		type: 'block', id: newId(), name, scope: 'global',
		shapes: shapes.map((s): BlockShape => {
			const { type: _t, groupId: _g, levelId: _l, viewId: _v, sheetId: _s, ...rest } = s as ShapeCore & { levelId?: Id; viewId?: Id; sheetId?: Id }
			return { ...rest, geom: moveGeometry(s.geom, { x: -c.x, y: -c.y }) }
		}),
	}
	const owner = shapes[0]
	const insert = { type: 'shape', id: newId(), ...(owner.levelId ? { levelId: owner.levelId } : owner.viewId ? { viewId: owner.viewId } : { sheetId: owner.sheetId! }), geom: { kind: 'insert', blockId: block.id, at: c } } as Shape
	return { block, insert }
}

/** "Explode": an insert → ordinary shapes in place (a COPIED block, edited freely afterwards), drawn as the insert was:
 *  turned, scaled (× `k`, the drawing scale, for an annotative block), with the insert's owner, layer and height, its
 *  `{TAG}` texts filled in. `k` = drawing mm per paper mm where it is drawn (a plan: PLOT_SCALE; paper: 1; a note in a
 *  viewport: the viewport's scale) — texts keep the size they were drawn at (a text's size is paper mm, drawn × k).
 *  `face` = the drawing the view shows (faceFor); `frame` = an elevation / section a level's insert is exploded in:
 *  its FRONT drawing goes onto that view's plane at the insert's height, as the view drew it. */
export function explodeInsert(ins: Shape, block: Block, k = 1, o: { face?: BlockFace; frame?: ElevFrame } = {}): Shape[] {
	if (ins.geom.kind !== 'insert') return []
	const frame = ins.levelId ? o.frame : undefined
	const b = blockFace(block, frame ? 'front' : o.face ?? 'plan')
	const { at, rot = 0, scale = 1, z } = ins.geom, s = scale * (b.annotative ? k : 1)
	const attrs = insertAttrs(block, ins.geom.attrs, ins.geom.hidden)
	const owner = ins.levelId ? { levelId: ins.levelId } : ins.viewId ? { viewId: ins.viewId } : { sheetId: ins.sheetId!, ...(ins.vpId ? { vpId: ins.vpId } : {}) }
	// on an elevation's plane: where the view drew it (its u, at its height; elevations draw inserts unturned)
	const onPlane = frame ? project(frame, { x: at.x, y: at.y, z: z ?? 0 }) : null
	return b.shapes.flatMap((bs) => {
		let g0 = bs.geom
		if (g0.kind === 'text') {
			const text = fillAttrs(g0.text, attrs)
			if (!text) return []   // a blank attribute draws nothing
			g0 = { ...g0, text }
		}
		let geom = onPlane ? placeGeometry(g0, { x: onPlane.u, y: -onPlane.v }, 0, s) : placeGeometry(g0, at, rot, s)
		if (geom.kind === 'text' && g0.kind === 'text') geom = { ...geom, sizeMm: (g0.sizeMm * s) / k }
		const base = { ...bs, type: 'shape', id: newId(), ...owner, ...(ins.layerId ? { layerId: ins.layerId } : {}) }
		if (frame && onPlane) {
			const plane = { kind: 'vertical' as const, frame, depth: onPlane.depth }
			// view mm (y down) → the plane's (u, v up); a line's nodes are model points on the plane
			if (geom.kind === 'path') return [{ ...base, plane, geom: { ...geom, nodes: geom.nodes.map((n) => ({ ...n, ...unproject(frame, { u: n.x, v: -n.y }, onPlane.depth) })) } } as Shape]
			const up = geom.kind === 'text' ? { ...geom, at: { x: geom.at.x, y: -geom.at.y } } : mirrorGeometry(geom, { x: 0, y: 0 }, { x: 1, y: 0 })
			return [{ ...base, plane, geom: up } as Shape]
		}
		const lifted = z && geom.kind === 'path' ? { ...geom, nodes: geom.nodes.map((n) => ({ ...n, z: n.z + z })) } : geom
		return [{ ...base, geom: lifted } as Shape]
	})
}
