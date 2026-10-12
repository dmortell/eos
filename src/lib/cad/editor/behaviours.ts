// Per-type editing behaviour (analysis §6.7): the ONLY place that knows how to move each kind of entity. A move is a
// MODEL displacement (x, y, z) — a plan drag gives z = 0, an elevation drag moves along the view and up / down
// (views/space.ts). Shapes move by geometry kind; data entities by their position. Unplaced things don't move.
import type { Entity, SectionCut } from '../domain/drawing'
import type { Id, Pt } from '../domain/types'
import { outletZ } from '../domain/floors'
import type { Shape, Plane, Geometry } from '../domain/shapes'
import { moveGeometry, rotateGeometry, mirrorGeometry, rotatePt, mirrorPt, lineDeg, sameFrame } from '../domain/shapes'
import { rotate, norm360, project, unproject } from '../domain/conventions'
import { sectionFrame } from '../views/section'

export { moveGeometry }
export interface Delta { x: number; y: number; z?: number }

const add = (p: Pt, d: Delta): Pt => ({ x: p.x + d.x, y: p.y + d.y })

export function canMove(e: Entity): boolean {
	return e.type === 'shape' || e.type === 'section' || ((e.type === 'outlet' || e.type === 'rack') && !!e.at && !(e.type === 'outlet' && e.locked))
}

/** The entity moved by `d` (a new record; the input is never changed). `get` finds an outlet's level, so an outlet with
 *  no Z moved up / down starts from its mount height, not the floor (Review 2 Q5). */
export function moveBy<T extends Entity>(e: T, d: Delta, get?: (id: Id) => Entity | undefined): T {
	if (!canMove(e)) return e
	const dz = d.z ?? 0
	if (e.type === 'shape') {
		const s = e as Shape
		// drawn on an elevation's plane: its points are (u, z) on that plane — a model move goes along it and up
		if (s.plane?.kind === 'vertical' && s.geom.kind !== 'path') {
			const t = s.plane.frame.t
			return { ...s, geom: moveGeometry(s.geom, { x: d.x * t.x + d.y * t.y, y: dz }) } as T
		}
		// up / down (an elevation drag): a region's plan plane rises (one at Z 0 has none yet), an insert its own Z
		const region = s.geom.kind === 'rect' || s.geom.kind === 'circle' || s.geom.kind === 'ellipse' || s.geom.kind === 'polygon'
		const plane = dz && (s.plane?.kind === 'plan' || (!s.plane && region)) ? { plane: { kind: 'plan' as const, z: (s.plane?.kind === 'plan' ? s.plane.z : 0) + dz } } : {}
		const geom = moveGeometry(s.geom, d)
		return { ...s, geom: dz && geom.kind === 'insert' ? { ...geom, z: (geom.z ?? 0) + dz } : geom, ...plane } as T
	}
	if (e.type === 'outlet' && e.at) {
		const lv = get?.(e.levelId)
		return { ...e, at: add(e.at, d), ...(dz ? { z: outletZ(e, lv?.type === 'level' ? lv : undefined) + dz } : {}) } as T
	}
	if (e.type === 'rack' && e.at) return { ...e, at: add(e.at, d) } as T
	if (e.type === 'section') return { ...e, a: add(e.a, d), b: add(e.b, d) } as T
	return e
}

/**
 * Path nodes ATTACHED to moved entities follow them (a drop ending at an outlet, a run ending at a rack): the shapes
 * that change, with those nodes shifted by `d`. Shapes that are themselves being moved are left to `moveBy`.
 */
export function followAttached(shapes: Shape[], moved: Set<string>, d: Delta): Shape[] {
	const out: Shape[] = []
	for (const s of shapes) {
		if (moved.has(s.id) || s.geom.kind !== 'path' || !s.geom.nodes.some((n) => n.attach && moved.has(n.attach))) continue
		out.push({ ...s, geom: { ...s.geom, nodes: s.geom.nodes.map((n) => (n.attach && moved.has(n.attach) ? { ...n, x: n.x + d.x, y: n.y + d.y, z: n.z + (d.z ?? 0) } : n)) } })
	}
	return out
}

