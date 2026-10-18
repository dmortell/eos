// Constructors and conversions for shapes (ADR 0007). Tools and importers build shapes through these so the
// invariants `validateShape` checks hold from the start. (makeBox / makeText / makeWall are used by tests and fixtures
// only; the app creates its shapes through the tools and importers.)
import { newId } from './ids'
import type { Id, Pt, Tier } from './types'
import type { Shape, ShapeCore, Owner, PathNode, PathSeg, Section, Plane, ContainmentRole, Role } from './shapes'

type Extra = Partial<Omit<ShapeCore, 'type' | 'id' | 'geom'>>

/** A polyline through `pts` (plan x/y at height z, or the owner's 2D space). Open unless `closed`. */
export function makePath(owner: Owner, pts: (Pt & { z?: number })[], opts: { z?: number; closed?: boolean } & Extra = {}): Shape {
	const { z = 0, closed, ...extra } = opts
	const nodes: PathNode[] = pts.map((p) => ({ id: newId(), x: p.x, y: p.y, z: p.z ?? z }))
	const segs: PathSeg[] = []
	for (let i = 1; i < nodes.length; i++) segs.push({ id: newId(), a: nodes[i - 1].id, b: nodes[i].id })
	if (closed && nodes.length > 2) segs.push({ id: newId(), a: nodes[nodes.length - 1].id, b: nodes[0].id })
	return { type: 'shape', id: newId(), ...owner, geom: { kind: 'path', nodes, segs, ...(closed ? { closed } : {}) }, ...extra } as Shape
}

/** A rectangle on a plane — flat until it has an extent, then a box. */
export function makeRect(owner: Owner, centre: Pt, size: { x: number; y: number }, opts: { plane?: Plane; rot?: number; extent?: number } & Extra = {}): Shape {
	const { rot, ...extra } = opts
	return { type: 'shape', id: newId(), ...owner, geom: { kind: 'rect', centre, size, ...(rot ? { rot } : {}) }, ...extra } as Shape
}

/** A box: a plan rectangle w × d at z (default 0), extended up by h. */
export function makeBox(levelId: Id, centre: Pt, s: { w: number; d: number; h: number; z?: number; rot?: number }): Shape {
	return makeRect({ levelId }, centre, { x: s.w, y: s.d }, { plane: { kind: 'plan', z: s.z ?? 0 }, extent: s.h, rot: s.rot ?? 0 })
}

export function makeText(owner: Owner, at: Pt, text: string, sizeMm = 2.5, extra: Extra = {}): Shape {
	return { type: 'shape', id: newId(), ...owner, geom: { kind: 'text', at, text, sizeMm }, ...extra } as Shape
}

/** The wall preset: a path with a thickness × height section and the wall role. */
export function makeWall(levelId: Id, pts: Pt[], thickness = 100, height = 2700, z = 0): Shape {
	return toWall(makePath({ levelId }, pts, { z }), thickness, height)
}

/** The containment preset: a path with a section and the containment role (a trunk by default). */
export function makeRun(levelId: Id, pts: (Pt & { z?: number })[], section: Section, role: Partial<ContainmentRole> & { tier: Tier | 'wall' }, z = 0): Shape {
	return toContainment(makePath({ levelId }, pts, { z }), section, role)
}

// ── Conversion: geometry never changes, only section and role (ADR 0007) ──────────────────────────────────────────

function assertPath(s: Shape): void {
	if (s.geom.kind !== 'path') throw new Error(`Only a path converts to a wall or a run (got ${s.geom.kind})`)
}

export function toWall(s: Shape, thickness: number, height: number): Shape {
	assertPath(s)
	return withRole(s, { kind: 'wall', openings: [] }, { w: thickness, h: height, anchor: 'bottom' })
}

export function toContainment(s: Shape, section: Section, role: Partial<ContainmentRole> & { tier: Tier | 'wall' }): Shape {
	assertPath(s)
	return withRole(s, { kind: 'containment', form: role.form ?? (section.round ? 'conduit' : 'trunk'), ...role }, section)
}

/** Back to a plain line: drop the role and the section. Openings on a wall are lost (the caller should confirm). */
export function toLine(s: Shape): Shape {
	assertPath(s)
	const { role: _r, section: _s, ...rest } = s
	return rest as Shape
}

function withRole(s: Shape, role: Role, section: Section): Shape {
	return { ...s, role, section }
}
