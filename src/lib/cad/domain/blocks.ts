// Blocks (ADR 0007): a named list of ordinary shapes in local mm, placed by an insert shape or drawing an outlet.
// GLOBAL only (User, 2026-10-02 — no per-project blocks): the built-ins below live in code; blocks people make live in
// one global doc (`settings/cadBlocks`). ANNOTATIVE blocks (outlet symbols) are drawn in paper mm, so they keep their
// printed size at any scale; others are real model mm (a desk, a rack shelf item).
import type { Id, Pt, Outlet } from './types'
import type { BlockDef, Sheet } from './drawing'
import type { ShapeCore, Shape, Geometry } from './shapes'
import { moveGeometry, ellipsePts, placeGeometry, mirrorGeometry, sameFrame } from './shapes'
import { project, unproject, type ElevFrame } from './conventions'
import { newId } from './ids'

/** The `{TAG}`s that are DATA fields (drawing fields, filled from the project), not block attributes an insert fills. */
export const DATA_FIELDS = ['PROJECT', 'BUILDING', 'LEVEL', 'SHEET', 'SHEET_TITLE', 'DATE'] as const
/** Is this `{TAG}` a data field (not a block attribute an insert fills)? */
export const isDataField = (tag: string) => (DATA_FIELDS as readonly string[]).includes(tag) || tag.startsWith('COUNT:')

export type BlockShape = BlockDef['shapes'][number]
/** A 2D block is ONE drawing (User 2026-10-14): every view draws it the same — a plan, an elevation, a section, a sheet
 *  — and an insert shows only in the view it was placed in. */
export type Block = BlockDef & { annotative?: boolean; builtin?: boolean }
/** A stored block from before 2026-10-14 may still carry a separate `front` drawing (block-front authoring, since
 *  dropped): that drawing becomes the block's only one, in real mm. */
export function oneDrawing(b: Block & { front?: BlockShape[] }): Block {
	if (!b.front) return b
	const { front, ...rest } = b
	return { ...rest, shapes: front, annotative: false }
}
/** A 3D block (User 2026-10-14: furniture drawn with the Box tool): it has a box — a region with a height. Its inserts
 *  are model: they show in every plan, elevation and section, seen from that direction (`placed3d`). */
export const is3d = (b: Block): boolean => b.shapes.some((s) => (s.extent ?? 0) > 0)
/** How far a block reaches behind its insert point (local −y, mm ≥ 0), labels left out: a 3D block dropped on a wall
 *  in an elevation stands with its back there (User 2026-10-14), not with its middle in the wall. */
export const backOf = (b: Block): number => -Math.min(0, ...b.shapes.filter((s) => !isLabel(s)).flatMap((s) => pointsOf(s.geom)).map((p) => p.y))
/** A text that is a label (`{TAG}`s, filled from the insert's attributes): shown in every view, facing the viewer. */
export const isLabel = (s: BlockShape): boolean => s.geom.kind === 'text' && /\{[A-Z_]+\}/.test(s.geom.text)

/**
 * A 3D block's insert as model shapes on its level: each block shape moved to the insert's point, turned and scaled as
 * it is, lifted by its Z (a region's plane, a line's nodes), its `{TAG}` texts filled. They all carry the INSERT's id
 * (they draw and pick as the insert) and its layer. The views draw them like any box / line (views/plan.ts, elevation.ts).
 */
