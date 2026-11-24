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
	const s = 2.5 * k   // arrow size: 2.5 paper mm (was 4 — User 2026-10-15: smaller, a room's four marks crowded it)
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

/** ONE elevation marker for a room's elevations (User 2026-10-15, instead of four crossing cut lines), drawn as the
 *  usual interior-elevation symbol (User 2026-11-24, backlog 16e: "like the Unisex Bathroom's" on the floorplan): a
 *  circle split across, the elevations' name above the line and the sheet they're on below; round it a square turned
 *  45°, each corner pointing at a wall — filled black where that wall has an elevation, lettered (A–D) outside it.
 *  It sits just BELOW the room's name (it was on it). A filled corner picks its section (a selected one shows its cut
 *  line and reach, editor/handles.ts). `sheet` = the sheet number showing them, if any. */
export function roomElevMarker(room: { boundary?: Pt[] }, secs: SectionCut[], k: number, sheet?: string): Prim[] {
	const b = room.boundary
	if (!b?.length || !secs.length) return []
	const r = 3 * k, d = r * Math.SQRT2   // circle 3 paper mm
	// the room name's spot (the outline's vertex average, as plan.ts puts it), the marker under it
	const nc = { x: b.reduce((a, q) => a + q.x, 0) / b.length, y: b.reduce((a, q) => a + q.y, 0) / b.length }
	const c = { x: nc.x, y: nc.y + d + 3 * k }   // the top corner's letter clear of the name's baseline
	// the square's four corners: along the first elevation's look and at right angles to it
	const f0 = sectionFrame(secs[0]).f, l0 = { x: -f0.n.x, y: -f0.n.y }
	const dirs = [l0, { x: -l0.y, y: l0.x }, { x: -l0.x, y: -l0.y }, { x: l0.y, y: -l0.x }]
	const P = (u: Pt, s: number) => ({ x: c.x + u.x * s, y: c.y + u.y * s })
	const out: Prim[] = [
		// the square first (its corners' black on top), then the circle filled white over its middle
		{ k: 'line', pts: dirs.map((u) => P(u, d)), closed: true, cls: 'elev-marker' },
		{ k: 'circle', c, r, cls: 'elev-marker-disc' },
	]
	for (const sec of secs) {
		const { f } = sectionFrame(sec), look = { x: -f.n.x, y: -f.n.y }
		// the corner nearest its look
		const u = dirs.reduce((best, q) => (q.x * look.x + q.y * look.y > best.x * look.x + best.y * look.y ? q : best))
		const a0 = Math.atan2(u.y, u.x)
		// the black corner: the square's tip and its sides down to where they touch the circle, round the circle between
		const arc = Array.from({ length: 9 }, (_, i) => { const a = a0 - Math.PI / 4 + (i * Math.PI) / 16; return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) } })
		const tip = P(u, d)
		out.push({ k: 'line', pts: [tip, ...arc.reverse()], closed: true, fill: true, cls: 'elev-corner', src: sec.id })
		const t = P(u, d + 1.4 * k)
		out.push({ k: 'text', at: { x: t.x, y: t.y + 0.55 * k }, text: sec.roomElev?.side ?? sec.name.slice(-1), size: 1.6 * k, anchor: 'middle', cls: 'elev-marker-letter', src: sec.id })
	}
	// inside: the split, the elevations' name (their names less the letter) above, the sheet below
	const side = (x: SectionCut) => x.roomElev?.side ?? x.name.slice(-1)
	const id = secs[0].name.replace(new RegExp(`\\s*${side(secs[0]).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '').trim()
	out.push({ k: 'line', pts: [{ x: c.x - r, y: c.y }, { x: c.x + r, y: c.y }], cls: 'elev-marker' })
	if (id) out.push({ k: 'text', at: { x: c.x, y: c.y - 0.35 * k }, text: id, size: 1.2 * k, anchor: 'middle', cls: 'elev-marker-id' })
	if (sheet) out.push({ k: 'text', at: { x: c.x, y: c.y + 1.45 * k }, text: sheet, size: 1.2 * k, anchor: 'middle', cls: 'elev-marker-id' })
	return out
}

/** The sheet number a room's elevations are shown on (the first sheet with a viewport of one of them), if any. */
export function elevSheet(ix: ProjectIndex, secs: SectionCut[]): string | undefined {
	const ids = new Set(secs.map((s) => s.id))
	const sh = ix.ofType('sheet').filter((s) => s.status !== 'archived').sort((a, b) => a.order - b.order)
		.find((s) => s.viewports.some((v) => v.view.spec.kind === 'section' && ids.has(v.view.spec.sectionId)))
	return sh?.number
}
