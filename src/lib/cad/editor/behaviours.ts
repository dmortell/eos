// Per-type editing behaviour (analysis §6.7): the ONLY place that knows how to move each kind of entity. A move is a
// MODEL displacement (x, y, z) — a plan drag gives z = 0, an elevation drag moves along the view and up / down
// (views/space.ts). Shapes move by geometry kind; data entities by their position. Unplaced things don't move.
import type { Entity } from '../domain/drawing'
import type { Pt } from '../domain/types'
import type { Shape, Plane } from '../domain/shapes'
import { moveGeometry, rotateGeometry, mirrorGeometry, rotatePt, mirrorPt, lineDeg } from '../domain/shapes'
import { rotate, norm360 } from '../domain/conventions'

export { moveGeometry }
export interface Delta { x: number; y: number; z?: number }

const add = (p: Pt, d: Delta): Pt => ({ x: p.x + d.x, y: p.y + d.y })

export function canMove(e: Entity): boolean {
	return e.type === 'shape' || e.type === 'section' || ((e.type === 'outlet' || e.type === 'rack') && !!e.at && !(e.type === 'outlet' && e.locked))
}

/** The entity moved by `d` (a new record; the input is never changed). */
export function moveBy<T extends Entity>(e: T, d: Delta): T {
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
	if (e.type === 'outlet' && e.at) return { ...e, at: add(e.at, d), ...(dz ? { z: (e.z ?? 0) + dz } : {}) } as T
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
 * looked at, mirrored. An outlet's rotation is mirrored as an insert's is (2θ − r).
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
	if (e.type === 'outlet' && e.at) return { ...e, at: P(e.at), rot: rotField(2 * th - (e.rot ?? 0)) } as T
	if (e.type === 'rack' && e.at) return { ...e, at: P(e.at), rot: keepFront(e.rot), ...(e.doors ? { doors: otherHinge(e.doors) } : {}) } as T
	if (e.type === 'section') return { ...e, a: P(e.b), b: P(e.a) } as T
	return e
}
