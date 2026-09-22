// Grip definitions + grip-pick for the Pages tool (review.md §R1, step 4). Extracted from
// Viewport.svelte so the grip geometry is testable and shared. Grip-pick takes a Mapper (built ONCE per
// press) and reuses m.toClient per corner, so an N-grip object costs one layout read, not N (the P1 fix).
// The entity/model grip builders (gripsFor/modelGrips/…) move here in later slices; this first slice is
// the self-contained section-marker grips.
import type { Pt } from './geometry'
import type { Clip } from '../3dview/types'
import type { Mapper } from './mapper'
import { sectionCorners } from './hit'

/** Resize a section clip by dragging a corner to p, holding `anchor` (the opposite corner, captured at
 *  grip-down) fixed — x/y only, z stays the section's cut band. Returns the new clip. */
export function resizeSectionClip(c: Clip, p: Pt, anchor: Pt): Clip {
	return { ...c, x0: Math.round(Math.min(p[0], anchor[0])), x1: Math.round(Math.max(p[0], anchor[0])), y0: Math.round(Math.min(p[1], anchor[1])), y1: Math.round(Math.max(p[1], anchor[1])) }
}

/** Which corner grip of the selected section a press grabs (14px screen tolerance), with a resize apply
 *  about the fixed opposite corner. One getBoundingClientRect for the whole 4-corner pass (P1). null =
 *  no grip under the cursor. */
export function pickSectionGrip(m: Mapper, sel: { id: string; clip: Clip }, clientX: number, clientY: number): { id: string; apply: (p: Pt) => Clip } | null {
	const cs = sectionCorners(sel.clip), c0 = { ...sel.clip }
	for (let gi = 0; gi < 4; gi++) {
		const sp = m.toClient(cs[gi][0], cs[gi][1])
		if (Math.hypot(sp.x - clientX, sp.y - clientY) < 14) return { id: sel.id, apply: (p: Pt) => resizeSectionClip(c0, p, cs[(gi + 2) % 4]) }
	}
	return null
}
