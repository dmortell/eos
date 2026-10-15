// The SHAPE tool (backlog "Markup kinds" part 1, "Regular polygons"; User 2026-10-05): a RECTANGLE (corner to
// corner), an ELLIPSE (in that box) or a regular POLYGON (centre, then a corner — or an edge's middle when
// circumscribed), or an ARC through three clicks (start, a point on it, end). Click-click or press-drag-release; Shift =
// a square / a circle / the polygon turned in 15° steps.
// Where it lands:
//  - a plan: the level's model, in plan mm (on the current layer);
//  - an elevation / section: the level's model, ON the view's vertical plane at the work depth, points in (u, z);
//  - a sheet: the paper — or, started inside a viewport, tied to it in its view mm (it follows the viewport).
import type { Tool, ToolCtx, PointerIn } from './tools'
import type { Pt } from '../domain/types'
import type { Shape, Geometry } from '../domain/shapes'
import type { Sheet } from '../domain/drawing'
import type { Prim } from '../views/display'
import { outlineOf, arcThrough, arcPts } from '../domain/shapes'
import { newId } from '../domain/ids'
import { styleProp } from '../domain/shapeDefaults'
import { fromPaper, viewportAt } from '../views/sheet'
import { angleStep, squareCorner } from './constrain'
import { unproject, frameRot } from '../domain/conventions'

export type ShapeKind = 'rect' | 'ellipse' | 'polygon' | 'image' | 'arc'
export interface ShapeOpts { kind: ShapeKind; sides: number; inscribed: boolean; /** the Box tool: its height (extent) and base Z, mm */ height?: number; z?: number
	/** the Box tool in an elevation / section: how deep it is (front to back, away from the viewer), mm */ depth?: number
	/** the Image tool (backlog "Markup kinds" part 4): the picture — a file in Uploads and its page */ image?: { fileId: string; page?: number; ratio?: number } }

/** The shape from two points (corner / corner, or centre / corner) in one 2D space; `shift` = square / circle /
 *  15° steps. Null when it would be empty. */
export function shapeGeom(o: ShapeOpts, a: Pt, b0: Pt, shift: boolean): Geometry | null {
	if (o.kind === 'polygon') {
		const b = shift ? angleStep(a, b0) : b0, n = Math.max(3, Math.min(12, Math.round(o.sides)))
		const d = Math.hypot(b.x - a.x, b.y - a.y)
		if (d < 1e-6) return null
		// inscribed: a corner at b; circumscribed: the middle of an edge at b (its corners further out)
		const R = o.inscribed ? d : d / Math.cos(Math.PI / n), start = Math.atan2(b.y - a.y, b.x - a.x) + (o.inscribed ? 0 : Math.PI / n)
		return { kind: 'polygon', pts: Array.from({ length: n }, (_, i) => ({ x: r1(a.x + R * Math.cos(start + (i * 2 * Math.PI) / n)), y: r1(a.y + R * Math.sin(start + (i * 2 * Math.PI) / n)) })) }
	}
	let b = shift ? squareCorner(a, b0) : b0
	// a picture of a known shape: the largest box of ITS proportions inside the dragged one, from the first corner
	const ratio = o.kind === 'image' ? o.image?.ratio : undefined
	if (ratio && ratio > 0) {
		const fw = Math.abs(b.x - a.x), fh = Math.abs(b.y - a.y), w1 = Math.min(fw, fh * ratio)
		b = { x: a.x + Math.sign(b.x - a.x || 1) * w1, y: a.y + Math.sign(b.y - a.y || 1) * (w1 / ratio) }
	}
	const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y), centre = { x: r1((a.x + b.x) / 2), y: r1((a.y + b.y) / 2) }
	if (w < 1e-6 || h < 1e-6) return null
	if (o.kind === 'rect') return { kind: 'rect', centre, size: { x: r1(w), y: r1(h) } }
	if (o.kind === 'image') return o.image ? { kind: 'image', fileId: o.image.fileId, ...(o.image.page && o.image.page !== 1 ? { page: o.image.page } : {}), centre, size: { x: r1(w), y: r1(h) }, ...(ratio && ratio > 0 ? { ratio } : {}) } : null
	return shift ? { kind: 'circle', centre, r: r1(w / 2) } : { kind: 'ellipse', centre, rx: r1(w / 2), ry: r1(h / 2) }
}
const r1 = (v: number) => Math.round(v * 10) / 10

export class ShapeTool implements Tool {

	readonly cursor = 'crosshair'
	#a: Pt | null = null
	#b: Pt | null = null
	#m: Pt | null = null
	#shift = false
	#press: Pt | null = null

	/** 'box' (backlog "Box / desk tool"): the same, on the plan, with a height — a rect / ellipse / polygon with an extent. */
	constructor(private opts: () => ShapeOpts, readonly id: 'shape' | 'box' | 'image' = 'shape') {}