export function placed3d(ins: Shape, b: Block): Shape[] {
	if (ins.geom.kind !== 'insert' || !ins.levelId) return []
	const { at, rot = 0, scale = 1, z = 0 } = ins.geom, attrs = insertAttrs(b, ins.geom.attrs, ins.geom.hidden)
	return b.shapes.flatMap((bs): Shape[] => {
		let g = placeGeometry(bs.geom, at, rot, scale)
		if (g.kind === 'text') { const text = fillAttrs(g.text, attrs); if (!text) return []; g = { ...g, text } }
		if (g.kind === 'path') g = { ...g, nodes: g.nodes.map((n) => ({ ...n, z: n.z + z })) }
		const lift = g.kind === 'path' ? {} : { plane: { kind: 'plan' as const, z: (bs.plane?.kind === 'plan' ? bs.plane.z : 0) + z } }
		return [{ ...bs, ...lift, type: 'shape', id: ins.id, levelId: ins.levelId, ...(ins.layerId ? { layerId: ins.layerId } : {}), geom: g } as Shape]
	})
}
/** Is this block drawn in paper mm (annotative)? Only built-in symbols are; blocks people make from model shapes are
 *  real mm. For code with no block library at hand (untying a note from a viewport). */
export const annotativeIn = (blockId: Id): boolean => !!BUILTIN_BLOCKS.find((x) => x.id === blockId)?.annotative

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
// the number of ports in the MIDDLE of the symbol (User: "port numbers should be shown in the center of the outlet";
// it was to the right) — centred on (0, cy), white on a filled symbol, dark with a halo on an outline one
const ports = (sizeMm = 1.2, cy = 0): BlockShape => sh({ kind: 'text', at: { x: 0, y: cy + sizeMm * 0.35 }, text: '{PORTS}', sizeMm, align: 'centre' })

