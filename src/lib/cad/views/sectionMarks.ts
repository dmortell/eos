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
	ix.ofType('section').filter((e) => e.levelId === levelId).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
