// Blocks (ADR 0007): a named list of ordinary shapes in local mm, placed by an insert shape or drawing an outlet.
// GLOBAL only (Dave, 2026-10-02 — no per-project blocks): the built-ins below live in code; blocks people make live in
// one global doc (`settings/cadBlocks`). ANNOTATIVE blocks (outlet symbols) are drawn in paper mm, so they keep their
// printed size at any scale; others are real model mm (a desk, a rack shelf item).
import type { Id, Pt, Outlet } from './types'
import type { BlockDef } from './drawing'
import type { ShapeCore, Shape, Geometry } from './shapes'
import { moveGeometry } from './shapes'
import { newId } from './ids'

export type BlockShape = BlockDef['shapes'][number]
export type Block = BlockDef & { annotative?: boolean; builtin?: boolean }

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

/** The built-in outlet symbols (paper mm, centred on the outlet). */
export const BUILTIN_BLOCKS: Block[] = [
	{ type: 'block', id: 'builtin:outlet-floor', name: 'Outlet - floor box', scope: 'global', category: 'outlet', annotative: true, builtin: true,
		shapes: [sh({ kind: 'rect', centre: { x: 0, y: 0 }, size: { x: 3, y: 3 } }), sh({ kind: 'circle', centre: { x: 0, y: 0 }, r: 0.9 }, solid), label, usage] },
	{ type: 'block', id: 'builtin:outlet-wall', name: 'Outlet - wall', scope: 'global', category: 'outlet', annotative: true, builtin: true,
		shapes: [sh({ kind: 'polygon', pts: [{ x: -1.6, y: -1.2 }, { x: 1.6, y: -1.2 }, { x: 0, y: 1.5 }] }, solid), label, usage] },
	{ type: 'block', id: 'builtin:outlet-box', name: 'Outlet - desk/box', scope: 'global', category: 'outlet', annotative: true, builtin: true,
		shapes: [sh({ kind: 'circle', centre: { x: 0, y: 0 }, r: 1.5 }, solid), label, usage] },
	{ type: 'block', id: 'builtin:outlet-ceiling', name: 'Outlet - ceiling', scope: 'global', category: 'outlet', annotative: true, builtin: true,
		shapes: [sh({ kind: 'circle', centre: { x: 0, y: 0 }, r: 1.5 }), seg(-1.06, -1.06, 1.06, 1.06), seg(1.06, -1.06, -1.06, 1.06), label, usage] },
	// the AP symbol already reads "AP", so no usage line
	{ type: 'block', id: 'builtin:ap', name: 'Wireless AP', scope: 'global', category: 'outlet', annotative: true, builtin: true,
		shapes: [sh({ kind: 'circle', centre: { x: 0, y: 0 }, r: 1.8 }), sh({ kind: 'text', at: { x: 0, y: 0.6 }, text: 'AP', sizeMm: 1.4, align: 'centre' }), label] },
]

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

// ── Make a block from shapes ─────────────────────────────────────────────────────────────────────────────────────

function pointsOf(g: Geometry): Pt[] {
	switch (g.kind) {
		case 'path': return g.nodes
		case 'rect': return [{ x: g.centre.x - g.size.x / 2, y: g.centre.y - g.size.y / 2 }, { x: g.centre.x + g.size.x / 2, y: g.centre.y + g.size.y / 2 }]
		case 'circle': case 'arc': return [{ x: g.centre.x - g.r, y: g.centre.y - g.r }, { x: g.centre.x + g.r, y: g.centre.y + g.r }]
		case 'polygon': case 'leader': case 'cloud': return g.pts
		case 'text': case 'insert': return [g.at]
		case 'dimension': return [g.a, g.b]
		case 'image': return [g.centre]
	}
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

/** "Explode": an insert → ordinary shapes in place (a COPIED block, edited freely afterwards). */
export function explodeInsert(ins: Shape, block: Block): Shape[] {
	if (ins.geom.kind !== 'insert') return []
	const { at } = ins.geom
	return block.shapes.map((s) => ({ ...s, type: 'shape', id: newId(), ...(ins.levelId ? { levelId: ins.levelId } : {}), geom: moveGeometry(s.geom, at) }) as Shape)
}
