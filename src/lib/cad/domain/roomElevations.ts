// ROOM ELEVATIONS A–D (User 2026-10-15; later.md B35 "elevation of this wall" needed room outlines, which the Room tool
// now draws): a room's four walls as four sections, each looking at its wall from inside. The cut line runs through
// the room's middle, parallel to the wall, as wide as the room; it reaches just past the wall. Square to the room's
// outline box (an odd-shaped room gets the four sides of its box). Named "<room> A" … "D": A looks to −y (the wall at the top of the plan), then clockwise: B +x,
// B +x, C +y, D −x (User 2026-10-15: A–D kept, not T / R / B / L). Each records its room and side (`roomElev`): the plan draws one marker for them. Pure; the Section tool's Room elevations item makes them (editor/sectionTool.ts).
import type { Id, Pt, Space } from './types'
import type { SectionCut } from './drawing'

/** How far past the wall a room elevation reaches (the wall's thickness and what's fixed to it). */
export const PAST_WALL_MM = 300

/** The room's four elevation sections (new ids from `newId`); `taken` names on the level are left out. */
export function roomElevations(room: Space, newId: () => Id, taken: string[] = []): SectionCut[] {
	const b = room.boundary
	if (!b?.length) return []
	const xs = b.map((p) => p.x), ys = b.map((p) => p.y)
	const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
	const c: Pt = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }
	const used = new Set(taken)
	const walls: { letter: 'A' | 'B' | 'C' | 'D'; look: Pt; reach: number; width: number }[] = [
		{ letter: 'A', look: { x: 0, y: -1 }, reach: c.y - y0, width: x1 - x0 },
		{ letter: 'B', look: { x: 1, y: 0 }, reach: x1 - c.x, width: y1 - y0 },
		{ letter: 'C', look: { x: 0, y: 1 }, reach: y1 - c.y, width: x1 - x0 },
		{ letter: 'D', look: { x: -1, y: 0 }, reach: c.x - x0, width: y1 - y0 },
	]
	return walls.filter((w) => !used.has(`${room.name} ${w.letter}`) && w.width > 0).map((w): SectionCut => {
		// a section looks to the left of a → b (views/sectionMarks.ts): along t = (−look.y, look.x)
		const t = { x: -w.look.y, y: w.look.x }, h = w.width / 2
		return { type: 'section', id: newId(), levelId: room.levelId, name: `${room.name} ${w.letter}`, roomElev: { roomId: room.id, side: w.letter },
			a: { x: c.x - t.x * h, y: c.y - t.y * h }, b: { x: c.x + t.x * h, y: c.y + t.y * h }, depth: Math.round(w.reach + PAST_WALL_MM) }
	})
}