/** The built-in outlet symbols (paper mm, centred on the outlet). */
export const BUILTIN_BLOCKS: Block[] = [
	{ type: 'block', id: 'builtin:outlet-floor', name: 'Outlet - floor box', scope: 'global', category: 'outlet', annotative: true, builtin: true,
		shapes: [sh({ kind: 'rect', centre: { x: 0, y: 0 }, size: { x: 3, y: 3 } }), sh({ kind: 'circle', centre: { x: 0, y: 0 }, r: 1.5 }, solid), label, usage, ports(1.1)] },
	{ type: 'block', id: 'builtin:outlet-wall', name: 'Outlet - wall', scope: 'global', category: 'outlet', annotative: true, builtin: true,
		shapes: [sh({ kind: 'polygon', pts: [{ x: -1.6, y: -1.2 }, { x: 1.6, y: -1.2 }, { x: 0, y: 1.5 }] }, solid), label, usage, ports(1.2, -0.3)] },
	{ type: 'block', id: 'builtin:outlet-box', name: 'Outlet - box', scope: 'global', category: 'outlet', annotative: true, builtin: true,
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

/** Drawing symbols (backlog "Markup kinds" part 5, User 2026-10-09: datum, detail and elevation tags — no north
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
			shapes: [pointer(0),
				sh({ kind: 'circle', centre: { x: 0, y: 0 }, r: 4 }), seg(-4, 0, 4, 0), text(0, -0.9, '{NUMBER}', 2.2), text(0, 2.8, '{ON_SHEET}', 1.8)] },
		// ── User 2026-10-15 (drawn from his samples in Section C) ──
		// a level marker as elevations show it: the line runs in from the left to a quartered target; the name above the line
		// and the height below it, both ending at the target
		{ type: 'block', id: 'builtin:level-marker', name: 'Level marker (elevation)', scope: 'global', category: 'symbol', annotative: true, builtin: true,
			attrs: [{ tag: 'NAME', label: 'Name', default: 'FLOOR 1F' }, { tag: 'HEIGHT', label: 'Height', default: 'FL±0' }],
			shapes: [seg(-24, 0, 1.6, 0), sh({ kind: 'circle', centre: { x: 0, y: 0 }, r: 1.6 }), quarter(1.6, 180), quarter(1.6, 0), right(-2.6, -0.8, '{NAME}', 2), right(-2.6, 2.9, '{HEIGHT}', 2)] },
		// a 4-way interior elevation marker: the sheet the elevations are on in the circle, a pointer each way with its name
		{ type: 'block', id: 'builtin:elevation-marker-4', name: 'Elevation marker (4-way)', scope: 'global', category: 'symbol', annotative: true, builtin: true,
			attrs: [{ tag: 'ON_SHEET', label: 'On sheet', default: 'A-201' }, { tag: 'UP', label: 'Up', default: 'A' }, { tag: 'RIGHT', label: 'Right', default: 'B' }, { tag: 'DOWN', label: 'Down', default: 'C' }, { tag: 'LEFT', label: 'Left', default: 'D' }],
			shapes: [pointer(0), pointer(90), pointer(180), pointer(270), sh({ kind: 'circle', centre: { x: 0, y: 0 }, r: 4 }), text(0, 0.7, '{ON_SHEET}', 1.8),
				text(0, -8.6, '{UP}', 2), text(8.6, 0.7, '{RIGHT}', 2, 'left'), text(0, 10.6, '{DOWN}', 2), right(-8.6, 0.7, '{LEFT}', 2)] },
		// break lines: where a drawing is cut short — straight (a zigzag in the line) and round (a pipe or duct: an S)
		{ type: 'block', id: 'builtin:break-straight', name: 'Break line - straight', scope: 'global', category: 'symbol', annotative: true, builtin: true,
			shapes: [poly([[-15, 0], [-1.5, 0], [-0.75, -2.5], [0.75, 2.5], [1.5, 0], [15, 0]])] },
		{ type: 'block', id: 'builtin:break-round', name: 'Break line - round (pipe / duct)', scope: 'global', category: 'symbol', annotative: true, builtin: true,
			shapes: [poly([...arc(0, -1.5, 1.5, -90, 90), ...arc(0, 1.5, 1.5, -90, -270)])] },
		// the centreline mark (℄): an L over a C, set at the end of a centreline (a dash-dot line)
		{ type: 'block', id: 'builtin:centreline', name: 'Centreline mark', scope: 'global', category: 'symbol', annotative: true, builtin: true,
			shapes: [poly(arc(0, 0, 2, 45, 315)), poly([[-0.4, -3], [-0.4, 3], [2.6, 3]])] },
	]
}
/** A pointer on the 4 mm bubble's edge (its base follows the arc), towards `deg` (0 = up, clockwise). */
function pointer(deg: number): BlockShape {
	const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
	const turn = (p: Pt) => ({ x: Math.round((p.x * c - p.y * s) * 1000) / 1000, y: Math.round((p.x * s + p.y * c) * 1000) / 1000 })
	return sh({ kind: 'polygon', pts: [...Array.from({ length: 9 }, (_, i) => { const t = ((-130 + i * 10) * Math.PI) / 180; return { x: 4 * Math.cos(t), y: 4 * Math.sin(t) } }), { x: 0, y: -7.5 }].map(turn) }, solid)
}
/** Text ending at x (right-aligned). */
function right(x: number, y: number, t: string, sizeMm: number): BlockShape { return sh({ kind: 'text', at: { x, y }, text: t, sizeMm, align: 'right' }) }
/** An open polyline through [x, y] points. */
function poly(pts: [number, number][]): BlockShape {
	const nodes = pts.map(([x, y]) => ({ id: newId(), x, y, z: 0 }))
	return sh({ kind: 'path', nodes, segs: nodes.slice(1).map((n, i) => ({ id: newId(), a: nodes[i].id, b: n.id })) })
}
/** Points along an arc (degrees, 0 = +x, y down = clockwise on paper), every 15°. */
function arc(cx: number, cy: number, r: number, from: number, to: number): [number, number][] {
	const n = Math.max(2, Math.round(Math.abs(to - from) / 15))
	return Array.from({ length: n + 1 }, (_, i) => { const a = ((from + ((to - from) * i) / n) * Math.PI) / 180; return [Math.round((cx + r * Math.cos(a)) * 1000) / 1000, Math.round((cy + r * Math.sin(a)) * 1000) / 1000] as [number, number] })
}

/** Data / power faceplates, single / dual gang: the plate from the front, real mm (one drawing, User 2026-10-14). */
function faceplates(): Block[] {
	const make = (id: string, name: string, shapes: BlockShape[]): Block => ({ type: 'block', id, name, scope: 'global', category: 'outlet', builtin: true, shapes })
	return [
		make('builtin:faceplate-data-1', 'Faceplate - data, single', plateFront([0], rj45)),
		make('builtin:faceplate-data-2', 'Faceplate - data, dual', plateFront([-22, 22], rj45)),
		make('builtin:faceplate-power-1', 'Faceplate - power, single', plateFront([0], power)),
		make('builtin:faceplate-power-2', 'Faceplate - power, dual', plateFront([-22, 22], power)),
	]
}

/** A faceplate (User 2026-10-12): a 70 × 115 mm plate, a 50 × 90 mm frame for the sockets, and a socket centred at
 *  each y in `cys` (one above the other). Real mm. */
function plateFront(cys: number[], socket: (cy: number) => BlockShape[]): BlockShape[] {
	return [sh({ kind: 'rect', centre: { x: 0, y: 0 }, size: { x: 70, y: 115 } }), sh({ kind: 'rect', centre: { x: 0, y: 0 }, size: { x: 50, y: 90 } }), ...cys.flatMap(socket)]
}
/** A power socket: two short upright lines for its prongs over a circle for its earth. */
function power(cy: number): BlockShape[] { return [seg(-6.35, cy - 9, -6.35, cy - 1), seg(6.35, cy - 9, 6.35, cy - 1), sh({ kind: 'circle', centre: { x: 0, y: cy + 6 }, r: 2.5 })] }
/** A data socket: a small rectangle for its RJ45 jack. */
function rj45(cy: number): BlockShape[] { return [sh({ kind: 'rect', centre: { x: 0, y: cy }, size: { x: 14, y: 12 } })] }

/** The block that draws an outlet when it names none: by usage, then mount (a wall outlet is a wall faceplate whatever
 *  feeds it — W11: a high wall outlet said "Auto: Outlet – ceiling"), then tier: a HIGH "floor" outlet is a ceiling one
 *  (imported high ports come in as floor, the default mount). */
export function defaultOutletBlock(o: Pick<Outlet, 'mount' | 'tier' | 'usage'>): Id {
	if (o.usage === 'AP') return 'builtin:ap'
	if (o.mount === 'wall') return 'builtin:outlet-wall'
	if (o.tier === 'high' || o.mount === 'ceiling') return 'builtin:outlet-ceiling'
	if (o.mount === 'floor') return 'builtin:outlet-floor'
	return 'builtin:outlet-box'
}

/** `{LABEL}`-style placeholders → values (unknown tags stay as written). */
export function fillAttrs(text: string, attrs: Record<string, string>): string {
	return text.replace(/\{([A-Z_]+)\}/g, (m, k: string) => attrs[k] ?? m)
}

export const outletAttrs = (o: Outlet): Record<string, string> => ({ LABEL: o.label, PORTS: String(o.ports.length), USAGE: o.usage })

/** An INSERT's attributes: every `{TAG}` in the block blank unless the insert sets it (an outlet symbol placed as a
 *  plain block — a power faceplate — has no label / ports / usage to show; User, A009). */
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
	// sheet shapes: from one sheet, and all tied to the same viewport or all untied (their units differ)
	const f = shapes[0]
	if (f && shapes.some((s) => s.sheetId !== f.sheetId || s.vpId !== f.vpId || !!s.levelId !== !!f.levelId)) return 'Make block takes shapes from one place — pick ones on the same sheet and viewport (or all on a plan)'
	return null
}

/** The scale an UNTIED sheet shape's block is made at: the sheet's first viewport (1:N → the block is N x the paper
 *  drawing, model mm), or null when it has none (the block is paper size). Tied shapes are in model mm already. */
export function paperBlockScale(shapes: Shape[], sheet: Sheet | undefined): number | null {
	if (!shapes.length || !shapes[0].sheetId || shapes[0].vpId) return null
	return sheet?.viewports[0]?.scale ?? null
}

function scaleGeometry(g: Geometry, k: number): Geometry {
	const m = (p: Pt): Pt => ({ x: p.x * k, y: p.y * k })
	switch (g.kind) {
		case 'path': return { ...g, nodes: g.nodes.map((n) => ({ ...n, ...m(n) })) }
		case 'text': return { ...g, at: m(g.at), ...(g.width ? { width: g.width * k } : {}) }
		case 'leader': case 'cloud': case 'polygon': return { ...g, pts: g.pts.map(m) }
		case 'rect': case 'image': return { ...g, centre: m(g.centre), size: { x: g.size.x * k, y: g.size.y * k } }
		case 'ellipse': return { ...g, centre: m(g.centre), rx: g.rx * k, ry: g.ry * k }
		case 'circle': case 'arc': return { ...g, centre: m(g.centre), r: g.r * k }
		case 'dimension': return { ...g, a: m(g.a), b: m(g.b), offset: g.offset * k, ...(g.textAt ? { textAt: m(g.textAt) } : {}) }
		case 'insert': case 'legend': return { ...g, at: m(g.at) }
	}
}

/** Why these shapes can't become a block made in an elevation, or null: they must lie on the plane of ONE elevation or
 *  section (what you draw in an elevation), and not be blocks themselves. */
export function elevationProblem(shapes: Shape[]): string | null {
	if (!shapes.length) return 'Select the shapes drawn in the elevation first'
	if (shapes.some((s) => s.geom.kind === 'insert' || s.geom.kind === 'legend')) return 'A block is made of drawn shapes, not blocks or legends'
	const planes = shapes.map((s) => (s.plane?.kind === 'vertical' ? s.plane : null))
	if (planes.some((p) => !p)) return 'Those shapes aren’t all drawn in an elevation or section'
	const first = planes[0]!
	if (planes.some((p) => !sameFrame(p!.frame, first.frame))) return 'Those shapes are in different elevations — pick ones from one view'
	return null
}

/**
 * A block's drawing from shapes drawn in an elevation or section: real mm, y down, origin = the middle of their extent
 * (as Make block on a plan). `at` says where that middle is in the view — its u along the elevation, its height v and
 * the plane's depth — so the insert that replaces them goes back to the same place.
 */
export function elevationShapes(shapes: Shape[], k = 100): { shapes: BlockShape[]; width: number; height: number; at: { u: number; v: number; depth: number; frame: ElevFrame } } | null {
	if (elevationProblem(shapes)) return null
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
	const out = shown.map(({ s, geom }): BlockShape => {
		const { type: _t, groupId: _g, levelId: _l, viewId: _v, sheetId: _s, plane: _p, ...rest } = s as ShapeCore & { levelId?: Id; viewId?: Id; sheetId?: Id; plane?: unknown }
		return { ...rest, geom: moveGeometry(geom, { x: -c.x, y: -c.y }) }
	})
	return { shapes: out, width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), at: { u: c.x, v: -c.y, depth: pl.depth, frame: pl.frame } }
}

