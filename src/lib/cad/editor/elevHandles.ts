// ELEVATION HANDLES (backlog "Drag top / bottom edges in elevations", Dave 2026-10-05): with a wall selected in an
// elevation or section, each segment seen side-on has a square on its TOP edge (drag = its height) and on its BOTTOM
// edge (drag = the whole wall's base; every top stays), and each of its openings the same (top = the hole's height, bottom = its sill;
// the other edge stays). Heights are mm, to 10 mm, snapping to the datum lines when near (Alt: free). A slab-to-slab wall's height follows its level, so it
// has no top square. Pure; tested in elevHandles.test.ts.
import type { Entity } from '../domain/drawing'
import type { Shape, Opening } from '../domain/shapes'
import type { ViewSpace } from '../views/space'
import type { Handle } from './handles'
import { segEnds } from '../domain/openings'
import { outlineOf } from '../domain/shapes'
import type { Pt } from '../domain/types'
import type { Heights } from '../domain/floors'
import type { Prim } from '../views/display'
import { ROOM_FLOOR, ROOM_CEILING } from '../views/rackRow'

const r10 = (v: number, free: boolean) => (free ? v : Math.round(v / 10) * 10)
/** The datum lines a top / base grip snaps to (Dave 2026-10-15): FSL (floor slab), FFL, CLG, CSL (ceiling slab above). */
export type Datums = { heights?: Heights; tol?: number }
function datumSnap(o: Datums): (z: number, free: boolean) => number {
	if (!o.heights) return r10
	const h = o.heights, lines = [-h.raisedFloorMm, 0, h.clearHeightMm, h.clearHeightMm + h.plenumMm], tol = o.tol ?? 100
	return (z, free) => {
		if (free) return z
		const near = lines.reduce((a, b) => (Math.abs(b - z) < Math.abs(a - z) ? b : a))
		return Math.abs(near - z) <= tol ? near : r10(z, false)
	}
}

export function elevationHandles(e: Entity, sp: ViewSpace, dat: Datums = {}): Handle[] {
	const zs = datumSnap(dat)
	if (sp.spec.kind !== 'elevation' && sp.spec.kind !== 'section') return []
	if (e.type === 'shape' && !e.role) return boxHandles(e, sp, zs)
	if (e.type !== 'shape' || e.role?.kind !== 'wall' || e.geom.kind !== 'path') return []
	const s = e as Shape & { geom: Extract<Shape['geom'], { kind: 'path' }> }, role = e.role, out: Handle[] = []
	const zOf = (p: { y: number }) => -p.y   // view y is −z here
	for (const sg of s.geom.segs) {
		const ends = segEnds(s, sg.id)
		if (!ends) continue
		const { a, b } = ends, pa = sp.fromWorld(a), pb = sp.fromWorld(b)
		if (Math.abs(pb.x - pa.x) < 100) continue   // seen end-on: nothing to grab
		const sec = sg.section ?? s.section, h = sec?.h ?? 2700, z0 = Math.min(a.z, b.z), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
		const withH = (nh: number): Shape => (sg.section
			? { ...s, geom: { ...s.geom, segs: s.geom.segs.map((x) => (x.id === sg.id ? { ...x, section: { ...x.section!, h: nh } } : x)) } }
			: { ...s, section: { ...(s.section ?? { w: 100, h }), h: nh } })
		if (!role.slabToSlab) out.push({ at: sp.fromWorld({ ...mid, z: z0 + h }), shape: 'square', label: 'Wall height',
			drag: (p, free) => withH(Math.max(50, zs(zOf(p), free) - z0)) })
		// the bottom: the WHOLE wall's base moves by the same amount and every height grows to match, so every top stays
		// (Dave 2026-10-15: a room's wall is one path — moving only this side's two corners while the shared height grew
		// lifted the neighbouring sides' tops)
		out.push({ at: sp.fromWorld({ ...mid, z: z0 }), shape: 'square', label: 'Wall base',
			drag: (p, free) => {
				const d = Math.min(zs(zOf(p), free), z0 + h - 50) - z0
				const grow = (sc: NonNullable<Shape['section']>) => ({ ...sc, h: Math.max(50, sc.h - d) })
				return { ...s, ...(s.section ? { section: grow(s.section) } : {}),
					geom: { ...s.geom, nodes: s.geom.nodes.map((n) => ({ ...n, z: n.z + d })), segs: s.geom.segs.map((x) => (x.section ? { ...x, section: grow(x.section) } : x)) } } as Shape
			} })
		for (const o of role.openings.filter((x) => x.segId === sg.id)) {
			const c = { x: a.x + ends.t.x * o.at, y: a.y + ends.t.y * o.at }
			const withOp = (patch: Partial<Opening>): Shape => ({ ...s, role: { ...role, openings: role.openings.map((x) => (x.id === o.id ? { ...x, ...patch } : x)) } })
			out.push({ at: sp.fromWorld({ ...c, z: o.z + o.h }), shape: 'square', label: 'Opening height',
				drag: (p, free) => withOp({ h: Math.max(100, zs(zOf(p), free) - o.z) }) })
			out.push({ at: sp.fromWorld({ ...c, z: o.z }), shape: 'square', label: 'Opening sill',
				drag: (p, free) => { const top = o.z + o.h, z = Math.min(zs(zOf(p), free), top - 100); return withOp({ z, h: top - z }) } })
		}
	}
	return out
}

