// EDITING INSIDE A VIEWPORT (UX review S5 / UX17; Dave: "editing inside viewports, from Pages and Sheets"): what a
// tool needs to work in a sheet viewport's own view — its space (plan / elevation / section / rack row), its pickable
// prims in view mm, and the maps between paper mm and view mm. Pure.
import type { ProjectIndex } from '../domain/project'
import type { Id, Pt } from '../domain/types'
import type { Sheet, Viewport, SectionCut } from '../domain/drawing'
import type { Prim, Bounds } from './display'
import { viewportContent, sheetLook, toPaper, fromPaper, type SheetOpts } from './sheet'
import { sectionSpace } from './section'
import { spaceOf, type ViewSpace } from './space'

export interface VpFrame {
	vp: Viewport
	space: ViewSpace
	levelId: Id
	/** The view's prims in VIEW mm, with their `src` (pickable). */
	prims: Prim[]
	toPaper: (p: Pt) => Pt
	fromPaper: (p: Pt) => Pt
	/** The window on the paper. */
	window: Bounds
}

export function viewportFrame(ix: ProjectIndex, sheet: Sheet, vpId: Id, o: SheetOpts = {}): VpFrame | null {
	const vp = sheet.viewports.find((v) => v.id === vpId)
	if (!vp) return null
	const spec = vp.view.spec
	const sec = spec.kind === 'section' ? ix.get<SectionCut>(spec.sectionId) : undefined
	if (spec.kind === 'section' && sec?.type !== 'section') return null
	const space = sec?.type === 'section' ? sectionSpace(sec) : spaceOf(spec)
	const r = vp.rect
	return { vp, space, levelId: vp.view.levelId, prims: viewportContent(ix, vp, sheetLook(sheet, o)), toPaper: toPaper(vp), fromPaper: fromPaper(vp), window: { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h } }
}

export const inWindow = (f: VpFrame, p: Pt) => p.x >= f.window.x0 && p.x <= f.window.x1 && p.y >= f.window.y0 && p.y <= f.window.y1