/** What "Make block" writes for shapes drawn in an elevation: a new block named `name` (real mm) and the insert that
 *  replaces the shapes, placed in that elevation at the same place and height (shown only there). Null = it can't. */
export function elevationBlock(shapes: Shape[], name: string): { block: Block; insert: Shape } | null {
	const f = elevationShapes(shapes), owner = shapes[0]
	if (!f || !owner.levelId) return null
	const block: Block = { type: 'block', id: newId(), name, scope: 'global', shapes: f.shapes }
	const p = unproject(f.at.frame, { u: f.at.u, v: f.at.v }, f.at.depth), n = f.at.frame.n
	const rot = Math.round((Math.atan2(-n.x, n.y) * 180) / Math.PI + 360) % 360   // facing the viewer, as the Insert tool places it
	const insert = { type: 'shape', id: newId(), levelId: owner.levelId, ...(owner.layerId ? { layerId: owner.layerId } : {}),
		geom: { kind: 'insert', blockId: block.id, at: { x: Math.round(p.x), y: Math.round(p.y) }, ...(rot ? { rot } : {}), ...(f.at.v ? { z: Math.round(f.at.v) } : {}), inElevations: true, frame: f.at.frame } } as Shape
	return { block, insert }
}

/**
 * Turn model shapes into a block (local mm, origin = the middle of their extent) and the insert that replaces them.
 * The caller writes the block to the library and swaps the shapes for the insert in one undo step.
 */
