// A section's FRAME and its mark on the plan (the cut line, arrows, names), apart from views/section.ts (which builds the
// section VIEW from the elevation generator) so the plan generator can draw the marks without a cycle through it.
import type { Id, Pt } from '../domain/types'
import type { SectionCut } from '../domain/drawing'
import type { ProjectIndex } from '../domain/project'
import { frameFromNormal, type ElevFrame } from '../domain/conventions'
import type { Prim } from './display'

/** The section's frame: u runs along the cut as seen (from 0), depth is negative beyond the cut. */
export function sectionFrame(sec: SectionCut): { f: ElevFrame; len: number } {
	const dx = sec.b.x - sec.a.x, dy = sec.b.y - sec.a.y, len = Math.hypot(dx, dy) || 1
	const t = { x: dx / len, y: dy / len }
	// frameFromNormal(n) gives t = (n.y, −n.x); n = (−t.y, t.x) puts u along a → b and the viewer on the right, looking left
	return sec.flip ? { f: frameFromNormal({ x: t.y, y: -t.x }, sec.b), len } : { f: frameFromNormal({ x: -t.y, y: t.x }, sec.a), len }
}

/** The section's mark on its plan: the dashed cut line, an arrow at each end looking its way, its name at both ends. */
export function sectionMarks(sec: SectionCut, k: number): Prim[] {
	const { f } = sectionFrame(sec)
	const look = { x: -f.n.x, y: -f.n.y }, along = { x: f.t.x, y: f.t.y }
	const s = 2.5 * k   // arrow size: 2.5 paper mm (was 4 — Dave 2026-10-15: smaller, a room's four marks crowded it)
	const arrow = (p: Pt): Prim => ({ k: 'line', pts: [
		{ x: p.x + along.x * s * 0.5, y: p.y + along.y * s * 0.5 },
		{ x: p.x - along.x * s * 0.5, y: p.y - along.y * s * 0.5 },
		{ x: p.x + look.x * s, y: p.y + look.y * s },
	], closed: true, fill: true, cls: 'section-arrow', src: sec.id })
	const label = (p: Pt): Prim => ({ k: 'text', at: { x: p.x - look.x * s * 0.9, y: p.y - look.y * s * 0.9 + 1.2 * k }, text: sec.name, size: 2 * k, anchor: 'middle', cls: 'section-label', src: sec.id })
	return [{ k: 'line', pts: [sec.a, sec.b], cls: 'section-line', src: sec.id }, arrow(sec.a), arrow(sec.b), label(sec.a), label(sec.b)]
}

export const sectionsOn = (ix: ProjectIndex, levelId: Id): SectionCut[] =>
	ix.ofType('section').filter((e) => e.levelId === levelId).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

/** ONE elevation marker for a room's elevations (Dave 2026-10-15, instead of four crossing cut lines): a circle at the
 *  middle of the room's outline box, and for each of its elevation sections a pointer the way it looks, lettered with its
 *  letter (A–D). A pointer picks its section (a selected one shows its cut line and reach, editor/handles.ts). */
export function roomElevMarker(room: { boundary?: Pt[] }, secs: SectionCut[], k: number): Prim[] {
	const b = room.boundary
	if (!b?.length || !secs.length) return []
	const xs = b.map((p) => p.x), ys = b.map((p) => p.y)
	const c = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
	const R = 3 * k   // 3 paper mm
	const out: Prim[] = [{ k: 'circle', c, r: R, cls: 'elev-marker' }]
	for (const sec of secs) {
		const { f } = sectionFrame(sec), look = { x: -f.n.x, y: -f.n.y }, side = { x: -look.y, y: look.x }
		const at = (d: number, s: number) => ({ x: c.x + look.x * d + side.x * s, y: c.y + look.y * d + side.y * s })
		out.push({ k: 'line', pts: [at(R * 0.55, -R * 0.85), at(R * 2.1, 0), at(R * 0.55, R * 0.85)], closed: true, fill: true, cls: 'section-arrow', src: sec.id })
		const t = at(R * 1.15, 0)
		out.push({ k: 'text', at: { x: t.x, y: t.y + 0.55 * k }, text: sec.roomElev?.side ?? sec.name.slice(-1), size: 1.6 * k, anchor: 'middle', cls: 'elev-marker-letter', src: sec.id })
	}
	return out
}
