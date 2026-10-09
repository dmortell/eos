// GRIPS to resize a drawn region (Dave, 2026-10-05): a rectangle's corners (the opposite one stays put; Shift = square)
// and edge middles (one side moves), an ellipse's axis ends (its centre stays; Shift = a circle), a circle's radius, a
// polygon's corners. Math in the shape's own 2D space (plan mm, an elevation plane's (u, z), paper or viewport mm);
// `gripSpace` maps it to and from the view the grips are shown in. Pure apart from reading the sheet's viewport.
import type { Pt } from '../domain/types'
import type { Shape, Geometry } from '../domain/shapes'
import type { Sheet } from '../domain/drawing'
import type { ViewSpace } from '../views/space'
import { outlineOf, sameFrame } from '../domain/shapes'
import { toPaper, fromPaper } from '../views/sheet'
import { dimLine, dimOffset } from '../views/plan'
import { angleStep } from './constrain'

export interface GripSpace { to(p: Pt): Pt; from(p: Pt): Pt }


/** How the shape's own points show in this view, or null when it isn't shown here (no grips then). */
export function gripSpace(s: Shape, sp: ViewSpace, get: (id: string) => unknown): GripSpace | null {
	const id = { to: (p: Pt) => p, from: (p: Pt) => p }, spec = sp.spec
	if (spec.kind === 'sheet') {
		if (s.sheetId !== spec.sheetId) return null
		const vp = s.vpId ? (get(spec.sheetId) as Sheet | undefined)?.viewports.find((v) => v.id === s.vpId) : undefined
		return vp ? { to: toPaper(vp), from: fromPaper(vp) } : id
	}
	if (!s.levelId) return null
	if (s.plane?.kind === 'vertical') {
		// only in the view it was drawn on (same frame): its (u, z) is the view's (x, −y) there
		if ((spec.kind !== 'elevation' && spec.kind !== 'section') || !sp.frame || !sameFrame(s.plane.frame, sp.frame)) return null
		return { to: (p) => ({ x: p.x, y: -p.y }), from: (p) => ({ x: p.x, y: -p.y }) }
	}
	return spec.kind === 'plan' ? id : null
}

const rot = (p: Pt, deg: number): Pt => { const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return { x: p.x * c - p.y * s, y: p.x * s + p.y * c } }
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y })
const r1 = (v: number) => Math.round(v * 10) / 10
const r1p = (p: Pt): Pt => ({ x: r1(p.x), y: r1(p.y) })

/** A region's grips in its own space: rect = 4 corners then 4 edge middles (−y, +x, +y, −x edges, local); ellipse /
 *  circle = its +x, +y, −x, −y axis ends; polygon = its corners. [] = not a region. */
export function regionGrips(g: Geometry): Pt[] {
	if (g.kind === 'rect' || g.kind === 'image') {
		const c = outlineOf(g)!
		return [...c, ...c.map((p, i) => { const q = c[(i + 1) % 4]; return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 } })]
	}
	if (g.kind === 'ellipse' || g.kind === 'circle') {
		const rx = g.kind === 'circle' ? g.r : g.rx, ry = g.kind === 'circle' ? g.r : g.ry, a = g.kind === 'ellipse' ? g.rot ?? 0 : 0
		return [{ x: rx, y: 0 }, { x: 0, y: ry }, { x: -rx, y: 0 }, { x: 0, y: -ry }].map((p) => add(g.centre, rot(p, a)))
	}
	if (g.kind === 'polygon') return g.pts
	// notes (backlog "Edit line and note end points"): a leader's / cloud's points; a dimension's two measured points
	// and the middle of its dimension line (drag it to move the line nearer / further)
	if (g.kind === 'leader' || g.kind === 'cloud') return g.pts
	if (g.kind === 'dimension') { const { a2, b2 } = dimLine(g); return [g.a, g.b, { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 }] }
	return []
}

/** The shape with grip `i` dragged to `q` (its own space). */
export function dragRegionGrip(s: Shape, i: number, q: Pt, shift: boolean): Shape {
	const g = s.geom
	if (g.kind === 'polygon' || g.kind === 'cloud') return { ...s, geom: { ...g, pts: g.pts.map((p, j) => (j === i ? r1p(q) : p)) } }
	if (g.kind === 'leader') {
		// Shift: 15° steps from the neighbouring point; the tip dragged off what it pointed at lets go of it
		const from = g.pts[i === 0 ? 1 : i - 1], at = shift && from ? angleStep(from, q) : q
		const { attach: _a, ...rest } = g
		return { ...s, geom: { ...(i === 0 ? rest : g), pts: g.pts.map((p, j) => (j === i ? r1p(at) : p)) } }
	}
	if (g.kind === 'dimension') {
		if (i === 2) return { ...s, geom: { ...g, offset: r1(dimOffset(g, q)) } }
		const at = shift ? angleStep(i === 0 ? g.b : g.a, q) : q
		return { ...s, geom: i === 0 ? { ...g, a: r1p(at) } : { ...g, b: r1p(at) } }
	}
	if (g.kind === 'circle') return { ...s, geom: { ...g, r: Math.max(1, r1(Math.hypot(q.x - g.centre.x, q.y - g.centre.y))) } }
	if (g.kind === 'ellipse') {
		const a = g.rot ?? 0, l = rot(sub(q, g.centre), -a)   // the pointer in the ellipse's own axes
		const along = i % 2 === 0 ? Math.abs(l.x) : Math.abs(l.y)
		if (shift) return { ...s, geom: { kind: 'circle', centre: g.centre, r: Math.max(1, r1(along)) } }
		return { ...s, geom: i % 2 === 0 ? { ...g, rx: Math.max(1, r1(along)) } : { ...g, ry: Math.max(1, r1(along)) } }
	}
	if (g.kind !== 'rect' && g.kind !== 'image') return s   // an image resizes like a box
	const a = g.rot ?? 0, hx = g.size.x / 2, hy = g.size.y / 2
	const local = (p: Pt) => rot(sub(p, g.centre), -a), world = (p: Pt) => add(g.centre, rot(p, a))
	const lq = local(q)
	if (i < 4) {
		// a corner: the opposite one stays where it is
		const corners = [{ x: -hx, y: -hy }, { x: hx, y: -hy }, { x: hx, y: hy }, { x: -hx, y: hy }], o = corners[(i + 2) % 4]
		let d = sub(lq, o)
		if (shift) { const m = Math.max(Math.abs(d.x), Math.abs(d.y)); d = { x: Math.sign(d.x || 1) * m, y: Math.sign(d.y || 1) * m } }
		const size = { x: Math.max(1, r1(Math.abs(d.x))), y: Math.max(1, r1(Math.abs(d.y))) }
		return { ...s, geom: { ...g, size, centre: r1p(world({ x: o.x + d.x / 2, y: o.y + d.y / 2 })) } }
	}
	// an edge's middle: that side moves, the opposite side stays
	const axis = i === 4 || i === 6 ? 'y' : 'x', sign = i === 4 || i === 7 ? -1 : 1, h = axis === 'x' ? hx : hy
	const fixed = -sign * h, moved = axis === 'x' ? lq.x : lq.y, len = Math.max(1, r1(Math.abs(moved - fixed))), mid = (moved + fixed) / 2
	const c = world(axis === 'x' ? { x: mid, y: 0 } : { x: 0, y: mid })
	return { ...s, geom: { ...g, size: axis === 'x' ? { x: len, y: g.size.y } : { x: g.size.x, y: len }, centre: r1p(c) } }
}
