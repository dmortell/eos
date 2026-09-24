// BLOCKS (Kestrel / AutoCAD style): a block DEFINITION is reusable 2D geometry drawn around an insertion
// point (0,0) plus ATTRIBUTE definitions; an `insert` shape places one (at `a`, rotated `rot`, scaled
// `scale`) with its own attribute values `attrs` (by tag). Changing an insert's `block` swaps the symbol and
// keeps the attributes (matched by tag) — e.g. an outlet going from rosette to wall mount to floorbox.
// Definitions live in ONE global Firestore library (`blocks/{id}`, shared by every project); this module
// is pure — the live library registers itself as the resolver (blocks.svelte.ts), tests register their own.
//
// Shapes inside a block may use the colour / fill 'byblock' — resolved from the insert (so one symbol serves
// every outlet usage colour, and low- vs high-level outlets as filled vs outline).
import type { Ent, Pt } from './geometry'

export const BYBLOCK = 'byblock'

export type AttrDef = {
	tag: string
	label: string
	default?: string
	/** Where the text sits, relative to the insertion point (mm), and its height (mm). */
	pos: Pt
	height: number
	/** false = stored and edited, never drawn (e.g. TYPE). */
	visible?: boolean
	/** Text colour: 'byblock' = the insert's colour; 'contrast' = white on a filled insert, else its colour;
	 *  unset = the normal ink (ByLayer). */
	color?: string
}

export type BlockDef = {
	id: string
	name: string
	/** Groups interchangeable blocks (an insert's block picker lists its category). */
	category?: string
	shapes: Ent[]
	attributes: AttrDef[]
	updatedAt?: string
	/** DEFAULT blocks only: bumped when the built-in geometry changes — a stored copy with a lower `rev` is
	 *  replaced by the new default on the next start (blocks.svelte.ts). */
	rev?: number
	/** ANNOTATIVE: its geometry is in PAPER mm — drawn × the viewport's scale N, so a marker / north arrow is the
	 *  same size on every sheet (like text). Otherwise model mm (an outlet, a door). */
	annotative?: boolean
}

// ── the resolver (the live library, or a test's) ──
let resolve: (id?: string) => BlockDef | undefined = () => undefined
export function setBlockResolver(fn: (id?: string) => BlockDef | undefined) { resolve = fn }
export const blockDef = (id?: string) => (id ? resolve(id) : undefined)

