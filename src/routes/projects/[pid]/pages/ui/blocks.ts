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

/** An insert's un-rotated box in model coords (its block's extent, scaled, at the insertion point). A
 *  missing block → a 200 mm box, so it can still be picked and fixed. */
export function insertBounds(e: Ent): [number, number, number, number] {
	const def = blockDef(e.block), s = e.scale ?? 1, [ax, ay] = e.a ?? [0, 0]
	const [x0, y0, x1, y1] = def ? blockExtent(def) : [-100, -100, 100, 100]
	return [ax + x0 * s, ay + y0 * s, ax + x1 * s, ay + y1 * s]
}

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
/** The Outlets tool's equilateral triangle (circumradius r, bbox-centred on the insertion point). */
function triangle(r: number): Pt[] {
	const dy = -r * 0.25, pts: Pt[] = [90, 210, 330].map((deg) => [r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180) + dy])
	return [...pts, pts[0]]
}
const round = (p: Pt): Pt => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]
export const OUTLET_ATTRS: AttrDef[] = [
	{ tag: 'LABEL', label: 'Label', pos: [0, -R * 0.85], height: 120, color: undefined },
	{ tag: 'PORTS', label: 'Ports', default: '1', pos: [0, R * 0.3], height: 170, color: 'contrast' },
	{ tag: 'NOTE', label: 'Note', pos: [0, R * 1.55], height: 100 },
	{ tag: 'TYPE', label: 'Type', default: 'network', pos: [0, 0], height: 100, visible: false },
]
const shape = (id: string, s: Omit<Ent, 'id'>): Ent => ({ id, ...s })
export const DEFAULT_BLOCKS: BlockDef[] = [
	{
		id: 'outlet-box', name: 'Outlet — rosette / box', category: 'outlet', attributes: OUTLET_ATTRS,
		shapes: [
			shape('c', { type: 'ellipse', a: [-R * 0.75, -R * 0.75], b: [R * 0.75, R * 0.75], color: BYBLOCK, fill: BYBLOCK }),
			shape('t', { type: 'polyline', pts: triangle(R * 0.75).map(round), color: BYBLOCK }),
		],
	},
	{
		id: 'outlet-wall', name: 'Outlet — wall mount', category: 'outlet', attributes: OUTLET_ATTRS,
		shapes: [shape('t', { type: 'polyline', pts: triangle(R * 0.9).map(round), color: BYBLOCK, fill: BYBLOCK })],
	},
	{
		id: 'outlet-floor', name: 'Outlet — floorbox', category: 'outlet', attributes: OUTLET_ATTRS,
		shapes: [
			shape('s', { type: 'rect', a: [-R * 0.707, -R * 0.707].map(Math.round) as Pt, b: [R * 0.707, R * 0.707].map(Math.round) as Pt, color: BYBLOCK, fill: BYBLOCK }),
			shape('t', { type: 'polyline', pts: triangle(R * 0.8).map(round), color: BYBLOCK }),
		],
	},
]
