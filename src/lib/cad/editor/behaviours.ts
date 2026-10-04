// Per-type editing behaviour (analysis §6.7): the ONLY place that knows how to move each kind of entity. A move is a
// MODEL displacement (x, y, z) — a plan drag gives z = 0, an elevation drag moves along the view and up / down
// (views/space.ts). Shapes move by geometry kind; data entities by their position. Unplaced things don't move.
import type { Entity } from '../domain/drawing'
import type { Pt } from '../domain/types'
import type { Shape } from '../domain/shapes'
import { moveGeometry } from '../domain/shapes'

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
		const plane = dz && s.plane?.kind === 'plan' ? { plane: { ...s.plane, z: s.plane.z + dz } } : {}
		return { ...s, geom: moveGeometry(s.geom, d), ...plane } as T
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