/** A block's geometry extent around its insertion point (shapes only; attribute text excluded). */
export function blockExtent(def: BlockDef): [number, number, number, number] {
	const xs: number[] = [], ys: number[] = []
	for (const s of def.shapes) {
		for (const p of [s.a, s.b, ...(s.pts ?? [])]) if (p) { xs.push(p[0]); ys.push(p[1]) }
	}
	if (!xs.length) return [-100, -100, 100, 100]
	return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

/** An insert's drawn scale: its own `scale`, × the viewport's paper→model factor for an annotative block. */
export const insertScale = (e: Ent, paperMm = 1) => (e.scale ?? 1) * (blockDef(e.block)?.annotative ? paperMm : 1)
/** An insert's un-rotated box in model coords (its block's extent, scaled, at the insertion point). A
 *  missing block → a 200 mm box, so it can still be picked and fixed. `paperMm` sizes an annotative block. */
export function insertBounds(e: Ent, paperMm = 1): [number, number, number, number] {
	const def = blockDef(e.block), s = insertScale(e, paperMm), [ax, ay] = e.a ?? [0, 0]
	const [x0, y0, x1, y1] = def ? blockExtent(def) : [-100, -100, 100, 100]
	return e.mirror ? [ax - x1 * s, ay + y0 * s, ax - x0 * s, ay + y1 * s] : [ax + x0 * s, ay + y0 * s, ax + x1 * s, ay + y1 * s]
}
/** D5: shapes → a new block around their extent's centre (the insertion point) — ids renumbered, their own
 *  layer / group / scope / plane dropped (an insert brings its own). Returns the block and that centre. */
export function blockFromShapes(ents: Ent[], id: string, name: string): { def: BlockDef; at: Pt } {
	const xs: number[] = [], ys: number[] = []
	for (const e of ents) for (const p of [e.a, e.b, e.leader, ...(e.pts ?? [])]) if (p) { xs.push(p[0]); ys.push(p[1]) }
	const at: Pt = xs.length ? [Math.round((Math.min(...xs) + Math.max(...xs)) / 2), Math.round((Math.min(...ys) + Math.max(...ys)) / 2)] : [0, 0]
	const mv = (p?: Pt): Pt | undefined => (p ? [p[0] - at[0], p[1] - at[1]] : undefined)
	const shapes = ents.map((e, i) => {
		const { layer: _l, groupId: _g, space: _s, plane: _p, ...rest } = e
		return { ...rest, id: `s${i + 1}`, a: mv(e.a), b: mv(e.b), leader: mv(e.leader), pts: e.pts?.map((p) => mv(p)!) } as Ent
	})
	return { def: { id, name, category: 'custom', shapes, attributes: [] }, at }
}
/** D4: an insert's link target (its LINK attribute: a sheet id, or a URL), if any. */
export const insertLink = (e: Ent) => (e.type === 'insert' && e.attrs?.LINK?.trim()) || ''

/** A block's shape as drawn for this insert: 'byblock' colour / fill replaced by the insert's. */
export function byBlock(s: Ent, ins: Ent): Ent {
	const color = s.color === BYBLOCK ? ins.color : s.color
	const fill = s.fill === BYBLOCK ? ins.fill ?? 'none' : s.fill
	return { ...s, color, fill, layer: ins.layer }
}

/** An attribute's value on an insert (falls back to the definition's default). */
export const attrValue = (ins: Ent, a: AttrDef) => ins.attrs?.[a.tag] ?? a.default ?? ''

/** The colour an attribute's text draws in (undefined = normal ink). */
export function attrColor(ins: Ent, a: AttrDef): string | undefined {
	if (a.color === BYBLOCK) return ins.color
	if (a.color === 'contrast') return ins.fill && ins.fill !== 'none' ? '#ffffff' : ins.color
	return undefined
}

// ── the default OUTLET blocks (matching the Outlets tool's symbols: rosette/box = circle + triangle, wall
// mount = triangle, floorbox = square + triangle; 200 mm "radius"). Attributes: LABEL above, PORTS inside,
// NOTE below (the Outlets tool's room field), TYPE stored only. ──
const R = 200
/** The Outlets tool's equilateral triangle (circumradius r, bbox-centred on the insertion point), moved DOWN
 *  (+y is down the page) by `down` × its height (1.5 r). `CENTRED` (1/6) puts its circumcentre on the insertion
 *  point — in the rosette its corners then touch the circle (rev 3; the wall mount matches). */
function triangle(r: number, down = 0): Pt[] {
	const dy = -r * 0.25 + down * 1.5 * r, pts: Pt[] = [90, 210, 330].map((deg) => [r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180) + dy])
	return [...pts, pts[0]]
}
const CENTRED = 1 / 6
const round = (p: Pt): Pt => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]
export const OUTLET_ATTRS: AttrDef[] = [
	{ tag: 'LABEL', label: 'Label', pos: [0, -R * 0.85], height: 120, color: undefined },
	{ tag: 'PORTS', label: 'Ports', default: '1', pos: [0, R * 0.3], height: 170, color: 'contrast' },
	{ tag: 'NOTE', label: 'Note', pos: [0, R * 1.55], height: 100 },
	{ tag: 'TYPE', label: 'Type', default: 'network', pos: [0, 0], height: 100, visible: false },
]
const shape = (id: string, s: Omit<Ent, 'id'>): Ent => ({ id, ...s })