	/** A view point, snapped (paper: to 0.5 mm). */
	#pt(e: PointerIn, c: ToolCtx): Pt {
		if (c.space.spec.kind === 'sheet') return e.alt ? e.p : { x: Math.round(e.p.x * 2) / 2, y: Math.round(e.p.y * 2) / 2 }
		return c.snap(e.p, e.alt).p
	}
	/** An ARC (backlog "Arc"): three clicks — its start, a point it passes through, its end. */
	#arc(): boolean { return this.id === 'shape' && this.opts().kind === 'arc' }
	/** A box drawn in an elevation / section (User 2026-10-14): its width and height by the two corners, its depth from
	 *  the tool options — always a rectangular box there. */
	#upright(c?: ToolCtx): boolean { const k = c?.space.spec.kind; return this.id === 'box' && !!c?.space.frame && (k === 'elevation' || k === 'section') }
	#opts(c?: ToolCtx): ShapeOpts { const o = this.opts(); return this.#upright(c) ? { ...o, kind: 'rect' } : o }
	down(e: PointerIn, c: ToolCtx): void {
		const p = this.#pt(e, c)
		if (this.#arc()) {
			if (!this.#a) { this.#a = this.#b = p; return }
			if (!this.#m) { this.#m = this.#b = p; return }
			this.#b = p
			this.#commit(c)
			return
		}
		if (!this.#a) { this.#a = p; this.#b = p; this.#press = e.p; return }
		this.#b = p; this.#shift = e.shift
		this.#commit(c)
	}
	move(e: PointerIn, c: ToolCtx): void { this.hover(e, c) }
	hover(e: PointerIn, c: ToolCtx): void { if (this.#a) { this.#b = this.#pt(e, c); this.#shift = e.shift } }
	/** Press-drag-release draws it in one go; a click (no drag) waits for the second click. */
	up(e: PointerIn, c: ToolCtx): void {
		if (this.#a && this.#press && !this.#arc() && Math.hypot(e.p.x - this.#press.x, e.p.y - this.#press.y) > c.tol() * 2) {
			this.#b = this.#pt(e, c); this.#shift = e.shift
			this.#commit(c)
		}
		this.#press = null
	}
	cancel(): void { this.#a = this.#b = this.#m = this.#press = null }
	key(e: KeyboardEvent): boolean { if (e.key === 'Escape' && this.#a) { this.cancel(); return true } return false }

	// typed input (User 2026-10-14: a box's width / depth while drawing). A typed point is a click there (x,y · @dx,dy ·
	// d<a); after the first corner of a rectangle, ellipse or picture, `w,d` is its size and one number a square /
	// circle — laid out from the corner towards the side the cursor is on.
	typed(p: Pt, c: ToolCtx): void {
		if (this.#arc()) {
			if (!this.#a) { this.#a = this.#b = p; return }
			if (!this.#m) { this.#m = this.#b = p; return }
			this.#b = p
			this.#commit(c)
			return
		}
		if (!this.#a) { this.#a = this.#b = p; return }
		this.#b = p; this.#shift = false
		this.#commit(c)
	}
	lastPoint(): Pt | null { return this.#m ?? this.#a }
	/** Corner to corner (not a polygon's centre or an arc's points): a size can be typed. */
	#sized(c?: ToolCtx): boolean { return !!this.#a && !this.#arc() && this.#opts(c).kind !== 'polygon' }
	typedText(text: string, c: ToolCtx): string | null | false {
		if (!this.#sized(c)) return false
		const m = /^\s*(\d+(?:\.\d+)?)\s*(?:[,x×*]\s*(\d+(?:\.\d+)?))?\s*$/i.exec(text)
		if (!m) return false   // @dx,dy, polar … : read as a point
		const w = Number(m[1]), d = m[2] != null ? Number(m[2]) : w
		if (!(w > 0 && d > 0)) return 'Width and depth must be more than 0'
		const a = this.#a!, cur = this.#b ?? a
		const sx = Math.sign(cur.x - a.x) || 1, sy = Math.sign(cur.y - a.y) || 1
		this.typed({ x: a.x + sx * w, y: a.y + sy * d }, c)
		return null
	}
	typedLabel(): string | null {
		if (this.#sized()) return `${this.id === 'box' ? 'Box' : 'Size'} — width,depth (e.g. 1200,600 or 1200..600) towards the cursor · one number: a square · @dx,dy`
		if (this.#a && !this.#arc() && this.opts().kind === 'polygon') return 'Radius (towards the cursor) · or a point: x,y · @dx,dy'
		return null
	}

	#commit(c: ToolCtx): void {
		const a = this.#a, b = this.#b, m = this.#m
		this.cancel()
		if (!a || !b) return
		const spec = c.space.spec, o = this.#opts(c)
		if (this.#upright(c)) { this.#uprightBox(c, a, this.#shift ? squareCorner(a, b) : b); return }
		// the owner, and how a view point maps into the shape's own 2D space
		let owner: Record<string, unknown>, map = (p: Pt): Pt => p
		if (spec.kind === 'sheet') {
			const sheet = c.store.get(spec.sheetId) as Sheet | undefined, vp = sheet && viewportAt(sheet, a)
			owner = { sheetId: spec.sheetId, ...(vp ? { vpId: vp.id } : {}) }
			if (vp) map = fromPaper(vp)
		} else if (spec.kind === 'plan') {
			owner = { levelId: c.levelId }
		} else if (c.space.frame && (spec.kind === 'elevation' || spec.kind === 'section')) {
			owner = { levelId: c.levelId, plane: { kind: 'vertical', frame: c.space.frame, depth: Math.round(c.work.depth) } }
			map = (p) => ({ x: p.x, y: -p.y })   // view (u, −z) → the plane's (u, z)
		} else { c.say?.('Shapes go on plans, elevations, sections and sheets'); return }
		const geom = o.kind === 'arc' && this.id === 'shape' ? (m ? arcThrough(map(a), map(m), map(b)) : null) : shapeGeom(o, map(a), map(b), this.#shift)
		if (!geom) { if (o.kind === 'arc') c.say?.('An arc needs three points not in a line'); return }
		// a box: a footprint with a height, standing at its Z (shows in elevations and sections as a box)
		const box = this.id === 'box' && spec.kind === 'plan' ? { extent: Math.max(1, o.height ?? 750), ...(o.z ? { plane: { kind: 'plan', z: o.z } } : {}) } : {}
		const s = { type: 'shape', id: newId(), ...owner, ...(c.layerId && spec.kind !== 'sheet' ? { layerId: c.layerId } : {}), geom, ...box, ...(o.kind === 'image' ? {} : styleProp(c.settings, c.index.layers, spec.kind === 'sheet' ? null : c.layerId)) } as Shape
		const name = this.id === 'box' ? 'box' : o.kind === 'image' ? 'image' : o.kind === 'polygon' ? `${Math.round(o.sides)}-sided polygon` : geom.kind
		c.store.transact(`Draw ${name}`, (tx) => tx.put(s))
		c.select([s.id])
	}

	/** The box from two corners in an elevation / section: a plan box whose width runs along the view, standing from the
	 *  lower corner's height to the upper's, its front face on the work plane and `depth` deep away from the viewer. */
	#uprightBox(c: ToolCtx, a: Pt, b: Pt): void {
		const f = c.space.frame!, o = this.opts()
		const u0 = Math.min(a.x, b.x), u1 = Math.max(a.x, b.x), z0 = Math.min(-a.y, -b.y), z1 = Math.max(-a.y, -b.y)
		if (u1 - u0 < 1 || z1 - z0 < 1) return
		const d = Math.max(1, o.depth ?? 600), mid = unproject(f, { u: (u0 + u1) / 2, v: 0 }, c.work.depth - d / 2)
		const rot = Math.round(frameRot(f) * 10) / 10
		const geom = { kind: 'rect', centre: { x: r1(mid.x), y: r1(mid.y) }, size: { x: r1(u1 - u0), y: r1(d) }, ...(rot ? { rot } : {}) }
		const s = { type: 'shape', id: newId(), levelId: c.levelId, ...(c.layerId ? { layerId: c.layerId } : {}), geom, extent: r1(z1 - z0), ...(r1(z0) ? { plane: { kind: 'plan', z: r1(z0) } } : {}), ...styleProp(c.settings, c.index.layers, c.layerId) } as Shape
		c.store.transact('Draw box', (tx) => tx.put(s))
		c.select([s.id])
	}

	/** The shape as it will be, in the view — and its size beside the cursor (User 2026-10-14). */
	preview(c?: ToolCtx): Prim[] {
		const a = this.#a, b = this.#b
		if (!a || !b) return []
		if (this.#arc()) {
			const arc = this.#m ? arcThrough(a, this.#m, b) : null
			return [{ k: 'line', pts: arc ? arcPts(arc) : [a, ...(this.#m ? [this.#m] : []), b], cls: 'draft' }]
		}
		const o = this.#opts(c), g = shapeGeom(o, a, b, this.#shift), out = g && outlineOf(g)
		if (!out) return []
		return [{ k: 'line', pts: out, closed: true, cls: 'draft' }, ...(c ? this.#sizeLabel(o, a, b, c) : [])]
	}
	/** "1200 × 600" (an elevation: width × height; a polygon: its radius) just past the cursor, ~11 px high. */
	#sizeLabel(o: ShapeOpts, a: Pt, b0: Pt, c: ToolCtx): Prim[] {
		const px = c.tol() / 10, b = this.#shift && o.kind !== 'polygon' ? squareCorner(a, b0) : b0
		const n = (v: number) => String(Math.round(Math.abs(v) * 10) / 10)
		const text = o.kind === 'polygon' ? `R ${n(Math.hypot(b.x - a.x, b.y - a.y))}` : `${n(b.x - a.x)} × ${n(b.y - a.y)}`
		return [{ k: 'text', at: { x: b0.x + 14 * px, y: b0.y + 22 * px }, text, size: 11 * px, cls: 'draft-label' }]
	}
}