export function blockFromShapes(shapes: Shape[], name: string, paperScale?: number | null): { block: Block; insert: Shape } {
	const pts = shapes.flatMap((s) => pointsOf(s.geom))
	const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
	const c = { x: Math.round((Math.min(...xs) + Math.max(...xs)) / 2), y: Math.round((Math.min(...ys) + Math.max(...ys)) / 2) }
	// boxes among them (a desk): a 3D block, its heights from the lowest one's bottom — the insert keeps that height
	const solid = shapes.some((s) => (s.extent ?? 0) > 0)
	const zOf = (s: Shape) => (s.geom.kind === 'path' ? Math.min(...s.geom.nodes.map((n) => n.z)) : s.plane?.kind === 'plan' ? s.plane.z : 0)
	const base = solid ? Math.min(...shapes.map(zOf)) : 0
	const block: Block = {
		type: 'block', id: newId(), name, scope: 'global', ...(solid ? { category: 'furniture' } : {}),
		shapes: shapes.map((s): BlockShape => {
			const { type: _t, groupId: _g, levelId: _l, viewId: _v, sheetId: _s, ...rest } = s as ShapeCore & { levelId?: Id; viewId?: Id; sheetId?: Id }
			const g = moveGeometry(s.geom, { x: -c.x, y: -c.y, z: -base })
			const plane = base && rest.plane?.kind === 'plan' ? { plane: { ...rest.plane, z: rest.plane.z - base } } : {}
			return { ...rest, ...plane, geom: paperScale ? scaleGeometry(g, paperScale) : g }   // untied paper shapes: the block is at model size
		}),
	}
	const owner = shapes[0]
	const insert = { type: 'shape', id: newId(), ...(owner.levelId ? { levelId: owner.levelId } : owner.viewId ? { viewId: owner.viewId } : { sheetId: owner.sheetId!, ...(owner.vpId ? { vpId: owner.vpId } : {}) }), ...(owner.layerId ? { layerId: owner.layerId } : {}),
		geom: { kind: 'insert', blockId: block.id, at: c, ...(paperScale ? { scale: 1 / paperScale } : {}), ...(base ? { z: base } : {}) } } as Shape
	return { block, insert }
}

/** "Explode": an insert → ordinary shapes in place (a COPIED block, edited freely afterwards), drawn as the insert was:
 *  turned, scaled (× `k`, the drawing scale, for an annotative block), with the insert's owner, layer and height, its
 *  `{TAG}` texts filled in. `k` = drawing mm per paper mm where it is drawn (a plan: PLOT_SCALE; paper: 1; a note in a
 *  viewport: the viewport's scale) — texts keep the size they were drawn at (a text's size is paper mm, drawn × k).
 *  `frame` = an elevation / section a level's insert is exploded in: its drawing goes onto that view's plane at the
 *  insert's height, as the view drew it. */
export function explodeInsert(ins: Shape, block: Block, k = 1, o: { frame?: ElevFrame } = {}): Shape[] {
	if (ins.geom.kind !== 'insert') return []
	// a 3D block: its boxes and lines back in the model where they stand (the same in every view)
	if (is3d(block) && ins.levelId) return placed3d(ins, block).map((s) => ({ ...s, id: newId() }))
	const frame = ins.levelId ? o.frame : undefined
	const b = block
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