// ── D3 the SYMBOL blocks. Markers, elevation tags and the north arrow are ANNOTATIVE (paper mm — the same size on
// every sheet); the door and faceplate are real-size (model mm). Section / detail / photo markers and elevation
// tags carry a hidden LINK attribute (D4: a sheet id or a URL; double-click opens it) ──
const S = 4   // marker radius, paper mm
const circle = (id: string, r: number, o: Partial<Ent> = {}): Ent => shape(id, { type: 'ellipse', a: [-r, -r], b: [r, r], ...o })
const tri = (id: string, pts: Pt[], o: Partial<Ent> = {}): Ent => shape(id, { type: 'polyline', pts: [...pts, pts[0]], color: BYBLOCK, fill: '#1f2937', ...o })
const LINK: AttrDef = { tag: 'LINK', label: 'Links to', pos: [0, 0], height: 1, visible: false }
const MARKER_ATTRS: AttrDef[] = [
	{ tag: 'REF', label: 'Ref', default: 'A', pos: [0, -S * 0.2], height: 2.2 },
	{ tag: 'SHEET', label: 'Sheet', default: '—', pos: [0, S * 0.62], height: 1.7 },
	LINK,
]
/** An elevation tag's arm pointing along `deg` (0 = east / right, 90 = south / down). */
function arm(deg: number): Pt[] {
	const r = (d: number) => (d * Math.PI) / 180, a = r(deg)
	return ([[Math.cos(a) * S * 1.55, Math.sin(a) * S * 1.55], [Math.cos(a + r(40)) * S, Math.sin(a + r(40)) * S], [Math.cos(a - r(40)) * S, Math.sin(a - r(40)) * S]] as Pt[]).map(round)
}
const ARM_DEG = [270, 0, 90, 180]   // N, E, S, W
const elevTag = (n: number): BlockDef => ({
	id: `eltag-${n}`, name: `Elevation tag — ${n} arm${n > 1 ? 's' : ''}`, category: 'eltag', rev: 2, annotative: true,
	shapes: [circle('c', S, { color: BYBLOCK }), ...ARM_DEG.slice(0, n).map((d, i) => tri(`a${i}`, arm(d)))],
	attributes: [
		{ tag: 'REF', label: 'Ref', default: '1', pos: [0, S * 0.22], height: 2.4 },
		...ARM_DEG.slice(0, n).map((d, i): AttrDef => ({ tag: `R${i + 1}`, label: `Arm ${'NESW'[i]}`, default: '', pos: round([Math.cos((d * Math.PI) / 180) * S * 1.95, Math.sin((d * Math.PI) / 180) * S * 1.95 + 0.7]), height: 1.6 })),
		LINK,
	],
})
export const SYMBOL_BLOCKS: BlockDef[] = [
	{ id: 'north-arrow', name: 'North arrow', category: 'north', rev: 2, annotative: true, attributes: [{ tag: 'N', label: 'Letter', default: 'N', pos: [0, -S * 1.25], height: 2.5 }],
		shapes: [circle('c', S, { color: BYBLOCK }), tri('a', [[0, -S * 0.95], [S * 0.45, S * 0.6], [0, S * 0.3]]), shape('b', { type: 'polyline', pts: ([[0, -S * 0.95], [-S * 0.45, S * 0.6], [0, S * 0.3]] as Pt[]).map(round), color: BYBLOCK })] },
	{ id: 'section-mark', name: 'Section marker', category: 'marker', rev: 2, annotative: true, attributes: MARKER_ATTRS,
		shapes: [circle('c', S, { color: BYBLOCK }), shape('l', { type: 'polyline', pts: [[-S, 0], [S, 0]], color: BYBLOCK }), tri('a', [[S * 1.6, 0], [S, -S * 0.45], [S, S * 0.45]])] },
	{ id: 'detail-mark', name: 'Detail marker', category: 'marker', rev: 2, annotative: true, attributes: MARKER_ATTRS,
		shapes: [circle('c', S, { color: BYBLOCK }), shape('l', { type: 'polyline', pts: [[-S, 0], [S, 0]], color: BYBLOCK })] },
	{ id: 'photo-mark', name: 'Photo marker', category: 'marker', rev: 2, annotative: true,
		attributes: [{ tag: 'REF', label: 'Photo №', default: '1', pos: [0, S * 0.18], height: 1.9, color: 'contrast' }, LINK],
		shapes: [tri('v', [[S * 0.4, -S * 0.2], [S * 1.5, -S * 0.75], [S * 1.5, S * 0.75]], { fill: 'none' }), circle('c', S * 0.6, { color: BYBLOCK, fill: '#1f2937' })] },
	...[1, 2, 3, 4].map(elevTag),
	{ id: 'faceplate', name: 'Faceplate (2 ports)', category: 'faceplate', rev: 2, attributes: [{ tag: 'LABEL', label: 'Label', pos: [0, -64], height: 11 }],   // real size, 70 × 115 mm
		shapes: [shape('f', { type: 'rect', a: [-35, -57.5], b: [35, 57.5], color: BYBLOCK }), shape('p1', { type: 'rect', a: [-16, -33], b: [16, -4], color: BYBLOCK }), shape('p2', { type: 'rect', a: [-16, 4], b: [16, 33], color: BYBLOCK })] },
	{ id: 'door', name: 'Door (swing)', category: 'door', rev: 1, attributes: [],
		shapes: [shape('leaf', { type: 'polyline', pts: [[0, 0], [0, -900]], color: BYBLOCK }),
			shape('arc', { type: 'polyline', pts: Array.from({ length: 13 }, (_, i) => { const t = (i / 12) * (Math.PI / 2); return round([Math.sin(t) * 900, -Math.cos(t) * 900]) }), color: BYBLOCK, dash: 'dashed' })] },
]
/** The built-in blocks: the outlet symbols, then the D3 symbols (SYMBOL_BLOCKS, appended below). */
export const DEFAULT_BLOCKS: BlockDef[] = [
	{
		id: 'outlet-box', name: 'Outlet — rosette / box', category: 'outlet', attributes: OUTLET_ATTRS, rev: 3,
		shapes: [
			shape('c', { type: 'ellipse', a: [-R * 0.75, -R * 0.75], b: [R * 0.75, R * 0.75], color: BYBLOCK, fill: BYBLOCK }),
			shape('t', { type: 'polyline', pts: triangle(R * 0.75, CENTRED).map(round), color: BYBLOCK }),
		],
	},
	{
		id: 'outlet-wall', name: 'Outlet — wall mount', category: 'outlet', attributes: OUTLET_ATTRS, rev: 3,
		shapes: [shape('t', { type: 'polyline', pts: triangle(R * 0.9, CENTRED).map(round), color: BYBLOCK, fill: BYBLOCK })],
	},
	{
		id: 'outlet-floor', name: 'Outlet — floorbox', category: 'outlet', attributes: OUTLET_ATTRS,
		shapes: [
			shape('s', { type: 'rect', a: [-R * 0.707, -R * 0.707].map(Math.round) as Pt, b: [R * 0.707, R * 0.707].map(Math.round) as Pt, color: BYBLOCK, fill: BYBLOCK }),
			shape('t', { type: 'polyline', pts: triangle(R * 0.8).map(round), color: BYBLOCK }),
		],
	},
	...SYMBOL_BLOCKS,
]