/** A box / desk (a region on the plan with a height, backlog "Box / desk tool") seen from the side: a grip on its top
 *  (drag = its height) and on its bottom (drag = its Z; the top stays). A flat one gets its top square too — drag it
 *  up to give it a height. Dragging the box itself moves it along and up / down (behaviours.ts moveBy). */
function boxHandles(s: Shape, sp: ViewSpace, zs: (z: number, free: boolean) => number = r10): Handle[] {
	const out = outlineOf(s.geom)
	if (!out?.length || s.plane?.kind === 'vertical') return []
	const z = s.plane?.kind === 'plan' ? s.plane.z : 0, h = s.extent ?? 0
	const us = out.map((p) => sp.fromWorld({ ...p, z }).x), mid = (Math.min(...us) + Math.max(...us)) / 2
	if (Math.max(...us) - Math.min(...us) < 1) return []   // seen end-on
	const at = (zz: number) => ({ x: mid, y: -zz })
	const withZ = (nz: number): Partial<Shape> => (nz ? { plane: { kind: 'plan', z: nz } } : { plane: undefined })
	const u0 = Math.min(...us), u1 = Math.max(...us), side = (u: number) => ({ x: u, y: -(z + h / 2) })
	return [
		{ at: at(z + h), shape: 'grip', label: 'Box height', drag: (p, free) => ({ ...s, extent: Math.max(10, zs(-p.y, free) - z) }) as Shape },
		...(h ? [{ at: at(z), shape: 'grip' as const, label: 'Box base', drag: (p: Pt, free: boolean) => {
			const top = z + h, nz = Math.min(zs(-p.y, free), top - 10)
			return { ...s, ...withZ(nz), extent: top - nz } as Shape
		} }] : []),
		// its sides as seen: drag one, the other stays (backlog "Box grips in elevations": width, also in angled views)
		...(sp.frame && widthDrag(s, sp.frame.t, 0) ? ([[u0, -1], [u1, 1]] as const).map(([u, dir]) => ({ at: side(u), shape: 'grip' as const, label: 'Box width',
			drag: (p: Pt, free: boolean) => widthDrag(s, sp.frame!.t, Math.max(10, (dir > 0 ? r10(p.x, free) - u0 : u1 - r10(p.x, free))), dir) ?? s })) : []),
	]
}

/** The box with its width AS SEEN along the view's `t` set to `w` (mm), the side opposite `dir` (−1 = the low-u side
 *  moves, +1 the high) staying put. Rect: its local axis most along `t` changes; ellipse: that radius; circle: its
 *  radius. Null = not a shape this can resize (a polygon). */
