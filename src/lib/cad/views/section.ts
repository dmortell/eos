// SECTIONS (Phase 6.2): a cut line drawn on a level's plan; the view stands on the line and looks to its left as
// drawn (`flip`: the other way). It is the elevation generator (views/elevation.ts) on the section's own frame,
// limited to `depth` beyond the cut and to the line's length. Walls the line CUTS are drawn as cut (solid), with a
// gap where the line passes through an opening. On the plan the section shows as a dashed line with arrows looking
// its way and its name at both ends. Hidden lines: the opaque fills, as in elevations (Dave: no hidden-line removal).
import type { Id, Pt, Level } from '../domain/types'
import type { SectionCut } from '../domain/drawing'
import type { ProjectIndex } from '../domain/project'
import { frameFromNormal, project, unproject, type ElevFrame } from '../domain/conventions'
import { wallSpan } from '../domain/openings'
import { elevationDisplayList, type Item } from './elevation'
import type { ViewSpace } from './space'
import type { Prim } from './display'

/** The section's frame: u runs along the cut as seen (from 0), depth is negative beyond the cut. */
export function sectionFrame(sec: SectionCut): { f: ElevFrame; len: number } {
	const dx = sec.b.x - sec.a.x, dy = sec.b.y - sec.a.y, len = Math.hypot(dx, dy) || 1
	const t = { x: dx / len, y: dy / len }
	// frameFromNormal(n) gives t = (n.y, −n.x); n = (−t.y, t.x) puts u along a → b and the viewer on the right, looking left
	return sec.flip ? { f: frameFromNormal({ x: t.y, y: -t.x }, sec.b), len } : { f: frameFromNormal({ x: -t.y, y: t.x }, sec.a), len }
}

export function sectionSpace(sec: SectionCut): ViewSpace {
	const { f } = sectionFrame(sec)
	return {
		spec: { kind: 'section', sectionId: sec.id }, frame: f,
		toWorld: (p, w) => unproject(f, { u: p.x, v: -p.y }, w.depth),
		deltaToWorld: (d) => ({ x: f.t.x * d.x, y: f.t.y * d.x, z: -d.y }),
		fromWorld: (p) => { const e = project(f, p); return { x: e.u, y: -e.v } },
		depthOf: (p) => project(f, p).depth,
	}
}

export function sectionDisplayList(ix: ProjectIndex, sec: SectionCut, o: { scale: number }): Prim[] {
	const sp = sectionSpace(sec), { f, len } = sectionFrame(sec)
	return elevationDisplayList(ix, sec.levelId, sp, { scale: o.scale, range: { near: 50, far: -sec.depth, u0: 0, u1: len }, extra: cutWalls(ix, sec, f, len) })
}

/** Walls crossing the cut line: their cut faces, solid, full wall height (or slab to slab), with a gap at openings. */
function cutWalls(ix: ProjectIndex, sec: SectionCut, f: ElevFrame, len: number): Item[] {
	const level = ix.get<Level>(sec.levelId)
	const out: Item[] = []
	for (const s of ix.shapes) {
		if (s.levelId !== sec.levelId || s.role?.kind !== 'wall' || s.geom.kind !== 'path') continue
		const role = s.role, nodes = new Map(s.geom.nodes.map((n) => [n.id, n]))
		for (const sg of s.geom.segs) {
			const a = nodes.get(sg.a), b = nodes.get(sg.b)
			if (!a || !b) continue
			const pa = project(f, { ...a, z: 0 }), pb = project(f, { ...b, z: 0 })
			if ((pa.depth > 0) === (pb.depth > 0) || pa.depth === pb.depth) continue   // doesn't cross the cut
			const k = pa.depth / (pa.depth - pb.depth), u = pa.u + (pb.u - pa.u) * k
			if (u < 0 || u > len) continue
			const segLen = Math.hypot(b.x - a.x, b.y - a.y), along = segLen * k
			const w = (sg.section ?? s.section)?.w ?? 100, h = (sg.section ?? s.section)?.h ?? level?.heights.clearHeightMm ?? 2600
			// the wall's thickness measured along the cut: w / |sin| of the angle between wall and cut
			const dir = { x: (b.x - a.x) / segLen, y: (b.y - a.y) / segLen }, sin = Math.abs(dir.x * f.n.x + dir.y * f.n.y) || 1
			const half = Math.min((w / sin) / 2, w * 2)
			const span = wallSpan(ix, s) ?? { z0: a.z, z1: a.z + h }
			// openings the cut passes through leave a gap from their Z to Z + H
			const hole = role.openings.find((op) => op.segId === sg.id && Math.abs(op.at - along) <= op.width / 2)
			const bands: [number, number][] = hole ? [[span.z0, hole.z], [hole.z + hole.h, span.z1]].filter(([z0, z1]) => z1 > z0) as [number, number][] : [[span.z0, span.z1]]
			out.push({ depth: 0, prims: bands.map(([z0, z1]): Prim => ({ k: 'line', pts: [{ x: u - half, y: -z0 }, { x: u + half, y: -z0 }, { x: u + half, y: -z1 }, { x: u - half, y: -z1 }], closed: true, fill: true, cls: 'cut', src: s.id })) })
		}
	}
	return out
}

/** The section's mark on its plan: the dashed cut line, an arrow at each end looking its way, its name at both ends. */
export function sectionMarks(sec: SectionCut, k: number): Prim[] {
	const { f } = sectionFrame(sec)
	const look = { x: -f.n.x, y: -f.n.y }, along = { x: f.t.x, y: f.t.y }
	const s = 4 * k   // arrow size: 4 paper mm
	const arrow = (p: Pt): Prim => ({ k: 'line', pts: [
		{ x: p.x + along.x * s * 0.5, y: p.y + along.y * s * 0.5 },
		{ x: p.x - along.x * s * 0.5, y: p.y - along.y * s * 0.5 },
		{ x: p.x + look.x * s, y: p.y + look.y * s },
	], closed: true, fill: true, cls: 'section-arrow', src: sec.id })
	const label = (p: Pt): Prim => ({ k: 'text', at: { x: p.x - look.x * s * 0.9, y: p.y - look.y * s * 0.9 + 1.2 * k }, text: sec.name, size: 3.5 * k, anchor: 'middle', cls: 'section-label', src: sec.id })
	return [{ k: 'line', pts: [sec.a, sec.b], cls: 'section-line', src: sec.id }, arrow(sec.a), arrow(sec.b), label(sec.a), label(sec.b)]
}

export const sectionsOn = (ix: ProjectIndex, levelId: Id): SectionCut[] =>
	[...ix.byId.values()].filter((e): e is SectionCut => e.type === 'section' && e.levelId === levelId).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