/** The same for a turn or a mirror: attached nodes go where `P` takes them (heights kept). */
export function followAttachedMap(shapes: Shape[], moved: Set<string>, P: (p: Pt) => Pt): Shape[] {
	const out: Shape[] = []
	for (const s of shapes) {
		if (moved.has(s.id) || s.geom.kind !== 'path' || !s.geom.nodes.some((n) => n.attach && moved.has(n.attach))) continue
		out.push({ ...s, geom: { ...s.geom, nodes: s.geom.nodes.map((n) => (n.attach && moved.has(n.attach) ? { ...n, ...P(n) } : n)) } })
	}
	return out
}

const rotField = (a: number) => (Math.round(norm360(a) * 1e6) / 1e6) % 360 || undefined
const otherHinge = <T extends { hinge?: 'left' | 'right' }>(d: T): T => ({ ...d, hinge: d.hinge === 'right' ? 'left' : 'right' })

/**
 * The entity turned `deg` (clockwise on screen) about the plan / paper point `c` (Rotate). Shapes by geometry kind; a
 * shape on an elevation's plane turns with its plane; outlets / racks turn their position and add to their rotation; a
 * section turns its cut line.
 */
export function rotateEntity<T extends Entity>(e: T, c: Pt, deg: number): T {
	if (!canMove(e)) return e
	const P = (p: Pt) => rotatePt(p, c, deg)
	if (e.type === 'shape') {
		const s = e as Shape
		if (s.plane?.kind === 'vertical') {
			const f = s.plane.frame, plane: Plane = { ...s.plane, frame: { o: P(f.o), t: rotate(f.t, deg), n: rotate(f.n, deg) } }
			return { ...s, plane, geom: s.geom.kind === 'path' ? rotateGeometry(s.geom, c, deg) : s.geom } as T   // its (u, z) points stay
		}
		return { ...s, geom: rotateGeometry(s.geom, c, deg) } as T
	}
	if ((e.type === 'outlet' || e.type === 'rack') && e.at) return { ...e, at: P(e.at), rot: rotField((e.rot ?? 0) + deg) } as T
	if (e.type === 'section') return { ...e, a: P(e.a), b: P(e.b) } as T
	return e
}

/**
 * The entity mirrored in the line a → b (Mirror). Text stays readable (domain/shapes.ts `mirrorGeometry`). Things with
 * a FRONT keep it facing the mirrored way: a rack or a box with a back line / doors keeps its local +y as the front and
 * a single door's hinge changes side; a door in a wall opens to the mirrored face; a section still looks at what it
 * looked at, mirrored. An outlet points along its symbol's local ±y, as an insert does: it keeps its front too.
 */
export function mirrorEntity<T extends Entity>(e: T, a: Pt, b: Pt): T {
	if (!canMove(e)) return e
	const P = (p: Pt) => mirrorPt(p, a, b), th = lineDeg(a, b), O = { x: 0, y: 0 }
	const V = (v: Pt) => mirrorPt(v, O, { x: b.x - a.x, y: b.y - a.y })   // a direction, mirrored
	const keepFront = (rot?: number) => rotField(2 * th - (rot ?? 0) + 180)
	if (e.type === 'shape') {
		const s = e as Shape
		if (s.plane?.kind === 'vertical') {
			// the plane is mirrored; to keep its frame right-handed its u axis turns round, so its points mirror in u = 0
			const f = s.plane.frame, t = V(f.t), plane: Plane = { ...s.plane, frame: { o: P(f.o), t: { x: -t.x || 0, y: -t.y || 0 }, n: V(f.n) } }
			return { ...s, plane, geom: s.geom.kind === 'path' ? mirrorGeometry(s.geom, a, b) : mirrorGeometry(s.geom, O, { x: 0, y: 1 }) } as T
		}
		let geom = mirrorGeometry(s.geom, a, b)
		if ((s.backLine || s.doors) && geom.kind === 'rect' && s.geom.kind === 'rect') geom = { ...geom, rot: keepFront(s.geom.rot) }
		const role = s.role?.kind === 'wall' && s.role.openings.some((o) => o.swing)
			? { role: { ...s.role, openings: s.role.openings.map((o) => (o.swing ? { ...o, flip: !o.flip || undefined } : o)) } } : {}
		return { ...s, geom, ...role, ...(s.doors ? { doors: otherHinge(s.doors) } : {}) } as T
	}
	if (e.type === 'outlet' && e.at) return { ...e, at: P(e.at), rot: keepFront(e.rot) } as T
	if (e.type === 'rack' && e.at) return { ...e, at: P(e.at), rot: keepFront(e.rot), ...(e.doors ? { doors: otherHinge(e.doors) } : {}) } as T
	if (e.type === 'section') return { ...e, a: P(e.b), b: P(e.a) } as T
	return e
}