function widthDrag(s: Shape, t: Pt, w: number, dir: -1 | 1 | 0 = 1): Shape | null {
	const g = s.geom
	if (g.kind === 'circle') {
		if (!dir) return s
		const r = Math.max(5, w / 2), shift = (r - g.r) * dir
		return { ...s, geom: { ...g, r, centre: { x: g.centre.x + t.x * shift, y: g.centre.y + t.y * shift } } }
	}
	if (g.kind !== 'rect' && g.kind !== 'ellipse') return null
	if (!dir) return s
	const a = ((g.rot ?? 0) * Math.PI) / 180, ax = { x: Math.cos(a), y: Math.sin(a) }, ay = { x: -Math.sin(a), y: Math.cos(a) }
	const dx = Math.abs(ax.x * t.x + ax.y * t.y), dy = Math.abs(ay.x * t.x + ay.y * t.y), alongX = dx >= dy
	const axis = alongX ? ax : ay, da = alongX ? dx : dy, db = alongX ? dy : dx
	const sizeA = g.kind === 'rect' ? (alongX ? g.size.x : g.size.y) : 2 * (alongX ? g.rx : g.ry)
	const sizeB = g.kind === 'rect' ? (alongX ? g.size.y : g.size.x) : 2 * (alongX ? g.ry : g.rx)
	// projected width = sizeA·da + sizeB·db (rect) — solve for the new sizeA; an ellipse near enough the same way
	const next = Math.max(10, (w - sizeB * db) / Math.max(da, 1e-6))
	const sgn = Math.sign(axis.x * t.x + axis.y * t.y) || 1, shift = ((next - sizeA) / 2) * dir * sgn
	const centre = { x: g.centre.x + axis.x * shift, y: g.centre.y + axis.y * shift }
	const r1 = (v: number) => Math.round(v * 10) / 10
	if (g.kind === 'rect') return { ...s, geom: { ...g, centre, size: alongX ? { x: r1(next), y: g.size.y } : { x: g.size.x, y: r1(next) } } }
	return { ...s, geom: { ...g, centre, ...(alongX ? { rx: r1(next / 2) } : { ry: r1(next / 2) }) } }
}

/** RACK VIEWS (backlog "Rack elevation context"): the room's floor and ceiling lines (views/rackRow.ts marks them —
 *  FFL until the room has its own floor) as bars: dragging one sets the room's own `floorMm` / `ceilingMm` (FL ± mm,
 *  10 mm steps, Shift 50, Alt free; the ceiling stays 300 above the floor). Floor back on FFL = no own floor. */
export function roomLineHandles(prims: Prim[], room: Entity | undefined): Handle[] {
	if (room?.type !== 'space') return []
	const step = (v: number, free: boolean, coarse?: boolean) => (free ? Math.round(v) : Math.round(v / (coarse ? 50 : 10)) * (coarse ? 50 : 10))
	const out: Handle[] = []
	for (const p of prims) {
		if (p.k !== 'line' || p.src || (p.sub !== ROOM_FLOOR && p.sub !== ROOM_CEILING)) continue
		const a = p.pts[0], b = p.pts[p.pts.length - 1], floor = p.sub === ROOM_FLOOR
		out.push({ at: { x: (a.x + b.x) / 2, y: a.y }, shape: 'bar', span: [a, b], label: floor ? `${room.name}: room floor` : `${room.name}: room ceiling`,
			drag: (q, free, coarse) => {
				const v = step(-q.y, free, coarse)
				if (!floor) return { ...room, ceilingMm: Math.max(v, (room.floorMm ?? 0) + 300) }
				const f = room.ceilingMm != null ? Math.min(v, room.ceilingMm - 300) : v
				const { floorMm: _was, ...rest } = room
				return f ? { ...rest, floorMm: f } : rest
			} })
	}
	return out
}
