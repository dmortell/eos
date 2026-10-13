// The ONE set of geometric conventions for the cad tool (ADR 0004). Every generator, tool and importer goes through
// these helpers instead of re-deriving signs; conventions.test.ts states them as facts about what a viewer sees, so a
// sign slip fails a test that reads like the requirement rather than a pinned number.
//
// Plan:      model millimetres, x to the right of the sheet, y DOWN the sheet (screen convention).
// Height:    z = mm above the level's finished floor (FFL, the top of the raised floor). Under-floor runs are z < 0.
// Angles:    degrees, measured from +x towards +y — i.e. CLOCKWISE on screen. Only UI input/output converts to the
//            counter-clockwise "CAD" angle a user types (screenCcwToPlan / planToScreenCcw).
// Elevation: a frame { o, t, n } — o a plan origin, t the viewer's RIGHT, n points TOWARDS the viewer, so the viewer
//            looks along −n. A point projects to (u, v) = ((p − o)·t, z), and depth = (p − o)·n: larger = nearer.
// Racks:     a rack's FRONT is its local +y face (rotated by `rot`), so an unrotated rack is seen from the front by
//            the 'front' elevation.

export interface Pt { x: number; y: number }
export interface Pt3 extends Pt { z: number }

export type ElevDir = 'front' | 'rear' | 'left' | 'right'
export interface ElevFrame { o: Pt; t: Pt; n: Pt }
export interface ElevPoint { u: number; v: number; depth: number }

const DEG = Math.PI / 180
/** Round away float dust so axis-aligned results compare exactly (cos 90° = 6e-17). */
const clean = (v: number) => (Math.abs(v) < 1e-12 ? 0 : v)

/** The unit vector of a plan angle (deg, clockwise on screen from +x). */
export function dirOf(deg: number): Pt {
	return { x: clean(Math.cos(deg * DEG)), y: clean(Math.sin(deg * DEG)) }
}

/** Rotate a plan vector by `deg` (clockwise on screen). */
export function rotate(p: Pt, deg: number): Pt {
	const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG)
	return { x: clean(p.x * c - p.y * s), y: clean(p.x * s + p.y * c) }
}

/** A user-typed angle (counter-clockwise on screen, 0 = +x, like AutoCAD) → a plan angle. */
export const screenCcwToPlan = (deg: number) => norm360(-deg)
/** A plan angle → the counter-clockwise angle shown to the user. */
export const planToScreenCcw = (deg: number) => norm360(-deg)
export const norm360 = (deg: number) => ((deg % 360) + 360) % 360

/** The frame whose viewer looks TOWARDS `n` reversed: given n (pointing at the viewer), t = viewer's right. */
export function frameFromNormal(n: Pt, o: Pt = { x: 0, y: 0 }): ElevFrame {
	return { o, t: { x: clean(n.y), y: clean(-n.x) }, n }
}

/** The named elevations: 'front' stands on the +y side (bottom of the sheet) looking up the sheet. */
const NAMED_N: Record<ElevDir, Pt> = {
	front: { x: 0, y: 1 },
	rear: { x: 0, y: -1 },
	right: { x: 1, y: 0 },
	left: { x: -1, y: 0 },
}
export function namedFrame(dir: ElevDir, o: Pt = { x: 0, y: 0 }): ElevFrame {
	return frameFromNormal(NAMED_N[dir], o)
}

/** A frame looking ALONG the plan direction `lookDeg` (e.g. 270 = up the sheet = the 'front' view). (Used by tests only.) */
export function frameLooking(lookDeg: number, o: Pt = { x: 0, y: 0 }): ElevFrame {
	const look = dirOf(lookDeg)
	return frameFromNormal({ x: clean(-look.x), y: clean(-look.y) }, o)
}

export function project(f: ElevFrame, p: Pt3): ElevPoint {
	const dx = p.x - f.o.x, dy = p.y - f.o.y
	return { u: dx * f.t.x + dy * f.t.y, v: p.z, depth: dx * f.n.x + dy * f.n.y }
}

/**
 * The inverse of `project`: a point picked in an elevation at (u, v) on the work plane `depth` → a model point.
 * This is how anything drawn on an elevation gets its plan position: x/y from u and the plane's depth, z from v.
 */
export function unproject(f: ElevFrame, p: { u: number; v: number }, depth: number): Pt3 {
	return { x: f.o.x + p.u * f.t.x + depth * f.n.x, y: f.o.y + p.u * f.t.y + depth * f.n.y, z: p.v }
}

/** The plan angle of a frame's t axis — the `rot` an upright box drawn on that elevation gets (its width runs along u):
 *  the Box tool in an elevation / section. */
export function frameRot(f: ElevFrame): number {
	return norm360(Math.atan2(f.t.y, f.t.x) / DEG)
}

/** The outward normal of a rack's front face in plan (its local +y, rotated). */
export function rackFrontNormal(rack: { rot?: number }): Pt {
	return rotate({ x: 0, y: 1 }, rack.rot ?? 0)
}

/** The elevation that looks straight at a rack's front. (Used by tests only.) */
export function rackFrontFrame(rack: { at: Pt; rot?: number }): ElevFrame {
	return frameFromNormal(rackFrontNormal(rack), rack.at)
}