/** A point of a non-path geometry that stands for where it is (a note's anchor, a box's centre …). */
function anchorOf(g: Geometry): Pt {
	switch (g.kind) {
		case 'text': case 'insert': case 'legend': return g.at
		case 'rect': case 'image': case 'circle': case 'ellipse': case 'arc': return g.centre
		case 'dimension': return g.a
		case 'leader': case 'cloud': case 'polygon': return g.pts[0] ?? { x: 0, y: 0 }
		case 'path': return g.nodes[0] ?? { x: 0, y: 0 }
	}
}

/**
 * What is drawn on a section's plane — notes, dimensions, lines, flat shapes, blocks placed in it — after the section
 * moved, turned, was mirrored or flipped, or had an end dragged: it is re-framed on the section's new plane, keeping
 * its place in the building (else it would belong to a frame no view has, and draw nowhere). A note or shape keeps its
 * size and stays readable (a flip mirrors where it is, not its letters); a line's nodes and a block's point are model
 * points already, so only their frame changes. The changed shapes.
 */
export function followSection(shapes: Shape[], was: SectionCut, now: SectionCut, moved?: ReadonlySet<Id>): Shape[] {
	const fa = sectionFrame(was).f, fb = sectionFrame(now).f
	if (sameFrame(fa, fb) && fa.n.x === fb.n.x && fa.n.y === fb.n.y) return []
	const out: Shape[] = []
	for (const s of shapes) {
		if (s.levelId !== was.levelId) continue
		const g = s.geom
		if (g.kind === 'insert' && g.frame && sameFrame(g.frame, fa)) { out.push({ ...s, geom: { ...g, frame: fb } }); continue }
		// a note mirrored WITH its section keeps its own mirrored frame, whose origin is the section's old start while the
		// section's new one is its old end: same plane, so only its frame's description moves along u (Q69)
		if (moved?.has(s.id) && s.plane?.kind === 'vertical' && !sameFrame(s.plane.frame, fa)) {
			const f = s.plane.frame, dx = f.o.x - fb.o.x, dy = f.o.y - fb.o.y, du = dx * fb.t.x + dy * fb.t.y
			const near = (p: number, q: number) => Math.abs(p - q) < 1e-6
			if (near(f.t.x, fb.t.x) && near(f.t.y, fb.t.y) && near(f.n.x, fb.n.x) && near(f.n.y, fb.n.y) && near(dx * fb.n.x + dy * fb.n.y, 0)) {
				const g = s.geom
				out.push({ ...s, plane: { ...s.plane, frame: fb }, geom: g.kind === 'path' || near(du, 0) ? g : moveGeometry(g, { x: du, y: 0 }) })
			}
			continue
		}
		if (s.plane?.kind !== 'vertical' || !sameFrame(s.plane.frame, fa)) continue
		if (g.kind === 'path') {
			const n0 = g.nodes[0]
			out.push({ ...s, plane: { ...s.plane, frame: fb, depth: n0 ? project(fb, n0).depth : s.plane.depth } })
			continue
		}
		const r = anchorOf(g), to = project(fb, unproject(fa, { u: r.x, v: r.y }, s.plane.depth))
		const flipped = fa.t.x * fb.t.x + fa.t.y * fb.t.y < 0, c = (r.x + to.u) / 2
		const geom = flipped ? mirrorGeometry(g, { x: c, y: 0 }, { x: c, y: 1 }) : moveGeometry(g, { x: to.u - r.x, y: 0 })
		out.push({ ...s, plane: { ...s.plane, frame: fb, depth: to.depth }, geom })
	}
	return out
}

/** Sections changed in a transaction: what is drawn on their planes follows (`followSection`), read and written
 *  through `tx`. `was` = the changed entities as they were before (non-sections are skipped). */
export function followSections(tx: { get(id: Id): Entity | undefined; put(e: Entity): void }, was: (Entity | undefined)[], shapes: Shape[], moved?: ReadonlySet<Id>): void {
	for (const w of was) {
		if (w?.type !== 'section') continue
		const now = tx.get(w.id)
		if (now?.type !== 'section' || now === w) continue
		for (const s of followSection(shapes.map((x) => (tx.get(x.id) as Shape | undefined) ?? x), w, now, moved)) tx.put(s)
	}
}
